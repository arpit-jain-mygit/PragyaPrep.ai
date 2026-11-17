"""Tests (quizzes) that an admin builds from the question bank and assigns to courses.

A test has a window (start and end, India time), a duration, a limit on attempts, a pass mark, marks for a right and a
wrong answer, whether students may see the correct answers afterwards, the courses it is assigned to, and its
questions. Questions are added by hand or picked at random from rules (subject, topic, level, how many); either way
the test stores a fixed list, so every student gets the same questions. Only published questions can be added, and
questions that belong to a passage always come together with the rest of that passage."""
import random
from datetime import datetime
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from app import questions
from app.papers import BY_ID
from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

STATUSES = ["draft", "published"]
MODES = ["manual", "auto"]
MAX_QUESTIONS = 500
MAX_RULES = 20
TIME_FORMAT = "%Y-%m-%dT%H:%M"
rng = random.Random()  # replaced in tests so the random pick can be repeated


class TestNotFound(Exception):
    __test__ = False  # not a pytest test class


def _int(raw, low: int, high: int) -> int | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, str) and raw.strip().lstrip("-").isdigit():
        raw = int(raw.strip())
    if isinstance(raw, float) and raw.is_integer():
        raw = int(raw)
    return raw if isinstance(raw, int) and low <= raw <= high else None


def _marks(raw, low: Decimal, high: Decimal) -> str | None:
    """A number with up to 2 decimals, kept as text (the database can't hold floats). None when it isn't acceptable."""
    if isinstance(raw, bool) or not isinstance(raw, (int, str, float)):
        return None
    try:
        value = Decimal(str(raw).strip())
    except InvalidOperation:
        return None
    if not value.is_finite() or value != value.quantize(Decimal("0.01")) or not low <= value <= high:
        return None
    return format(value.normalize(), "f") if value != 0 else "0"


