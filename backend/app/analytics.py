"""Analyse: how a student is doing, worked out from their submitted attempts.

- Topic tests, Sectionals and Mocks each show a summary, a score trend and accuracy by subject and topic,
  for the attempts of that kind of test.
- SWOT looks at the student's last ten sectional and mock attempts, and lists the topics they are strong and weak in.
  It needs a few attempts first, so it doesn't judge from one paper.

Each attempt keeps its own per-topic counts when it is submitted (see attempts.score), so nothing is re-marked here.
"""
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from app import attempts as attempt_rules
from app import clock
from app.repo import TenantRepo
from app.tenants import ValidationError

VIEWS = {"topic": "topic", "sectional": "sectional", "mock": "mock"}
SWOT_ATTEMPTS = 10
SWOT_MIN_ATTEMPTS = 3
SWOT_MIN_QUESTIONS = 3  # a topic needs this many answered questions before it counts as a strength or a weakness
STRONG_AT = Decimal(70)
WEAK_BELOW = Decimal(50)
TREND_ATTEMPTS = 10


def _kinds(scoped: TenantRepo, member: dict) -> dict[str, str]:
    """Which kind of test each test id is: topic (a practice test on a topic), release (Daily RC or Weekly DILR), sectional, mock or test."""
    kinds = {test["id"]: test.get("kind") or "test" for test in scoped.list_tests()}
    for practice in scoped.list_practice(member["email"]):
        kinds[practice["id"]] = "release" if practice.get("release_id") else "topic"
    return kinds


def _submitted(scoped: TenantRepo, member: dict) -> list[dict]:
    rows = [attempt_rules._settle(scoped, a) for a in scoped.list_attempts(member["email"])]
    return sorted((a for a in rows if a["status"] == "submitted"), key=lambda a: (a["started_at"], a["test_id"], a["number"]))


def _day(started_at: str) -> date:
    """The Indian calendar day an attempt started on. A time with no zone is taken as UTC."""
    moment = datetime.fromisoformat(started_at)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(clock.INDIA).date()


def _parse_day(raw) -> date | None:
    """A date from the student's filter (YYYY-MM-DD), or None when the filter is blank."""
    if raw in (None, ""):
        return None
    try:
        return date.fromisoformat(str(raw))
    except ValueError:
        raise ValidationError("Choose a date as year-month-day.")


def view(scoped: TenantRepo, member: dict, kind: str, subject: str | None = None, start=None, end=None) -> dict:
    """Summary, trend and accuracy by topic for the student's attempts of one kind of test.

    Filters (all optional): a subject (its topics only), and a start and end date for when the attempt began.
    subject_options lists the subjects the student has attempts in, before any filter, so the filter can offer them.
    """
    kinds = _kinds(scoped, member)
    everything = [a for a in _submitted(scoped, member) if kinds.get(a["test_id"]) == kind]
    options = [{"id": row["id"], "name": row["name"]} for row in attempt_rules.by_subject(everything)]
    first, last = _parse_day(start), _parse_day(end)
    done = everything
    if first or last:
        done = [a for a in done if (first is None or _day(a["started_at"]) >= first) and (last is None or _day(a["started_at"]) <= last)]
    if subject:
        done = [a for a in done if any(key.split("|", 1)[0] == subject for key in (a.get("topics") or {}))]
    subjects = attempt_rules.by_subject(done)
    if subject:
        subjects = [row for row in subjects if row["id"] == subject]
    percentages = [Decimal(a["percentage"]) for a in done]
    average = (sum(percentages) / len(percentages)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if percentages else None
    return {
        "summary": {
            "attempts": len(done),
            "average": attempt_rules._fmt(average) if average is not None else None,
            "best": attempt_rules._fmt(max(percentages)) if percentages else None,
        },
        "trend": [{"title": a["title"], "percentage": a["percentage"], "started_at": a["started_at"]} for a in done[-TREND_ATTEMPTS:]],
        "subjects": subjects,
        "subject_options": options,
        "filters": {"subject": subject or None, "start": first.isoformat() if first else None, "end": last.isoformat() if last else None},
    }


def swot(scoped: TenantRepo, member: dict) -> dict:
    """Strengths and weaknesses from the student's last ten sectional and mock attempts."""
    kinds = _kinds(scoped, member)
    recent = [a for a in _submitted(scoped, member) if kinds.get(a["test_id"]) in ("sectional", "mock")][-SWOT_ATTEMPTS:]
    if len(recent) < SWOT_MIN_ATTEMPTS:
        return {"attempts": len(recent), "enough": False, "strengths": [], "weaknesses": []}
    topics = []
    for subject in attempt_rules.by_subject(recent):
        for topic in subject["topics"]:
            if topic["questions"] >= SWOT_MIN_QUESTIONS:
                topics.append({"subject": subject["name"], "topic": topic["topic"], "accuracy": topic["accuracy"], "questions": topic["questions"]})
    topics.sort(key=lambda row: (Decimal(row["accuracy"]), row["topic"]))
    return {
        "attempts": len(recent),
        "enough": True,
        "strengths": [row for row in reversed(topics) if Decimal(row["accuracy"]) >= STRONG_AT][:5],
        "weaknesses": [row for row in topics if Decimal(row["accuracy"]) < WEAK_BELOW][:5],
    }
