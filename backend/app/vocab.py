"""Vocabulary and Idioms: the institute's word or idiom list, cut into daily packs, with a short test on each pack.

The list is the same one the admin keeps for Word of the day (see word_of_day.py), split into packs of five.
Each day has one pack, going down the list and starting again at the top, so every student sees the same pack on the same day.
The test is built from the day alone, so the server can mark it without storing questions or answers.
"""
from datetime import date, timedelta

from app import word_of_day
from app.repo import TenantRepo
from app.tenants import ValidationError

PACK = 5
OPTIONS = 4
MIN_ITEMS = OPTIONS  # a test needs four different meanings to choose from
KIND_OF_FEATURE = {"vocabulary": "word", "idioms": "idiom"}
WINDOW_DAYS = 3  # the calendar shows this many days either side of today


def _pack_count(items: list[dict]) -> int:
    return -(-len(items) // PACK)


def pack_index(total: int, today: date) -> int:
    """Which pack a day has. Packs repeat in order, so every day has one once the list has any."""
    return (today - word_of_day.EPOCH).days % total


def pack_of(items: list[dict], index: int) -> list[dict]:
    return items[index * PACK:(index + 1) * PACK]


def view(scoped: TenantRepo, feature: str, today: date) -> dict:
    """The day's pack and a calendar of the days either side, for a student."""
    items = word_of_day.all_words(scoped, KIND_OF_FEATURE[feature])
    if not items:
        return {"packs": 0, "today": None, "days": []}
    total = _pack_count(items)
    days = []
    for offset in range(-WINDOW_DAYS, WINDOW_DAYS + 1):
        day = today + timedelta(days=offset)
        index = pack_index(total, day)
        days.append({"date": day.isoformat(), "pack": index + 1, "count": len(pack_of(items, index))})
    index = pack_index(total, today)
    return {
        "packs": total,
        "today": {"pack": index + 1, "items": [{"word": row["word"], "meaning": row["meaning"], "example": row["example"]} for row in pack_of(items, index)]},
        "days": days,
    }


def questions(scoped: TenantRepo, feature: str, today: date) -> list[dict]:
    """Today's test: for each word, four meanings to choose from, with one right. The right one's place is fixed by the day."""
    items = word_of_day.all_words(scoped, KIND_OF_FEATURE[feature])
    if len(items) < MIN_ITEMS:
        raise ValidationError(f"Add at least {MIN_ITEMS} entries to the list to make a test.")
    total = _pack_count(items)
    index = pack_index(total, today)
    position = {row["id"]: number for number, row in enumerate(items)}
    out = []
    for slot, row in enumerate(pack_of(items, index)):
        start = position[row["id"]]
        others = []
        step = 1
        while len(others) < OPTIONS - 1 and step < len(items):
            meaning = items[(start + step) % len(items)]["meaning"]
            if meaning != row["meaning"] and meaning not in others:
                others.append(meaning)
            step += 1
        if len(others) < OPTIONS - 1:
            raise ValidationError("Some entries have the same meaning. Make each meaning different to make a test.")
        right = (today - word_of_day.EPOCH).days + slot
        right %= OPTIONS
        choices = others[:]
        choices.insert(right, row["meaning"])
        out.append({"word": row["word"], "options": choices, "answer": right})
    return out


def public_questions(items: list[dict]) -> list[dict]:
    """The test as the student sees it: the words and their choices, never the right answers."""
    return [{"word": item["word"], "options": item["options"]} for item in items]


def mark(scoped: TenantRepo, feature: str, today: date, answers: list) -> dict:
    """Mark the test for today. `answers` holds the chosen option number for each question, or None."""
    built = questions(scoped, feature, today)
    if not isinstance(answers, list) or len(answers) != len(built):
        raise ValidationError("Send one answer for each word.")
    if any(item is not None and (isinstance(item, bool) or not isinstance(item, int) or not 0 <= item < OPTIONS) for item in answers):
        raise ValidationError("Each answer must be one of the choices.")
    results = []
    score = 0
    for item, given in zip(built, answers):
        right = given == item["answer"]
        score += 1 if right else 0
        results.append({"word": item["word"], "given": given, "answer": item["answer"], "right": right, "meaning": item["options"][item["answer"]]})
    return {"score": score, "total": len(built), "results": results}
