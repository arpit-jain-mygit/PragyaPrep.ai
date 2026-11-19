"""The admin's home: simple counts for the tiles, and (separately, because it reads every student's records) how many students are behind."""
from datetime import datetime, timezone

from app import attempts, clock, progress
from app.repo import Repo, TenantRepo


def counts(scoped: TenantRepo) -> dict:
    """Pending registrations, approved students, open courses, tests open right now, and questions. Reads no per-student data."""
    pending = sum(1 for m in scoped.all_members_by_status("pending") if m.get("role") == "student")
    students = sum(1 for m in scoped.all_members_by_status("approved") if m.get("role") == "student")
    courses = sum(1 for c in scoped.list_courses() if c.get("active", True))
    now = clock.now()
    tests_open = sum(1 for t in scoped.list_tests() if t.get("status") == "published" and attempts._window(t, now) == "open")
    return {"pending": pending, "students": students, "courses": courses, "tests_open": tests_open, "questions": scoped.count_questions()}


CACHE_SECONDS = 15 * 60  # a saved answer counts as fresh for this long
THROTTLE_SECONDS = 60  # asking again within this time returns the saved answer instead of working it out again


def behind(scoped: TenantRepo) -> dict:
    """Students who are behind in at least one open course, each counted once, and in how many courses there are any.

    Every student's records are read once, whatever the number of courses (three reads a student), then each course is worked out
    from those. Reading them again for every course was what made this take 10 to 20 seconds."""
    members = progress.approved_students(scoped)
    records = progress.load_records(scoped, members)
    emails: set[str] = set()
    courses = 0
    for course in scoped.list_courses():
        if not course.get("active", True):
            continue
        rows = [r for r in progress.students(scoped, course["id"], members=members, records=records)["students"] if r["status"] == "behind"]
        courses += bool(rows)
        emails.update(r["email"] for r in rows)
    return {"students": len(emails), "courses": courses}


def saved(tenant: dict) -> dict:
    """The last worked-out answer, instantly: students and courses (None if never worked out), when, and whether it is still fresh."""
    cache = tenant.get("behind_cache")
    if not cache:
        return {"students": None, "courses": None, "as_of": None, "fresh": False}
    return {
        "students": cache["students"], "courses": cache["courses"], "as_of": datetime.fromtimestamp(cache["at"], tz=timezone.utc).isoformat(),
        "fresh": clock.now() - cache["at"] < CACHE_SECONDS,
    }


def refresh(repo: Repo, scoped: TenantRepo, tenant: dict) -> dict:
    """Work the answer out again and save it. Asked again within a minute, it returns what is saved, so a busy page can't pile up work."""
    cache = tenant.get("behind_cache")
    if cache and clock.now() - cache["at"] < THROTTLE_SECONDS:
        return saved(tenant)
    result = behind(scoped)
    repo.update_tenant(tenant["slug"], behind_cache={**result, "at": int(clock.now())})
    return saved({**tenant, "behind_cache": {**result, "at": int(clock.now())}})
