"""Releases: which passage a student sees for Daily RC (one a day) and which set for Weekly DILR (one a week).

The institute picks how each one is added:
  - self: the admin picks one passage and the date it goes live. Two releases can't share a date.
  - queue (bulk): the admin picks many passages at once. They are released one after another: one per day for
    Daily RC, one per week for Weekly DILR, starting from the day after the last one already queued
    (or from the start date the admin set).

Each release stores its date when it is added, so a release never moves afterwards.
A Weekly DILR set is shown for the seven days from its date. A Daily RC passage is shown only on its own day.
The student only sees a kind when the institute has it switched on (see features.py).
"""
from datetime import date, timedelta
from uuid import uuid4

from app import clock, features, passages
from app.repo import Repo, TenantRepo, now_iso
from app.tenants import ValidationError

KINDS = {"daily_rc": 1, "weekly_dilr": 7}  # days from one release to the next
MODES = ("self", "queue")
MAX_BULK = 200


def _parse_date(raw, label: str) -> date:
    try:
        return date.fromisoformat(str(raw))
    except (TypeError, ValueError):
        raise ValidationError(f"The {label} must be a date like 2026-11-30.")


def check_kind(kind) -> str:
    if kind not in KINDS:
        raise ValidationError("Choose Daily RC or Weekly DILR.")
    return kind


def schedule_of(tenant: dict, kind: str) -> dict:
    """How this kind is added: self or queue, and the start date for the queue. Self is the default."""
    saved = (tenant.get("schedules") or {}).get(kind) or {}
    return {"mode": saved.get("mode", "self"), "start": saved.get("start")}


def check_schedule(body: dict) -> dict:
    """The schedule the admin saves: a mode, and (for the queue) an optional start date."""
    mode = body.get("mode")
    if mode not in MODES:
        raise ValidationError("Choose self or bulk.")
    start = body.get("start")
    if mode == "queue" and start not in (None, ""):
        start = _parse_date(start, "start date").isoformat()
    else:
        start = None
    return {"mode": mode, "start": start}


def _dates(releases: list[dict]) -> set[date]:
    return {date.fromisoformat(row["date"]) for row in releases}


def add(scoped: TenantRepo, tenant: dict, body: dict, admin_email: str, today: date) -> list[dict]:
    """Add releases for one kind, the way the institute's schedule says."""
    kind = check_kind(body.get("kind"))
    schedule = schedule_of(tenant, kind)
    ids = body.get("passage_ids")
    if not isinstance(ids, list) or not ids or not all(isinstance(item, str) for item in ids):
        raise ValidationError("Choose at least one passage.")
    if len(ids) > MAX_BULK:
        raise ValidationError(f"Add at most {MAX_BULK} at a time.")
    known = {row["id"] for row in scoped.list_passages()}
    missing = [item for item in ids if item not in known]
    if missing:
        raise ValidationError("One of the passages could not be found. Refresh and try again.")
    existing = scoped.list_releases(kind)
    taken = _dates(existing)

    if schedule["mode"] == "self":
        if len(ids) != 1:
            raise ValidationError("Pick one passage at a time when you choose the date yourself.")
        when = _parse_date(body.get("date"), "date")
        if when in taken:
            raise ValidationError(f"Another one is already set for {when.isoformat()}. Pick a different date.")
        dates = [when]
    else:
        step = KINDS[kind]
        if existing:
            first = max(_dates(existing)) + timedelta(days=step)
        elif schedule["start"]:
            first = date.fromisoformat(schedule["start"])
        else:
            first = today
        dates = [first + timedelta(days=step * index) for index in range(len(ids))]

    created = []
    for passage_id, when in zip(ids, dates):
        record = {"id": uuid4().hex, "kind": kind, "passage_id": passage_id, "date": when.isoformat(), "added_by": admin_email, "added_at": now_iso()}
        scoped.create_release(record)
        created.append(record)
    return created


def remove(scoped: TenantRepo, release_id: str) -> None:
    scoped.delete_release(release_id)


def listed(scoped: TenantRepo, tenant: dict, kind: str) -> dict:
    """The schedule and the releases of one kind, with each passage's title, for the admin."""
    titles = {row["id"]: row["title"] for row in scoped.list_passages()}
    items = [{**row, "title": titles.get(row["passage_id"], "(passage removed)")} for row in scoped.list_releases(kind)]
    return {"kind": kind, "schedule": schedule_of(tenant, kind), "items": items}


def set_schedule(repo: Repo, tenant: dict, kind: str, body: dict) -> dict:
    check_kind(kind)
    schedule = check_schedule(body)
    schedules = dict(tenant.get("schedules") or {})
    schedules[kind] = schedule
    repo.update_tenant(tenant["slug"], schedules=schedules)
    return schedule


def _passage(scoped: TenantRepo, passage_id: str) -> dict | None:
    for row in scoped.list_passages():
        if row["id"] == passage_id:
            return {"id": row["id"], "title": row["title"], "text": row["text"]}
    return None


def today_for(scoped: TenantRepo, tenant: dict, today: date) -> dict:
    """What a student sees today: the Daily RC passage for today, and the Weekly DILR set for this week."""
    result = {"daily_rc": None, "weekly_dilr": None}
    if features.is_on(tenant, "daily_rc"):
        for row in scoped.list_releases("daily_rc"):
            if date.fromisoformat(row["date"]) == today:
                passage = _passage(scoped, row["passage_id"])
                result["daily_rc"] = {**passage, "date": row["date"]} if passage else None
    if features.is_on(tenant, "weekly_dilr"):
        current = None
        for row in scoped.list_releases("weekly_dilr"):
            start = date.fromisoformat(row["date"])
            if start <= today < start + timedelta(days=KINDS["weekly_dilr"]):
                current = row
        if current:
            passage = _passage(scoped, current["passage_id"])
            result["weekly_dilr"] = {**passage, "date": current["date"]} if passage else None
    return result


def for_student(scoped: TenantRepo, tenant: dict) -> dict:
    return today_for(scoped, tenant, clock.today_india())
