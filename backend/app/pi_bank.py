"""PI question bank: personal interview questions, grouped by topic and subtopic.

- The admin adds questions, each with a topic, an optional subtopic, and an optional hint for the answer.
- A student sees the questions in the order the admin added them. Questions they have not done come first, and the
  ones they marked done sink to the bottom, as the wireframe shows.
- Each student's own done marks are stored under their own key, so one student's marks never show for another.
"""
from time import time_ns
from uuid import uuid4

from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

MAX_TOPIC = 60
MAX_QUESTION = 300
MAX_HINT = 500
DEFAULT_SUBTOPIC = "General"


def clean(body: dict) -> dict:
    """Check one question from the admin. Every mistake is reported together, in plain words."""
    problems = []
    topic = _text(body.get("topic"))
    subtopic = _text(body.get("subtopic")) or DEFAULT_SUBTOPIC
    question = _text(body.get("question"))
    hint = _text(body.get("hint"))
    if not topic:
        problems.append("Type the topic.")
    elif len(topic) > MAX_TOPIC:
        problems.append(f"The topic can be at most {MAX_TOPIC} characters.")
    if len(subtopic) > MAX_TOPIC:
        problems.append(f"The subtopic can be at most {MAX_TOPIC} characters.")
    if not question:
        problems.append("Type the question.")
    elif len(question) > MAX_QUESTION:
        problems.append(f"The question can be at most {MAX_QUESTION} characters.")
    if len(hint) > MAX_HINT:
        problems.append(f"The hint can be at most {MAX_HINT} characters.")
    if problems:
        raise ValidationError(" ".join(problems))
    return {"topic": topic, "subtopic": subtopic, "question": question, "hint": hint}


def _text(raw) -> str:
    """Text from the form, with the spaces at the ends removed. Anything that isn't text counts as empty."""
    return raw.strip() if isinstance(raw, str) else ""


def add(scoped: TenantRepo, body: dict) -> dict:
    record = {"id": uuid4().hex, **clean(body), "created_at": now_iso(), "added_at": time_ns()}
    scoped.create_pi_question(record)
    return record


def remove(scoped: TenantRepo, question_id: str) -> None:
    scoped.delete_pi_question(question_id)


def student_view(scoped: TenantRepo, student: dict) -> dict:
    """The questions for one student, the counts, and the topics and subtopics to filter by."""
    done = {row["question_id"]: row["done_at"] for row in scoped.list_pi_done(student["email"])}
    questions = [
        {
            "id": row["id"], "topic": row["topic"], "subtopic": row["subtopic"],
            "question": row["question"], "hint": row.get("hint", ""), "done": row["id"] in done,
        }
        for row in scoped.list_pi_questions()
    ]
    # Not done first, each group keeping the order the admin added the questions in.
    questions.sort(key=lambda row: row["done"])
    topics: dict[str, set[str]] = {}
    for row in questions:
        topics.setdefault(row["topic"], set()).add(row["subtopic"])
    counts = {"done": sum(1 for row in questions if row["done"]), "total": len(questions)}
    counts["new"] = counts["total"] - counts["done"]
    return {
        "questions": questions,
        "counts": counts,
        "topics": [{"name": name, "subtopics": sorted(subs)} for name, subs in sorted(topics.items())],
    }


def known_question(scoped: TenantRepo, question_id: str) -> bool:
    return any(row["id"] == question_id for row in scoped.list_pi_questions())


def mark(scoped: TenantRepo, student: dict, question_id: str, done: bool) -> bool:
    """Mark one question done (or not done again). Returns False when there is no such question."""
    if not known_question(scoped, question_id):
        return False
    if done:
        scoped.put_pi_done(student["email"], question_id, now_iso())
    else:
        scoped.delete_pi_done(student["email"], question_id)
    return True
