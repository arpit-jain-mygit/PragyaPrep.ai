"""Question bank: multiple-choice questions, each with a reason for every option. Private to one institute."""
from uuid import uuid4

from app.papers import BY_ID
from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

OPTION_COUNT = 4
DIFFICULTIES = ["easy", "medium", "hard"]
STATUSES = ["draft", "published"]


class QuestionNotFound(Exception):
    pass


class QuestionErrors(Exception):
    """The question has mistakes. 'errors' maps each field to a message to show next to it."""

    def __init__(self, errors: dict[str, str]):
        super().__init__("The question has mistakes")
        self.errors = errors


def _text(raw, label: str, limit: int) -> str:
    value = " ".join(str(raw or "").split())
    if not value:
        raise ValidationError(f"{label} is required.")
    if len(value) > limit:
        raise ValidationError(f"{label} can be at most {limit} characters.")
    return value


def clean(data: dict) -> dict:
    """Check a whole question. Every mistake is reported together, as {field: message}."""
    errors: dict[str, str] = {}
    out: dict = {}

    def attempt(field, fn):
        try:
            out[field] = fn()
        except ValidationError as error:
            errors[field] = str(error)

    paper = BY_ID.get(data.get("paper"))
    if paper is None:
        errors["paper"] = "Choose a paper from the list."
    else:
        out["paper"] = paper["id"]
        if data.get("topic") in paper["topics"]:
            out["topic"] = data["topic"]
        else:
            errors["topic"] = "Choose a topic that belongs to this paper."

    attempt("text", lambda: _text(data.get("text"), "The question", 2000))

    options = data.get("options")
    if not isinstance(options, list) or len(options) != OPTION_COUNT:
        errors["options"] = f"Give exactly {OPTION_COUNT} options."
    else:
        cleaned = []
        for number, option in enumerate(options, start=1):
            option = option if isinstance(option, dict) else {}
            try:
                cleaned.append({
                    "text": _text(option.get("text"), f"Option {number}", 500),
                    "why": _text(option.get("why"), f"The reason for option {number}", 1000),
                })
            except ValidationError as error:
                errors["options"] = str(error)
                break
        else:
            names = [item["text"].lower() for item in cleaned]
            if len(set(names)) != len(names):
                errors["options"] = "Two options are the same. Each option must be different."
            else:
                out["options"] = cleaned

    correct = data.get("correct")
    if isinstance(correct, bool) or not isinstance(correct, int) or not 0 <= correct < OPTION_COUNT:
        errors["correct"] = "Choose which option is correct."
    else:
        out["correct"] = correct

    difficulty = data.get("difficulty") or "medium"
    if difficulty in DIFFICULTIES:
        out["difficulty"] = difficulty
    else:
        errors["difficulty"] = "Difficulty must be easy, medium or hard."

    status = data.get("status") or "draft"
    if status in STATUSES:
        out["status"] = status
    else:
        errors["status"] = "Status must be draft or published."

    if errors:
        raise QuestionErrors(errors)
    return out


def create_question(scoped: TenantRepo, data: dict, admin_email: str) -> dict:
    question = {
        **clean(data),
        "id": uuid4().hex,
        "created_by": admin_email,
        "created_at": now_iso(),
    }
    scoped.create_question(question)
    return question


def update_question(scoped: TenantRepo, question_id: str, changes: dict, admin_email: str) -> dict:
    """Change a question. Only the fields sent are changed; the result is checked as a whole."""
    current = scoped.get_question(question_id)
    if current is None:
        raise QuestionNotFound()
    merged = {**current, **{key: value for key, value in changes.items() if value is not None}}
    fields = clean(merged)
    fields.update(edited_by=admin_email, edited_at=now_iso())
    scoped.update_question(question_id, fields)
    return scoped.get_question(question_id)


def delete_question(scoped: TenantRepo, question_id: str) -> None:
    if scoped.get_question(question_id) is None:
        raise QuestionNotFound()
    scoped.delete_question(question_id)


def list_questions(scoped: TenantRepo, paper=None, topic=None, status=None, difficulty=None) -> list[dict]:
    """Newest first, optionally filtered."""
    items = scoped.list_questions()
    for field, wanted in (("paper", paper), ("topic", topic), ("status", status), ("difficulty", difficulty)):
        if wanted:
            items = [item for item in items if item.get(field) == wanted]
    return items
