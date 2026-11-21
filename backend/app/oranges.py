"""Oranges: one for each coursework item a student marks done, counted by the Indian calendar day it was done.

The institute sets a daily target (10 unless it chooses another number). "Days strong" counts the days in a row
that reached the target, ending today, or ending yesterday while today's target is still open.
The student only sees oranges when the institute has the switch on (see features.py).
"""
from datetime import date, datetime, timedelta, timezone

from app import clock, features
from app.repo import Repo, TenantRepo
from app.tenants import ValidationError

DEFAULT_TARGET = 10
MIN_TARGET = 1
MAX_TARGET = 100


def target_of(tenant: dict) -> int:
    """The institute's daily target, or the default when it has not chosen one."""
    return int(tenant.get("points_target") or DEFAULT_TARGET)


def check_target(raw) -> int:
    """A daily target from the admin: a whole number from 1 to 100."""
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise ValidationError("The daily target must be a whole number.")
    if not MIN_TARGET <= raw <= MAX_TARGET:
        raise ValidationError(f"The daily target must be from {MIN_TARGET} to {MAX_TARGET}.")
    return raw


def _day(done_at: str) -> date:
    """The Indian calendar day a 'done at' time falls on. A time with no zone is taken as UTC."""
    moment = datetime.fromisoformat(done_at)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(clock.INDIA).date()


def summarise(done_times: list[str], today: date, target: int) -> dict:
    """Oranges for one student: today's count, the total, and the days in a row the target was reached."""
    per_day: dict[date, int] = {}
    for done_at in done_times:
        day = _day(done_at)
        per_day[day] = per_day.get(day, 0) + 1
    strong = 0
    day = today if per_day.get(today, 0) >= target else today - timedelta(days=1)
    while per_day.get(day, 0) >= target:
        strong += 1
        day -= timedelta(days=1)
    return {"collected_today": per_day.get(today, 0), "collected_total": len(done_times), "target": target, "days_strong": strong}


def for_student(scoped: TenantRepo, tenant: dict, email: str) -> dict:
    """The student's oranges. Nothing is shown when the institute has switched them off."""
    if not features.is_on(tenant, "dashboard_points"):
        return {"oranges": None}
    done = [row["done_at"] for row in scoped.list_done(email)]
    return {"oranges": summarise(done, clock.today_india(), target_of(tenant))}


def set_target(repo: Repo, tenant: dict, raw) -> int:
    target = check_target(raw)
    repo.update_tenant(tenant["slug"], points_target=target)
    return target


# ---- Leaderboard: who collected the most oranges in the last seven days ----

LEADERBOARD_DAYS = 7
LEADERBOARD_TOP = 10


def _display_name(member: dict) -> str:
    """First name and the first letter of the last name, so the list shows people without full names."""
    last = (member.get("last_name") or "").strip()
    first = (member.get("first_name") or "").strip() or "Student"
    return f"{first} {last[:1]}.".strip() if last else first


def leaderboard(scoped: TenantRepo, tenant: dict, viewer_email: str, today: date) -> dict:
    """The top students for the last seven days, plus where the viewer stands. Only approved students are listed."""
    since = today - timedelta(days=LEADERBOARD_DAYS - 1)
    scores = []
    for member in scoped.all_members_by_status("approved"):
        if member.get("role", "student") != "student":
            continue
        count = sum(1 for row in scoped.list_done(member["email"]) if since <= _day(row["done_at"]) <= today)
        scores.append({"email": member["email"], "name": _display_name(member), "oranges": count})
    scores.sort(key=lambda row: (-row["oranges"], row["name"], row["email"]))
    ranked = [{"rank": position, "name": row["name"], "oranges": row["oranges"], "me": row["email"] == viewer_email} for position, row in enumerate(scores, 1)]
    me = next((row for row in ranked if row["me"]), None)
    return {
        "days": LEADERBOARD_DAYS,
        "top": ranked[:LEADERBOARD_TOP],
        "me": me,
    }


def leaderboard_for_student(scoped: TenantRepo, tenant: dict, viewer_email: str) -> dict:
    """The leaderboard for a student. Nothing is shown when the institute has it switched off."""
    if not features.is_on(tenant, "leaderboard"):
        return {"leaderboard": None}
    return {"leaderboard": leaderboard(scoped, tenant, viewer_email, clock.today_india())}


# ---- Yesterday's winners: the top students by oranges on yesterday's day ----

WINNERS_TOP = 3


def _count_on(scoped: TenantRepo, members: list[dict], day: date) -> list[dict]:
    """How many oranges each approved student collected on one day, most first."""
    scores = []
    for member in members:
        count = sum(1 for row in scoped.list_done(member["email"]) if _day(row["done_at"]) == day)
        scores.append({"email": member["email"], "name": _display_name(member), "oranges": count})
    scores.sort(key=lambda row: (-row["oranges"], row["name"], row["email"]))
    return scores


def yesterday_winners(scoped: TenantRepo, tenant: dict, viewer_email: str, today: date) -> dict:
    """The top three students for yesterday, and whether the viewer was one of them. Students with no oranges are left out."""
    yesterday = today - timedelta(days=1)
    members = [m for m in scoped.all_members_by_status("approved") if m.get("role", "student") == "student"]
    scores = [row for row in _count_on(scoped, members, yesterday) if row["oranges"] > 0]
    top = [{"rank": position, "name": row["name"], "oranges": row["oranges"], "me": row["email"] == viewer_email} for position, row in enumerate(scores[:WINNERS_TOP], 1)]
    return {"day": yesterday.isoformat(), "top": top, "me_in_top": any(row["me"] for row in top)}


def yesterday_winners_for_student(scoped: TenantRepo, tenant: dict, viewer_email: str) -> dict:
    """Yesterday's winners for a student. Nothing is shown when the institute has switched them off."""
    if not features.is_on(tenant, "yesterday_winners"):
        return {"yesterday_winners": None}
    return {"yesterday_winners": yesterday_winners(scoped, tenant, viewer_email, clock.today_india())}
