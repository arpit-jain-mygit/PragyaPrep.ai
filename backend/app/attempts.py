"""A student taking a test: which tests they can see, starting and resuming an attempt, saving answers, the clock,
scoring, and the result and review.

An attempt is stored with the student and freezes the test's questions and marking when it starts, so a later edit to
the test never changes a score. The clock is the server's: the deadline is fixed when the attempt starts, answers are
refused after it, and an attempt that runs out is submitted by the system with whatever was saved.
Correct answers and reasons are never sent to a student before they submit, and only after if the test allows it."""
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from app import answers as answer_rules
from app import clock, content
from app.repo import ConflictError, TenantRepo, now_iso
from app.storage import ContentStorage
from app.tenants import ValidationError

PICTURE_LINK_SECONDS = 3600
GRACE_SECONDS = 3  # a save that arrives a moment after the deadline (slow network) still counts
MAX_TYPED = 200


class TestNotAvailable(Exception):
    """The student can't see this test. The caller says 'not found', so nobody learns what exists."""

    __test__ = False


class AttemptNotFound(Exception):
    pass


class CannotStart(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class TimeIsUp(Exception):
    """The attempt's time ran out. It has been submitted by the system; 'result' is what the student scored."""

    def __init__(self, result: dict):
        super().__init__("Time is up")
        self.result = result


# ---- Which tests a student can see ----

def _active_courses(scoped: TenantRepo, member: dict) -> set[str]:
    return {a["course_id"] for a in scoped.list_access(member["email"]) if content.is_active(a)}


def _window(test: dict, now: float) -> str:
    """'upcoming' before the start, 'open' between start and end, 'ended' after the end (India time)."""
    here = datetime.fromtimestamp(now, tz=clock.INDIA).replace(tzinfo=None)
    start, end = test.get("start_at"), test.get("end_at")
    if start and here < datetime.strptime(start, "%Y-%m-%dT%H:%M"):
        return "upcoming"
    if end and here > datetime.strptime(end, "%Y-%m-%dT%H:%M").replace(second=59):
        return "ended"
    return "open"


def _visible(scoped: TenantRepo, member: dict, test: dict | None) -> bool:
    return bool(test) and test.get("status") == "published" and bool(set(test.get("courses") or []) & _active_courses(scoped, member))


def visible_test(scoped: TenantRepo, member: dict, test_id: str) -> dict:
    test = scoped.get_test(test_id)
    if not _visible(scoped, member, test):
        raise TestNotAvailable()
    return test


# ---- Scoring ----

def _fmt(value: Decimal) -> str:
    text = format(value.normalize(), "f")
    return "0" if text in ("-0", "") else text


def _given_ok(question: dict, given) -> tuple[bool, object]:
    """Is this a usable answer for the question? Returns (ok, the value to keep; None clears)."""
    if given is None or given == "":
        return True, None
    if question.get("kind", "mcq") == "mcq":
        ok = isinstance(given, int) and not isinstance(given, bool) and 0 <= given < len(question["options"])
        return ok, given
    if isinstance(given, bool) or not isinstance(given, (str, int, float)):
        return False, None
    text = " ".join(str(given).split())
    return (len(text) <= MAX_TYPED, text)


def score(attempt: dict, bank: dict[str, dict]) -> dict:
    """Mark an attempt from its saved answers. Unanswered questions score nothing."""
    ids = attempt["question_ids"]
    given = attempt.get("answers") or {}
    right = wrong = blank = 0
    results = {}
    for question_id in ids:
        question = bank.get(question_id)
        answer = given.get(question_id)
        if answer is None or question is None:
            blank += 1
            results[question_id] = "u"
        elif answer_rules.is_correct(question, answer):
            right += 1
            results[question_id] = "c"
        else:
            wrong += 1
            results[question_id] = "w"
    per_right, per_wrong = Decimal(attempt["marks_correct"]), Decimal(attempt["marks_incorrect"])
    marks = per_right * right + per_wrong * wrong
    total = per_right * len(ids)
    percentage = (max(marks, Decimal(0)) / total * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if total else Decimal(0)
    return {
        "correct": right, "wrong": wrong, "unanswered": blank, "results": results,
        "marks": _fmt(marks), "total_marks": _fmt(total), "percentage": _fmt(percentage),
        "passed": percentage >= Decimal(attempt["pass_percentage"]),
    }


def _bank(scoped: TenantRepo, ids: list[str]) -> dict[str, dict]:
    out = {}
    for question_id in ids:
        question = scoped.get_question(question_id)
        if question:
            out[question_id] = question
    return out


def _finish(scoped: TenantRepo, attempt: dict, auto: bool) -> dict:
    """Submit an attempt: mark it and keep the result. Safe to call again; a finished attempt is left as it is."""
    if attempt["status"] == "submitted":
        return attempt
    done = score(attempt, _bank(scoped, attempt["question_ids"]))
    fields = {**done, "status": "submitted", "submitted_at": now_iso(), "auto_submitted": auto}
    scoped.update_attempt(attempt["email"], attempt["test_id"], attempt["number"], fields)
    return {**attempt, **fields}


def _settle(scoped: TenantRepo, attempt: dict) -> dict:
    """If an in-progress attempt has run out of time, submit it now."""
    if attempt["status"] == "in_progress" and clock.now() > attempt["deadline"]:
        return _finish(scoped, attempt, auto=True)
    return attempt


# ---- What a student is shown ----

def _safe_question(scoped: TenantRepo, storage: ContentStorage, question: dict, passages: dict) -> dict:
    """A question as a student sees it during the test: no correct answer, no reasons, no explanation."""
    passage = question.get("passage")
    if passage and passage not in passages:
        found = scoped.get_passage(passage)
        passages[passage] = found["text"] if found else None
    return {
        "id": question["id"],
        "kind": question.get("kind", "mcq"),
        "text": question["text"],
        "options": [{"text": option["text"]} for option in question.get("options") or []],
        "images": {
            slot: storage.presigned_download(picture["key"], picture["content_type"], PICTURE_LINK_SECONDS)
            for slot, picture in (question.get("images") or {}).items()
        },
        "passage": passage,
        "passage_text": passages.get(passage) if passage else None,
    }


def _remaining(attempt: dict) -> int:
    return max(0, int(attempt["deadline"] - clock.now()))


def attempt_view(scoped: TenantRepo, storage: ContentStorage, attempt: dict) -> dict:
    """An attempt in progress: its questions (without answers), what was saved, and the seconds left."""
    bank = _bank(scoped, attempt["question_ids"])
    passages: dict = {}
    return {
        "status": "in_progress",
        "test_id": attempt["test_id"],
        "number": attempt["number"],
        "title": attempt["title"],
        "started_at": attempt["started_at"],
        "duration_minutes": attempt["duration_minutes"],
        "remaining_seconds": _remaining(attempt),
        "questions": [_safe_question(scoped, storage, bank[i], passages) for i in attempt["question_ids"] if i in bank],
        "answers": attempt.get("answers") or {},
    }


def result_view(scoped: TenantRepo, storage: ContentStorage, attempt: dict) -> dict:
    """A finished attempt: the score, and, when the test allows it, every question with the right answer and the reasons."""
    out = {
        "status": "submitted",
        "test_id": attempt["test_id"],
        "number": attempt["number"],
        "title": attempt["title"],
        "started_at": attempt["started_at"],
        "submitted_at": attempt.get("submitted_at"),
        "auto_submitted": bool(attempt.get("auto_submitted")),
        "correct": attempt["correct"],
        "wrong": attempt["wrong"],
        "unanswered": attempt["unanswered"],
        "marks": attempt["marks"],
        "total_marks": attempt["total_marks"],
        "percentage": attempt["percentage"],
        "passed": attempt["passed"],
        "pass_percentage": attempt["pass_percentage"],
        "marks_correct": attempt["marks_correct"],
        "marks_incorrect": attempt["marks_incorrect"],
        "show_answers": attempt["show_answers"],
        "review": None,
    }
    if attempt["show_answers"]:
        bank = _bank(scoped, attempt["question_ids"])
        passages: dict = {}
        review = []
        for question_id in attempt["question_ids"]:
            question = bank.get(question_id)
            if question is None:
                continue
            shown = _safe_question(scoped, storage, question, passages)
            kind = question.get("kind", "mcq")
            review.append({
                **shown,
                "result": attempt["results"].get(question_id, "u"),
                "given": (attempt.get("answers") or {}).get(question_id),
                "correct": question.get("correct") if kind == "mcq" else None,
                "reasons": [option.get("why") for option in question.get("options") or []] if kind == "mcq" else [],
                "answer": answer_rules_shown(question) if kind == "fill_in" else None,
                "explanation": question.get("explanation") if kind == "fill_in" else None,
            })
        out["review"] = review
    return out


def answer_rules_shown(question: dict) -> str:
    answer = question.get("answer") or {}
    if answer.get("type") == "number":
        return answer["value"] + (f" (within {answer['tolerance']})" if answer.get("tolerance") not in (None, "0") else "")
    return " or ".join(answer.get("accepted") or [])


def _attempt_line(attempt: dict) -> dict:
    line = {"number": attempt["number"], "status": attempt["status"], "started_at": attempt["started_at"]}
    if attempt["status"] == "submitted":
        line.update(
            submitted_at=attempt.get("submitted_at"), marks=attempt["marks"], total_marks=attempt["total_marks"],
            percentage=attempt["percentage"], passed=attempt["passed"], auto_submitted=bool(attempt.get("auto_submitted")),
        )
    return line


def test_card(scoped: TenantRepo, member: dict, test: dict) -> dict:
    """A test as the student's list shows it: the rules, whether it is open, and how their attempts stand."""
    attempts = [_settle(scoped, a) for a in scoped.list_attempts(member["email"], test["id"])]
    done = [a for a in attempts if a["status"] == "submitted"]
    running = next((a for a in attempts if a["status"] == "in_progress"), None)
    best = max(done, key=lambda a: Decimal(a["percentage"]), default=None)
    count = len(test.get("question_ids") or [])
    total = Decimal(test["marks_correct"]) * count
    return {
        "id": test["id"], "title": test["title"], "description": test.get("description") or "",
        "start_at": test.get("start_at"), "end_at": test.get("end_at"),
        "duration_minutes": test["duration_minutes"], "max_attempts": test["max_attempts"],
        "pass_percentage": test["pass_percentage"], "marks_correct": test["marks_correct"], "marks_incorrect": test["marks_incorrect"],
        "show_answers": test["show_answers"], "question_count": count, "total_marks": _fmt(total),
        "state": _window(test, clock.now()),
        "attempts_used": len(attempts), "attempts_left": max(0, test["max_attempts"] - len(attempts)),
        "in_progress": running["number"] if running else None,
        "best": {"marks": best["marks"], "percentage": best["percentage"], "passed": best["passed"]} if best else None,
        "attempts": [_attempt_line(a) for a in attempts],
    }


def list_tests(scoped: TenantRepo, member: dict) -> list[dict]:
    """Published tests for the courses this student can open now."""
    mine = _active_courses(scoped, member)
    tests = [t for t in scoped.list_tests() if t.get("status") == "published" and set(t.get("courses") or []) & mine]
    return [test_card(scoped, member, t) for t in tests]


# ---- Taking a test ----

def start(scoped: TenantRepo, member: dict, test_id: str) -> dict:
    """Begin an attempt, or carry on with the one in progress. Returns the stored attempt."""
    test = visible_test(scoped, member, test_id)
    attempts = [_settle(scoped, a) for a in scoped.list_attempts(member["email"], test_id)]
    running = next((a for a in attempts if a["status"] == "in_progress"), None)
    if running:
        return running
    state = _window(test, clock.now())
    if state == "upcoming":
        raise CannotStart("This test isn't open yet.")
    if state == "ended":
        raise CannotStart("This test has ended.")
    if len(attempts) >= test["max_attempts"]:
        raise CannotStart("You have used all your attempts for this test.")
    if not test.get("question_ids"):
        raise CannotStart("This test has no questions.")
    now = clock.now()
    attempt = {
        "email": member["email"], "test_id": test_id, "number": len(attempts) + 1, "status": "in_progress",
        "started_at": now_iso(), "deadline": int(now + test["duration_minutes"] * 60),
        "title": test["title"], "duration_minutes": test["duration_minutes"], "pass_percentage": test["pass_percentage"],
        "marks_correct": test["marks_correct"], "marks_incorrect": test["marks_incorrect"], "show_answers": test["show_answers"],
        "question_ids": list(test["question_ids"]), "answers": {},
    }
    try:
        scoped.create_attempt(attempt)
    except ConflictError:  # a second click at the same moment: carry on with the one that won
        again = [a for a in scoped.list_attempts(member["email"], test_id) if a["status"] == "in_progress"]
        if again:
            return again[0]
        raise CannotStart("Please try again.")
    return attempt


def _own(scoped: TenantRepo, member: dict, test_id: str, number: int) -> dict:
    attempt = scoped.get_attempt(member["email"], test_id, number)
    if attempt is None:
        raise AttemptNotFound()
    return _settle(scoped, attempt)


def get_attempt(scoped: TenantRepo, storage: ContentStorage, member: dict, test_id: str, number: int) -> dict:
    attempt = _own(scoped, member, test_id, number)
    if attempt["status"] == "submitted":
        return result_view(scoped, storage, attempt)
    return attempt_view(scoped, storage, attempt)


def save_answers(scoped: TenantRepo, storage: ContentStorage, member: dict, test_id: str, number: int, given) -> dict:
    """Save some answers (a map of question id to answer; empty or null clears one). Refused after the deadline."""
    attempt = scoped.get_attempt(member["email"], test_id, number)
    if attempt is None:
        raise AttemptNotFound()
    if attempt["status"] == "submitted":
        raise TimeIsUp(result_view(scoped, storage, attempt))
    if clock.now() > attempt["deadline"] + GRACE_SECONDS:
        raise TimeIsUp(result_view(scoped, storage, _finish(scoped, attempt, auto=True)))
    if not isinstance(given, dict) or not given:
        raise ValidationError("Send at least one answer.")
    saved = dict(attempt.get("answers") or {})
    for question_id, value in given.items():
        if question_id not in attempt["question_ids"]:
            raise ValidationError("That question isn't in this test.")
        question = scoped.get_question(question_id)
        if question is None:
            raise ValidationError("That question is no longer available.")
        ok, keep = _given_ok(question, value)
        if not ok:
            raise ValidationError("That isn't a valid answer.")
        if keep is None:
            saved.pop(question_id, None)
        else:
            saved[question_id] = keep
    scoped.update_attempt(member["email"], test_id, number, {"answers": saved})
    return {"saved": len(given), "remaining_seconds": _remaining(attempt)}


def submit(scoped: TenantRepo, storage: ContentStorage, member: dict, test_id: str, number: int) -> dict:
    attempt = scoped.get_attempt(member["email"], test_id, number)
    if attempt is None:
        raise AttemptNotFound()
    return result_view(scoped, storage, _finish(scoped, attempt, auto=clock.now() > attempt["deadline"]))
