"""Practice tests: a student (or their parent) makes a test for one weak topic, from the institute's published questions.

A practice test belongs to one student, can be taken again and again, and is never shown to the institute's other students or in
the admin's list of tests. Only students who can open a course may make one, since the question bank is part of what they pay for.
"""
from uuid import uuid4

from app import content, quizzes
from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

MIN_QUESTIONS, MAX_QUESTIONS, DEFAULT_QUESTIONS = 5, 30, 10
MAX_PER_STUDENT = 100


class NotEnrolled(Exception):
    pass


def _enrolled(scoped: TenantRepo, student: dict) -> bool:
    return any(content.is_active(a) for a in scoped.list_access(student["email"]))


def create(scoped: TenantRepo, student: dict, body: dict, made_by: str) -> dict:
    """Make a practice test for `student` on one topic. `made_by` is the student's own email, or their parent's."""
    if not _enrolled(scoped, student):
        raise NotEnrolled()
    count = body.get("count", DEFAULT_QUESTIONS)
    if isinstance(count, bool) or not isinstance(count, int) or not MIN_QUESTIONS <= count <= MAX_QUESTIONS:
        raise ValidationError(f"Choose from {MIN_QUESTIONS} to {MAX_QUESTIONS} questions.")
    if len(scoped.list_practice(student["email"])) >= MAX_PER_STUDENT:
        raise ValidationError(f"There are already {MAX_PER_STUDENT} practice tests. Please practise those first.")
    try:
        picked = quizzes.auto_pick(scoped, [{"paper": body.get("paper"), "topic": body.get("topic"), "count": count}])
    except ValidationError as error:
        message = str(error).replace("Rule 1: ", "")
        raise ValidationError(message[:1].upper() + message[1:])
    ids = picked["question_ids"]
    if not ids:
        raise ValidationError("There are no questions for that topic yet.")
    name = body.get("topic") or ""
    return save(scoped, student, f"Practice: {name}" if name else "Practice", ids, made_by)


def save(scoped: TenantRepo, student: dict, title: str, ids: list[str], made_by: str, extra: dict | None = None) -> dict:
    """Store a practice test with these questions for one student. Used for topics and for a Daily RC or Weekly DILR passage."""
    test = {
        "id": uuid4().hex, "title": title, "description": "A practice test on a topic that needs work. You can take it as often as you like.",
        "start_at": None, "end_at": None, "duration_minutes": max(10, round(len(ids) * 1.5)), "max_attempts": 100, "pass_percentage": 50,
        "marks_correct": "1", "marks_incorrect": "0", "show_answers": True, "courses": [], "mode": "manual", "rules": [], "question_ids": ids,
        "status": "published", "practice_for": student["email"], "created_by": made_by, "created_at": now_iso(), **(extra or {}),
    }
    scoped.create_practice(test)
    return test
