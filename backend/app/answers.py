"""Fill-in questions: what counts as the right answer, and checking what a student typed.

A fill-in question has one box. The answer is either text (any of a few accepted spellings, compared ignoring capitals
and extra spaces) or a number (compared as a number, with an optional tolerance, so 2.50 equals 2.5).
Numbers are stored as strings because the database can't hold floating-point numbers exactly."""
from decimal import Decimal, InvalidOperation

from app.tenants import ValidationError

MAX_ACCEPTED = 10
MAX_ANSWER_CHARS = 200
BIG = Decimal("1e15")


def _plain(text) -> str:
    """Capitals and spacing don't matter when comparing text answers."""
    return " ".join(str(text or "").split()).casefold()


def to_number(raw) -> Decimal | None:
    """A number from a number or from typed text (commas allowed, like 1,000). None if it isn't one."""
    if isinstance(raw, bool) or raw is None:
        return None
    try:
        value = Decimal(str(raw).strip().replace(",", ""))
    except InvalidOperation:
        return None
    return value if value.is_finite() and abs(value) <= BIG else None


def _shown(value: Decimal) -> str:
    """A number as plain text without exponent or trailing zeros: 2.50 -> 2.5, 1E+3 -> 1000."""
    text = format(value.normalize(), "f")
    return "0" if text in ("-0", "") else text


def clean_answer(raw) -> dict:
    """Check the answer the admin typed. Returns the stored form or raises ValidationError with a message."""
    raw = raw if isinstance(raw, dict) else {}
    kind = raw.get("type")

    if kind == "text":
        given = raw.get("accepted")
        if isinstance(given, str):
            given = [given]
        if not isinstance(given, list):
            given = []
        # Several accepted answers may be typed in one box, separated by |
        given = [part for item in given for part in str(item or "").split("|")]
        accepted, seen = [], set()
        for item in given:
            text = " ".join(str(item or "").split())
            if not text or _plain(text) in seen:
                continue
            if len(text) > MAX_ANSWER_CHARS:
                raise ValidationError(f"An answer can be at most {MAX_ANSWER_CHARS} characters.")
            seen.add(_plain(text))
            accepted.append(text)
        if not accepted:
            raise ValidationError("Give the correct answer.")
        if len(accepted) > MAX_ACCEPTED:
            raise ValidationError(f"Give at most {MAX_ACCEPTED} accepted answers.")
        return {"type": "text", "accepted": accepted}

    if kind == "number":
        value = to_number(raw.get("value"))
        if value is None:
            raise ValidationError("The answer must be a number.")
        tolerance = Decimal(0) if raw.get("tolerance") in (None, "") else to_number(raw.get("tolerance"))
        if tolerance is None or tolerance < 0:
            raise ValidationError("The tolerance must be a number, zero or more.")
        return {"type": "number", "value": _shown(value), "tolerance": _shown(tolerance)}

    raise ValidationError("Choose whether the answer is text or a number.")


def is_correct(question: dict, given) -> bool:
    """Is what the student gave the right answer? For multiple choice, given is the chosen option's number (0 to 3).
    For a fill-in question it is the text they typed."""
    if question.get("kind", "mcq") == "mcq":
        return isinstance(given, int) and not isinstance(given, bool) and given == question["correct"]

    answer = question["answer"]
    if answer["type"] == "text":
        return _plain(given) in {_plain(item) for item in answer["accepted"]}

    typed = to_number(given)
    if typed is None:
        return False
    return abs(typed - Decimal(answer["value"])) <= Decimal(answer["tolerance"])
