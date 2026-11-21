"""Application tracker: each student's own list of the colleges they are applying to.

A student adds a college and a programme, sets how far along the application is, and can add a deadline and a note.
Only the student who added a row can see or change it, because every row is stored under that student's own key.
The list shows the nearest deadline first, and rows without a deadline last.
"""
from datetime import date
from time import time_ns
from uuid import uuid4

from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

MAX_NAME = 80
MAX_NOTES = 300
# The stages a student can pick, in the order they usually happen.
STATUSES = ("planning", "applied", "shortlisted", "accepted", "rejected", "withdrawn")
DEFAULT_STATUS = "planning"


def clean(body: dict) -> dict:
    """Check one application from the student. Every mistake is reported together, in plain words."""
    problems = []
    college = _text(body.get("college"))
    programme = _text(body.get("programme"))
    status = _text(body.get("status")) or DEFAULT_STATUS
    deadline = _text(body.get("deadline"))
    notes = _text(body.get("notes"))
    if not college:
        problems.append("Type the college.")
    elif len(college) > MAX_NAME:
        problems.append(f"The college can be at most {MAX_NAME} characters.")
    if not programme:
        problems.append("Type the programme you are applying for.")
    elif len(programme) > MAX_NAME:
        problems.append(f"The programme can be at most {MAX_NAME} characters.")
    if status not in STATUSES:
        problems.append("Choose a stage from the list.")
    if deadline:
        try:
            date.fromisoformat(deadline)
        except ValueError:
            problems.append("The deadline must be a real date.")
    if len(notes) > MAX_NOTES:
        problems.append(f"The notes can be at most {MAX_NOTES} characters.")
    if problems:
        raise ValidationError(" ".join(problems))
    return {"college": college, "programme": programme, "status": status, "deadline": deadline or None, "notes": notes}


def _text(raw) -> str:
    """Text from the form, with the spaces at the ends removed. Anything that isn't text counts as empty."""
    return raw.strip() if isinstance(raw, str) else ""


def add(scoped: TenantRepo, student: dict, body: dict) -> dict:
    now = now_iso()
    record = {"id": uuid4().hex, **clean(body), "created_at": now, "updated_at": now, "added_at": time_ns()}
    scoped.put_application(student["email"], record)
    return record


def change(scoped: TenantRepo, student: dict, application_id: str, body: dict) -> dict | None:
    """Replace the fields of one of this student's applications. Returns None when this student has no such row."""
    if scoped.get_application(student["email"], application_id) is None:
        return None
    fields = {**clean(body), "updated_at": now_iso()}
    scoped.update_application(student["email"], application_id, fields)
    return scoped.get_application(student["email"], application_id)


def remove(scoped: TenantRepo, student: dict, application_id: str) -> bool:
    """Delete one of this student's applications. Returns False when this student has no such row."""
    if scoped.get_application(student["email"], application_id) is None:
        return False
    scoped.delete_application(student["email"], application_id)
    return True


def mine(scoped: TenantRepo, student: dict) -> list[dict]:
    """This student's applications: nearest deadline first, rows without a deadline last, then by college."""
    rows = scoped.list_applications(student["email"])
    rows.sort(key=lambda row: (row.get("deadline") is None, row.get("deadline") or "", row.get("college", "")))
    return rows
