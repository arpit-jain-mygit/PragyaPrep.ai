"""Word of the day: the institute's own word list.

The admin adds words, each with its meaning and an example. Every day one word is shown to students, going down the
list in the order it was added, and starting again at the top when the list ends. Nothing is random, so every student
sees the same word on the same day.

The student only sees the word when the institute has the switch on (see features.py).
"""
from datetime import date
from time import time_ns
from uuid import uuid4

from app import clock, features
from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

MAX_WORD = 60
MAX_MEANING = 300
MAX_EXAMPLE = 300
MAX_LIST = 1000
EPOCH = date(1970, 1, 1)


def clean(body: dict) -> dict:
    """Check a word from the admin. Every mistake is reported together, in plain words."""
    problems = []
    word = _text(body.get("word"))
    meaning = _text(body.get("meaning"))
    example = _text(body.get("example"))
    if not word:
        problems.append("Type the word.")
    elif len(word) > MAX_WORD:
        problems.append(f"The word can be at most {MAX_WORD} characters.")
    if not meaning:
        problems.append("Type what the word means.")
    elif len(meaning) > MAX_MEANING:
        problems.append(f"The meaning can be at most {MAX_MEANING} characters.")
    if len(example) > MAX_EXAMPLE:
        problems.append(f"The example can be at most {MAX_EXAMPLE} characters.")
    if problems:
        raise ValidationError(" ".join(problems))
    return {"word": word, "meaning": meaning, "example": example}


def _text(raw) -> str:
    """Text from the form, with the spaces at the ends removed. Anything that isn't text counts as empty."""
    return raw.strip() if isinstance(raw, str) else ""


def add(scoped: TenantRepo, body: dict) -> dict:
    record = {"id": uuid4().hex, **clean(body), "created_at": now_iso(), "added_at": time_ns()}
    scoped.create_word(record)
    return record


def all_words(scoped: TenantRepo) -> list[dict]:
    """The whole list, in the order it was added."""
    return scoped.list_words(MAX_LIST)


def remove(scoped: TenantRepo, word_id: str) -> None:
    scoped.delete_word(word_id)


def todays(words: list[dict], today: date) -> dict | None:
    """The word for one day. None when the list is empty."""
    if not words:
        return None
    return words[(today - EPOCH).days % len(words)]


def switched_on(tenant: dict) -> bool:
    """Whether the institute shows Word of the day to students."""
    return any(item["key"] == "word_of_day" and item["enabled"] for item in features.public(tenant))


def for_student(scoped: TenantRepo, tenant: dict) -> dict:
    """The word for today, for a student. Nothing is shown when the institute has switched it off."""
    if not switched_on(tenant):
        return {"word": None}
    word = todays(all_words(scoped), clock.today_india())
    if word is None:
        return {"word": None}
    return {"word": {"word": word["word"], "meaning": word["meaning"], "example": word["example"]}}
