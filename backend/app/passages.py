"""Reading passages. A passage is saved once per institute, and any number of questions can point to it.

The admin just pastes a passage's text into each related question; questions with the same text (capitals and extra
spaces ignored) end up sharing one passage record, so they are shown together. The title is made automatically from the
text. Titles are unique within an institute (capitals ignored), and an older Excel file can still name a passage by title.
A passage that no question uses any more is removed."""
import re
from uuid import uuid4

from app import questions
from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

TITLE_MAX = 150
TEXT_MAX = 5000


class PassageNotFound(Exception):
    pass


def _title(raw) -> str:
    value = " ".join(str(raw or "").split())
    if not value:
        raise ValidationError("The title is required.")
    if len(value) > TITLE_MAX:
        raise ValidationError(f"The title can be at most {TITLE_MAX} characters.")
    return value


def _text(raw) -> str:
    """The passage keeps its paragraph breaks. Trailing spaces and long runs of blank lines are tidied."""
    value = str(raw or "").replace("\r\n", "\n").replace("\r", "\n")
    value = "\n".join(line.rstrip() for line in value.split("\n")).strip()
    value = re.sub(r"\n{3,}", "\n\n", value)
    if not value:
        raise ValidationError("The passage text is required.")
    if len(value) > TEXT_MAX:
        raise ValidationError(f"The passage can be at most {TEXT_MAX} characters.")
    return value


def clean(data: dict) -> dict:
    """Check a passage. Every mistake is reported together, as {field: message}."""
    errors, out = {}, {}
    for field, fn in (("title", _title), ("text", _text)):
        try:
            out[field] = fn(data.get(field))
        except ValidationError as error:
            errors[field] = str(error)
    if errors:
        raise questions.QuestionErrors(errors)
    return out


def _norm(value: str) -> str:
    return " ".join(str(value).lower().split())


def same_text(a: str, b: str) -> bool:
    return _norm(a) == _norm(b)


def find_by_text(scoped: TenantRepo, text: str) -> dict | None:
    wanted = _norm(text)
    return next((item for item in scoped.list_passages() if _norm(item["text"]) == wanted), None)


def _auto_title(scoped: TenantRepo, text: str) -> str:
    """A title from the first words of the text, made unique."""
    flat = " ".join(text.split())
    base = flat if len(flat) <= 60 else flat[:60].rsplit(" ", 1)[0].rstrip(",.;:") + "…"
    title, number = base, 1
    while find_by_title(scoped, title) is not None:
        number += 1
        title = f"{base} ({number})"
    return title[:TITLE_MAX]


def ensure_by_text(scoped: TenantRepo, text: str, admin_email: str) -> str:
    """The id of the passage with this text: the existing one, or a new one with an automatic title."""
    existing = find_by_text(scoped, text)
    if existing:
        return existing["id"]
    cleaned = _text(text)
    return create_passage(scoped, {"title": _auto_title(scoped, cleaned), "text": cleaned}, admin_email)["id"]


def drop_if_unused(scoped: TenantRepo, passage_id: str | None) -> None:
    """Remove a passage no question uses any more, so nothing invisible piles up."""
    if passage_id and scoped.get_passage(passage_id) is not None:
        if not any(item.get("passage") == passage_id for item in scoped.list_questions()):
            scoped.delete_passage(passage_id)


def check_text(raw) -> str | None:
    """A problem with passage text typed on a question, or None when it is fine (or empty)."""
    if raw is None or not str(raw).strip():
        return None
    try:
        _text(raw)
    except ValidationError as error:
        return str(error)
    return None


def find_by_title(scoped: TenantRepo, title: str) -> dict | None:
    wanted = " ".join(str(title).lower().split())
    return next((item for item in scoped.list_passages() if " ".join(item["title"].lower().split()) == wanted), None)


def _taken(errors: dict, scoped: TenantRepo, title: str, own_id: str | None) -> None:
    other = find_by_title(scoped, title)
    if other and other["id"] != own_id:
        errors["title"] = "Another passage already has this title."


def create_passage(scoped: TenantRepo, data: dict, admin_email: str) -> dict:
    try:
        cleaned = clean(data)
        errors: dict = {}
    except questions.QuestionErrors as error:
        cleaned, errors = {}, dict(error.errors)
    if "title" not in errors:
        _taken(errors, scoped, _title(data.get("title")), None)
    if errors:
        raise questions.QuestionErrors(errors)
    passage = {**cleaned, "id": uuid4().hex, "created_by": admin_email, "created_at": now_iso()}
    scoped.create_passage(passage)
    return passage


def update_passage(scoped: TenantRepo, passage_id: str, changes: dict, admin_email: str) -> dict:
    current = scoped.get_passage(passage_id)
    if current is None:
        raise PassageNotFound()
    merged = {**current, **{key: value for key, value in changes.items() if value is not None}}
    try:
        cleaned = clean(merged)
        errors: dict = {}
    except questions.QuestionErrors as error:
        cleaned, errors = {}, dict(error.errors)
    if "title" not in errors:
        _taken(errors, scoped, _title(merged.get("title")), passage_id)
    if errors:
        raise questions.QuestionErrors(errors)
    scoped.update_passage(passage_id, {**cleaned, "edited_by": admin_email, "edited_at": now_iso()})
    return scoped.get_passage(passage_id)


def delete_passage(scoped: TenantRepo, passage_id: str) -> None:
    """A passage that questions still use can't be deleted, so no question is left pointing at nothing."""
    if scoped.get_passage(passage_id) is None:
        raise PassageNotFound()
    using = sum(1 for item in scoped.list_questions() if item.get("passage") == passage_id)
    if using:
        raise ValidationError(
            f"{using} {'question uses' if using == 1 else 'questions use'} this passage. Delete or move them first."
        )
    scoped.delete_passage(passage_id)


def list_passages(scoped: TenantRepo) -> list[dict]:
    """By title, each with how many questions use it."""
    used: dict[str, int] = {}
    for item in scoped.list_questions():
        if item.get("passage"):
            used[item["passage"]] = used.get(item["passage"], 0) + 1
    return [{**item, "questions": used.get(item["id"], 0)} for item in scoped.list_passages()]


def ensure(scoped: TenantRepo, title: str, text: str, admin_email: str) -> str:
    """The id of the passage with this title: the existing one if its text is the same, a new one if there is none.
    Used by the Excel import. Refuses when the title exists with different text, so nothing is overwritten."""
    existing = find_by_title(scoped, title)
    if existing is None:
        return create_passage(scoped, {"title": title, "text": text}, admin_email)["id"]
    if not same_text(existing["text"], text):
        raise ValidationError(f"A passage called '{existing['title']}' already exists with different text.")
    return existing["id"]
