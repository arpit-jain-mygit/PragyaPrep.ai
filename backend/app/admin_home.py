"""The admin's home: simple counts for the tiles, and (separately, because it reads every student's records) how many students are behind."""
from app import attempts, clock, progress
from app.repo import TenantRepo


def counts(scoped: TenantRepo) -> dict:
    """Pending registrations, approved students, open courses, tests open right now, and questions. Reads no per-student data."""
    pending = sum(1 for m in scoped.all_members_by_status("pending") if m.get("role") == "student")
    students = sum(1 for m in scoped.all_members_by_status("approved") if m.get("role") == "student")
    courses = sum(1 for c in scoped.list_courses() if c.get("active", True))
    now = clock.now()
    tests_open = sum(1 for t in scoped.list_tests() if t.get("status") == "published" and attempts._window(t, now) == "open")
    return {"pending": pending, "students": students, "courses": courses, "tests_open": tests_open, "questions": scoped.count_questions()}


def behind(scoped: TenantRepo) -> dict:
    """Students who are behind in at least one open course, each counted once, and in how many courses there are any."""
    emails: set[str] = set()
    courses = 0
    for course in scoped.list_courses():
        if not course.get("active", True):
            continue
        rows = [r for r in progress.students(scoped, course["id"])["students"] if r["status"] == "behind"]
        courses += bool(rows)
        emails.update(r["email"] for r in rows)
    return {"students": len(emails), "courses": courses}