def _time(raw) -> tuple[str | None, str | None]:
    """A date and time like 2027-01-31 23:59 (India time). Returns (normalised text or None, problem)."""
    if raw is None or str(raw).strip() == "":
        return None, None
    text = str(raw).strip().replace(" ", "T", 1)
    for fmt in (TIME_FORMAT, "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).strftime(TIME_FORMAT), None
        except ValueError:
            continue
    return None, "Enter the date and time like 2027-01-31 23:59."


def _rules(raw) -> tuple[list[dict], str | None]:
    if raw in (None, []):
        return [], None
    if not isinstance(raw, list) or len(raw) > MAX_RULES:
        return [], f"Use up to {MAX_RULES} rules."
    out = []
    for number, rule in enumerate(raw, start=1):
        if not isinstance(rule, dict):
            return [], f"Rule {number} isn't valid."
        paper = BY_ID.get(rule.get("paper"))
        if paper is None:
            return [], f"Rule {number}: choose a subject."
        topic = rule.get("topic") or ""
        if topic and topic not in paper["topics"]:
            return [], f"Rule {number}: that topic isn't in {paper['name']}."
        level = rule.get("difficulty") or ""
        if level and level not in questions.DIFFICULTIES:
            return [], f"Rule {number}: level must be easy, medium or hard."
        count = _int(rule.get("count"), 1, 200)
        if count is None:
            return [], f"Rule {number}: enter how many questions, from 1 to 200."
        out.append({"paper": paper["id"], "topic": topic, "difficulty": level, "count": count})
    return out, None


def expand_passages(bank: list[dict], ids: list[str]) -> list[str]:
    """The ids with every published question of a passage kept together: when one is there, the rest of its passage
    comes too, next to it. Order is kept otherwise."""
    by_id = {item["id"]: item for item in bank}
    members: dict[str, list[str]] = {}
    for item in sorted(bank, key=lambda q: (q.get("created_at", ""), q["id"])):
        if item.get("passage") and item.get("status") == "published":
            members.setdefault(item["passage"], []).append(item["id"])
    out: list[str] = []
    seen: set[str] = set()

    def add(question_id: str) -> None:
        if question_id not in seen:
            seen.add(question_id)
            out.append(question_id)

    for question_id in ids:
        add(question_id)
        passage = (by_id.get(question_id) or {}).get("passage")
        for sibling in members.get(passage, []) if passage else []:
            add(sibling)
    return out


def clean(scoped: TenantRepo, data: dict) -> dict:
    """Check a whole test. Every mistake is reported together, as {field: message}."""
    errors: dict[str, str] = {}
    out: dict = {}

    title = " ".join(str(data.get("title") or "").split())
    if not title:
        errors["title"] = "The title is required."
    elif len(title) > 120:
        errors["title"] = "The title can be at most 120 characters."
    out["title"] = title

    description = str(data.get("description") or "").strip()
    if len(description) > 1000:
        errors["description"] = "The instructions can be at most 1000 characters."
    out["description"] = description

    for field, label in (("start_at", "start"), ("end_at", "end")):
        value, problem = _time(data.get(field))
        out[field] = value
        if problem:
            errors[field] = problem
    if out["start_at"] and out["end_at"] and out["end_at"] <= out["start_at"]:
        errors["end_at"] = "The end must be after the start."

    duration = _int(data.get("duration_minutes"), 1, 600)
    if duration is None:
        errors["duration_minutes"] = "Enter the duration in minutes, from 1 to 600."
    out["duration_minutes"] = duration

    attempts = _int(data.get("max_attempts"), 1, 100)
    if attempts is None:
        errors["max_attempts"] = "Enter how many attempts are allowed, from 1 to 100."
    out["max_attempts"] = attempts

    passing = _int(data.get("pass_percentage"), 0, 100)
    if passing is None:
        errors["pass_percentage"] = "Enter the pass percentage, from 0 to 100."
    out["pass_percentage"] = passing

    correct = _marks(data.get("marks_correct"), Decimal("0.01"), Decimal("100"))
    if correct is None:
        errors["marks_correct"] = "Enter the marks for a correct answer, more than 0 and up to 100."
    out["marks_correct"] = correct

    wrong = _marks(data.get("marks_incorrect"), Decimal("-100"), Decimal("0"))
    if wrong is None:
        errors["marks_incorrect"] = "Enter 0 or a negative number for a wrong answer, for example -1."
    out["marks_incorrect"] = wrong

    show = data.get("show_answers")
    if show is None:
        show = False
    if not isinstance(show, bool):
        errors["show_answers"] = "Choose yes or no."
    out["show_answers"] = show if isinstance(show, bool) else False

    chosen = data.get("courses")
    known = {course["id"] for course in scoped.list_courses()}
    if chosen is None:
        chosen = []
    if not isinstance(chosen, list) or not all(isinstance(item, str) and item in known for item in chosen):
        errors["courses"] = "Choose the courses from the list."
        chosen = []
    out["courses"] = list(dict.fromkeys(chosen))

    mode = data.get("mode") or "manual"
    if mode not in MODES:
        errors["mode"] = "Choose automatic or manual."
        mode = "manual"
    out["mode"] = mode

    rules, problem = _rules(data.get("rules"))
    if problem:
        errors["rules"] = problem
    out["rules"] = rules

    ids = data.get("question_ids")
    bank = scoped.list_questions()
    by_id = {item["id"]: item for item in bank}
    if ids is None:
        ids = []
    if not isinstance(ids, list) or not all(isinstance(item, str) for item in ids):
        errors["question_ids"] = "The questions aren't valid."
        ids = []
    ids = list(dict.fromkeys(ids))
    if any(item not in by_id for item in ids):
        errors["question_ids"] = "One of the questions no longer exists. Remove it and try again."
    elif any(by_id[item].get("status") != "published" for item in ids):
        errors["question_ids"] = "Only published questions can be added to a test."
    else:
        ids = expand_passages(bank, ids)
        if len(ids) > MAX_QUESTIONS:
            errors["question_ids"] = f"A test can have up to {MAX_QUESTIONS} questions."
    out["question_ids"] = ids

    status = data.get("status") or "draft"
    if status not in STATUSES:
        errors["status"] = "Status must be draft or published."
        status = "draft"
    out["status"] = status
    if status == "published":
        if not out["question_ids"] and "question_ids" not in errors:
            errors["question_ids"] = "Add at least one question before publishing."
        if not out["courses"] and "courses" not in errors:
            errors["courses"] = "Choose at least one course before publishing."

    if errors:
        raise questions.QuestionErrors(errors)
    return out


def create_test(scoped: TenantRepo, data: dict, admin_email: str) -> dict:
    test = {**clean(scoped, data), "id": uuid4().hex, "created_by": admin_email, "created_at": now_iso()}
    scoped.create_test(test)
    return test


def update_test(scoped: TenantRepo, test_id: str, changes: dict, admin_email: str) -> dict:
    current = scoped.get_test(test_id)
    if current is None:
        raise TestNotFound()
    merged = {**current, **{key: value for key, value in changes.items() if key != "id"}}
    cleaned = clean(scoped, merged)
    scoped.update_test(test_id, {**cleaned, "edited_by": admin_email, "edited_at": now_iso()})
    return scoped.get_test(test_id)


def delete_test(scoped: TenantRepo, test_id: str) -> None:
    if scoped.get_test(test_id) is None:
        raise TestNotFound()
    scoped.delete_test(test_id)


def summary(test: dict) -> dict:
    """A test with the numbers a list needs: how many questions and the most marks a student can get."""
    count = len(test.get("question_ids") or [])
    total = Decimal(test.get("marks_correct") or "0") * count
    return {**test, "question_count": count, "total_marks": format(total.normalize(), "f") if total else "0"}


def list_tests(scoped: TenantRepo) -> list[dict]:
    return [summary(item) for item in scoped.list_tests()]


def auto_pick(scoped: TenantRepo, rules_raw, exclude: list | None = None) -> dict:
    """Pick random published questions for the rules, without saving anything.

    Each rule asks for a number of questions of a subject, optionally a topic and a level. Questions already in the
    test (exclude) and questions picked for an earlier rule aren't picked again. When a picked question belongs to a
    passage, the rest of that passage comes too, so the total can be a little more than asked."""
    rules, problem = _rules(rules_raw)
    if problem or not rules:
        raise ValidationError(problem or "Add at least one rule.")
    bank = scoped.list_questions()
    taken = {item for item in (exclude or []) if isinstance(item, str)}
    picked: list[str] = []
    short = []
    for number, rule in enumerate(rules, start=1):
        pool = [
            item["id"]
            for item in bank
            if item.get("status") == "published"
            and item["id"] not in taken
            and item["paper"] == rule["paper"]
            and (not rule["topic"] or item["topic"] == rule["topic"])
            and (not rule["difficulty"] or item.get("difficulty") == rule["difficulty"])
        ]
        chosen = rng.sample(pool, min(rule["count"], len(pool)))
        taken.update(chosen)
        picked += chosen
        if len(chosen) < rule["count"]:
            short.append({"rule": number, "wanted": rule["count"], "found": len(chosen)})
    already = {item for item in (exclude or []) if isinstance(item, str)}
    full = [item for item in expand_passages(bank, picked) if item not in already]
    return {"question_ids": full, "picked": len(picked), "added_for_passages": len(full) - len(picked), "short": short}


def published_tests_using(scoped: TenantRepo, question_id: str) -> list[dict]:
    return [item for item in scoped.list_tests() if item.get("status") == "published" and question_id in (item.get("question_ids") or [])]


def forget_question(scoped: TenantRepo, question_id: str) -> None:
    """A question was deleted: take it out of any draft test that listed it."""
    for item in scoped.list_tests():
        if question_id in (item.get("question_ids") or []):
            scoped.update_test(item["id"], {"question_ids": [q for q in item["question_ids"] if q != question_id]})
