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
from app.papers import BY_ID
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


def _schedule(test: dict, now: float, taken: bool) -> dict:
    """Where the test stands on the calendar, for the student's schedule.

    minutes_left: minutes until an open test closes (None if it never closes);
    opens_in_minutes: minutes until an upcoming test opens;
    overdue: the window has closed and the student never took the test.
    """
    state = _window(test, now)
    here = datetime.fromtimestamp(now, tz=clock.INDIA).replace(tzinfo=None)

    def minutes(until: str, extra: int = 0) -> int:
        gap = datetime.strptime(until, "%Y-%m-%dT%H:%M") - here
        return max(0, -(-(int(gap.total_seconds()) + extra) // 60))

    return {
        "overdue": state == "ended" and not taken,
        "minutes_left": minutes(test["end_at"], 60) if state == "open" and test.get("end_at") else None,
        "opens_in_minutes": minutes(test["start_at"]) if state == "upcoming" and test.get("start_at") else None,
    }


def _visible(scoped: TenantRepo, member: dict, test: dict | None) -> bool:
    if test and test.get("practice_for"):
        return test["practice_for"] == member["email"] and test.get("status") == "published"
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
    topics: dict[str, list[int]] = {}  # "subject|topic" -> [right, wrong, not answered], for the student's results across tests
    for question_id in ids:
        question = bank.get(question_id)
        answer = given.get(question_id)
        if answer is None or question is None:
            blank += 1
            results[question_id] = "u"
            slot = 2
        elif answer_rules.is_correct(question, answer):
            right += 1
            results[question_id] = "c"
            slot = 0
        else:
            wrong += 1
            results[question_id] = "w"
            slot = 1
        if question is not None:
            topics.setdefault(f"{question['paper']}|{question['topic']}", [0, 0, 0])[slot] += 1
    per_right, per_wrong = Decimal(attempt["marks_correct"]), Decimal(attempt["marks_incorrect"])
    marks = per_right * right + per_wrong * wrong
    total = per_right * len(ids)
    percentage = (max(marks, Decimal(0)) / total * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if total else Decimal(0)
    return {
        "correct": right, "wrong": wrong, "unanswered": blank, "results": results, "topics": topics,
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


def result_view(scoped: TenantRepo, storage: ContentStorage, attempt: dict, force_review: bool = False) -> dict:
    """A finished attempt: the score, and, when the test allows it, every question with the right answer and the reasons.
    The admin sees the review whatever the test says (force_review)."""
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
    if attempt["show_answers"] or force_review:
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
        "kind": test.get("kind") or "test", "free": bool(test.get("free")), "year": test.get("year"),
        "practice": bool(test.get("practice_for")), "set_by": test.get("created_by") if test.get("practice_for") and test.get("created_by") != member["email"] else None,
        "start_at": test.get("start_at"), "end_at": test.get("end_at"),
        "duration_minutes": test["duration_minutes"], "max_attempts": test["max_attempts"],
        "pass_percentage": test["pass_percentage"], "marks_correct": test["marks_correct"], "marks_incorrect": test["marks_incorrect"],
        "show_answers": test["show_answers"], "question_count": count, "total_marks": _fmt(total),
        "state": _window(test, clock.now()),
        **_schedule(test, clock.now(), bool(attempts)),
        "attempts_used": len(attempts), "attempts_left": max(0, test["max_attempts"] - len(attempts)),
        "in_progress": running["number"] if running else None,
        "best": {"marks": best["marks"], "percentage": best["percentage"], "passed": best["passed"]} if best else None,
        "attempts": [_attempt_line(a) for a in attempts],
    }


def list_tests(scoped: TenantRepo, member: dict) -> list[dict]:
    """Published tests for the courses this student can open now."""
    mine = _active_courses(scoped, member)
    tests = [t for t in scoped.list_tests() if t.get("status") == "published" and set(t.get("courses") or []) & mine]
    tests += [t for t in scoped.list_practice(member["email"]) if t.get("status") == "published"]
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
        scoped.count_test_attempt(test_id)
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


# ---- The admin's view of students' results ----

def _seconds_between(start: str | None, end: str | None) -> int | None:
    try:
        return max(0, int((datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds()))
    except (TypeError, ValueError):
        return None


def _names(scoped: TenantRepo, emails: set[str]) -> dict[str, str]:
    names = {}
    for email in emails:
        person = scoped.get_member(email) or {}
        names[email] = " ".join(part for part in (person.get("first_name"), person.get("last_name")) if part) or email
    return names


def admin_results(scoped: TenantRepo, test_id: str, limit: int | None = None, offset: int = 0) -> tuple[dict, int | None]:
    """Everything the admin's results page shows for one test: a summary, the attempts, and how each question went.

    The summary and question figures always cover every attempt. With a limit, only one page of attempts is returned,
    from `offset`, and the offset of the next page is returned too (None when there are no more)."""
    test = scoped.get_test(test_id)
    if test is None:
        raise TestNotAvailable()
    attempts = [_settle(scoped, a) for a in scoped.list_test_attempts(test_id)]
    names = _names(scoped, {a["email"] for a in attempts})
    rows = []
    for a in attempts:
        row = {
            "email": a["email"], "name": names[a["email"]], "number": a["number"], "status": a["status"], "started_at": a["started_at"],
            "submitted_at": a.get("submitted_at"), "auto_submitted": bool(a.get("auto_submitted")),
        }
        if a["status"] == "submitted":
            row.update(
                marks=a["marks"], total_marks=a["total_marks"], percentage=a["percentage"], passed=a["passed"],
                correct=a["correct"], wrong=a["wrong"], unanswered=a["unanswered"],
                seconds=_seconds_between(a["started_at"], a.get("submitted_at")),
            )
        rows.append(row)
    done = [a for a in attempts if a["status"] == "submitted"]
    percentages = [Decimal(a["percentage"]) for a in done]
    buckets = [0] * 10
    for value in percentages:
        buckets[min(9, int(value // 10))] += 1
    summary = {
        "students": len({a["email"] for a in attempts}),
        "attempts": len(attempts),
        "submitted": len(done),
        "in_progress": len(attempts) - len(done),
        "average": _fmt((sum(percentages) / len(percentages)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) if percentages else None,
        "highest": _fmt(max(percentages)) if percentages else None,
        "lowest": _fmt(min(percentages)) if percentages else None,
        "passed": sum(1 for a in done if a["passed"]),
        "pass_rate": _fmt((Decimal(sum(1 for a in done if a["passed"])) * 100 / len(done)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)) if done else None,
        "distribution": buckets,
    }
    next_offset = None
    if limit is not None:
        next_offset = offset + limit if offset + limit < len(rows) else None
        rows = rows[offset:offset + limit]
    return {
        "test": {
            "id": test["id"], "title": test["title"], "question_count": len(test.get("question_ids") or []), "pass_percentage": test["pass_percentage"],
            "marks_correct": test["marks_correct"], "marks_incorrect": test["marks_incorrect"],
        },
        "summary": summary,
        "attempts": rows,
        "questions": _question_stats(scoped, test, done),
    }, next_offset


def _question_stats(scoped: TenantRepo, test: dict, done: list[dict]) -> list[dict]:
    """For each question of the test: how many students answered it, got it right, and which wrong option was chosen most."""
    out = []
    for question_id in test.get("question_ids") or []:
        question = scoped.get_question(question_id)
        if question is None:
            continue
        faced = [a for a in done if question_id in a["question_ids"]]
        right = sum(1 for a in faced if a["results"].get(question_id) == "c")
        answered = sum(1 for a in faced if a["results"].get(question_id) in ("c", "w"))
        top = None
        if question.get("kind", "mcq") == "mcq":
            wrong = [(a.get("answers") or {}).get(question_id) for a in faced if a["results"].get(question_id) == "w"]
            counts: dict[int, int] = {}
            for choice in wrong:
                if isinstance(choice, int):
                    counts[choice] = counts.get(choice, 0) + 1
            if counts:
                option, number = max(counts.items(), key=lambda item: (item[1], -item[0]))
                top = {"option": option, "count": number, "text": question["options"][option]["text"]}
        out.append({
            "id": question_id, "text": question["text"], "kind": question.get("kind", "mcq"), "topic": question["topic"],
            "difficulty": question.get("difficulty"), "faced": len(faced), "answered": answered, "correct": right,
            "percent_correct": _fmt((Decimal(right) * 100 / len(faced)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)) if faced else None,
            "most_chosen_wrong": top,
        })
    return out


def admin_attempt(scoped: TenantRepo, storage: ContentStorage, test_id: str, email: str, number: int) -> dict:
    """One student's attempt as the admin sees it: the score and every question with the right answer, whatever the test says."""
    attempt = scoped.get_attempt(email, test_id, number)
    if attempt is None:
        raise AttemptNotFound()
    attempt = _settle(scoped, attempt)
    person = _names(scoped, {email})
    if attempt["status"] != "submitted":
        return {
            "status": "in_progress", "test_id": test_id, "number": number, "title": attempt["title"], "started_at": attempt["started_at"],
            "student": {"email": email, "name": person[email]}, "answered": len(attempt.get("answers") or {}), "questions": len(attempt["question_ids"]),
        }
    return {**result_view(scoped, storage, attempt, force_review=True), "student": {"email": email, "name": person[email]}}


# ---- A student's results across all their tests ----

TREND_ATTEMPTS = 10


def _accuracy(right: int, total: int) -> str:
    return _fmt((Decimal(right) * 100 / total).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)) if total else "0"


def by_subject(done: list[dict]) -> list[dict]:
    """Accuracy by subject and by topic, across the given submitted attempts. Weakest first."""
    totals: dict[str, list[int]] = {}
    for a in done:
        for key, counts in (a.get("topics") or {}).items():
            have = totals.setdefault(key, [0, 0, 0])
            for slot in range(3):
                have[slot] += int(counts[slot])
    subjects: dict[str, dict] = {}
    for key, (right, wrong, blank) in totals.items():
        paper, _, topic = key.partition("|")
        subject = subjects.setdefault(paper, {"id": paper, "name": BY_ID[paper]["name"] if paper in BY_ID else paper, "correct": 0, "questions": 0, "topics": []})
        faced = right + wrong + blank
        subject["correct"] += right
        subject["questions"] += faced
        subject["topics"].append({"topic": topic, "correct": right, "wrong": wrong, "unanswered": blank, "questions": faced, "accuracy": _accuracy(right, faced)})
    for subject in subjects.values():
        subject["accuracy"] = _accuracy(subject["correct"], subject["questions"])
        subject["topics"].sort(key=lambda t: (Decimal(t["accuracy"]), t["topic"]))
    ordered = sorted(subjects.values(), key=lambda s: (Decimal(s["accuracy"]), s["name"]))
    return ordered


def my_results(scoped: TenantRepo, member: dict) -> dict:
    """Everything the student's results page shows: totals, a score trend, every finished attempt, and accuracy by subject and topic."""
    attempts = [_settle(scoped, a) for a in scoped.list_attempts(member["email"])]
    done = sorted((a for a in attempts if a["status"] == "submitted"), key=lambda a: (a["started_at"], a["test_id"], a["number"]))
    percentages = [Decimal(a["percentage"]) for a in done]
    taken: dict[str, bool] = {}
    for a in done:
        taken[a["test_id"]] = taken.get(a["test_id"], False) or bool(a["passed"])
    summary = {
        "tests_taken": len(taken),
        "attempts": len(done),
        "in_progress": len(attempts) - len(done),
        "average": _fmt((sum(percentages) / len(percentages)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)) if percentages else None,
        "best": _fmt(max(percentages)) if percentages else None,
        "tests_passed": sum(1 for passed in taken.values() if passed),
    }
    rows = [
        {
            "test_id": a["test_id"], "title": a["title"], "number": a["number"], "started_at": a["started_at"], "submitted_at": a.get("submitted_at"),
            "marks": a["marks"], "total_marks": a["total_marks"], "percentage": a["percentage"], "passed": a["passed"],
            "auto_submitted": bool(a.get("auto_submitted")), "show_answers": a["show_answers"],
        }
        for a in reversed(done)
    ]
    trend = [{"title": r["title"], "number": r["number"], "percentage": r["percentage"], "passed": r["passed"], "started_at": r["started_at"]} for r in reversed(rows[:TREND_ATTEMPTS])]

    ordered = by_subject(done)
    return {"summary": summary, "trend": trend, "attempts": rows, "subjects": ordered}
