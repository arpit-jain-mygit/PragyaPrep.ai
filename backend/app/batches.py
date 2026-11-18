"""Batches: a cohort inside an institute. A batch has one or more courses, a start and end date, an optional seat limit, an optional
faculty name and a short timetable. Enrolling a student opens the batch's courses for them (with the usual access length), and
taking them out closes the courses that only the batch had opened. A student can be in several batches.

Access the admin or the student already had is never overwritten: a batch only opens a course that is not open yet, and only
closes access that it opened itself (source "batch") and that no other batch of the student still needs."""
from datetime import date
from uuid import uuid4

from app import content
from app.repo import Repo, TenantRepo, now_iso
from app.tenants import ValidationError

MAX_SEATS = 1000


class BatchNotFound(Exception):
    pass


class BatchFull(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _name(raw) -> str:
    value = " ".join(str(raw or "").split())
    if not 1 <= len(value) <= 80:
        raise ValidationError("The batch name must be 1 to 80 characters.")
    return value


def _courses(scoped: TenantRepo, raw) -> list[str]:
    if not isinstance(raw, list) or not raw:
        raise ValidationError("Choose at least one course.")
    ids = list(dict.fromkeys(str(x) for x in raw))
    for course_id in ids:
        if scoped.get_course(course_id) is None:
            raise ValidationError("Choose the courses from the list.")
    return ids


def _day(raw, label: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        raise ValidationError(f"Enter the {label} as YYYY-MM-DD.")


def _seats(raw):
    if raw in (None, ""):
        return None
    if isinstance(raw, bool) or not isinstance(raw, int) or not 1 <= raw <= MAX_SEATS:
        raise ValidationError(f"The seat limit is a whole number from 1 to {MAX_SEATS}, or empty for no limit.")
    return raw


def _text(raw, limit: int, label: str) -> str:
    value = " ".join(str(raw or "").split())
    if len(value) > limit:
        raise ValidationError(f"{label} can be up to {limit} characters.")
    return value


def _clean(scoped: TenantRepo, body: dict, current: dict | None) -> dict:
    """Check every field that was sent. For a new batch the name and courses are required."""
    allowed = {"name", "course_ids", "start_date", "end_date", "seat_limit", "faculty", "schedule", "status"}
    unknown = sorted(set(body) - allowed)
    if unknown:
        raise ValidationError(f"These can't be set here: {', '.join(unknown)}.")
    out: dict = {}
    if current is None or "name" in body:
        out["name"] = _name(body.get("name"))
    if current is None or "course_ids" in body:
        out["course_ids"] = _courses(scoped, body.get("course_ids"))
    if "start_date" in body:
        out["start_date"] = _day(body["start_date"], "start date")
    if "end_date" in body:
        out["end_date"] = _day(body["end_date"], "end date")
    start = out.get("start_date", (current or {}).get("start_date", ""))
    end = out.get("end_date", (current or {}).get("end_date", ""))
    if start and end and end < start:
        raise ValidationError("The end date can't be before the start date.")
    if "seat_limit" in body:
        out["seat_limit"] = _seats(body["seat_limit"])
    if "faculty" in body:
        out["faculty"] = _text(body["faculty"], 80, "The faculty name")
    if "schedule" in body:
        out["schedule"] = _text(body["schedule"], 200, "The timetable")
    if "status" in body:
        if body["status"] not in ("active", "archived"):
            raise ValidationError("The status must be active or archived.")
        out["status"] = body["status"]
    if "seat_limit" in out and out["seat_limit"] is not None and current is not None and out["seat_limit"] < len(current.get("students", [])):
        raise ValidationError(f"{len(current['students'])} students are already in this batch, so the limit can't be lower than that.")
    if current is None and any(b["name"].lower() == out["name"].lower() for b in scoped.list_batches()):
        raise ValidationError("A batch with this name already exists.")
    return out


def _shown(scoped: TenantRepo, batch: dict) -> dict:
    names = []
    for course_id in batch["course_ids"]:
        course = scoped.get_course(course_id)
        names.append(course["name"] if course else "(removed course)")
    students = batch.get("students", [])
    limit = batch.get("seat_limit")
    return {
        "id": batch["id"], "name": batch["name"], "status": batch.get("status", "active"), "course_ids": batch["course_ids"], "course_names": names,
        "start_date": batch.get("start_date", ""), "end_date": batch.get("end_date", ""), "seat_limit": limit, "faculty": batch.get("faculty", ""),
        "schedule": batch.get("schedule", ""), "enrolled": len(students), "seats_left": None if limit is None else max(0, limit - len(students)),
    }


def _person(scoped: TenantRepo, email: str) -> dict:
    person = scoped.get_member(email) or {}
    return {"email": email, "name": " ".join(p for p in (person.get("first_name"), person.get("last_name")) if p) or email, "status": person.get("status", "")}


def list_all(scoped: TenantRepo) -> list[dict]:
    return [_shown(scoped, b) for b in scoped.list_batches()]


def detail(scoped: TenantRepo, batch_id: str) -> dict:
    batch = scoped.get_batch(batch_id)
    if batch is None:
        raise BatchNotFound()
    return {**_shown(scoped, batch), "students": [_person(scoped, e) for e in sorted(batch.get("students", []))]}


# ---- Access ----

def _needed(scoped: TenantRepo, email: str, skip_batch: str | None = None) -> set[str]:
    """Courses that the student's active batches (other than skip_batch) still need."""
    need: set[str] = set()
    for batch in scoped.list_batches():
        if batch["id"] != skip_batch and batch.get("status", "active") == "active" and email in batch.get("students", []):
            need.update(batch["course_ids"])
    return need


def _open(scoped: TenantRepo, email: str, course_ids: list[str], admin_email: str) -> None:
    for course_id in course_ids:
        existing = scoped.get_access(email, course_id)
        if existing is not None and content.is_active(existing):
            continue  # already open (by the admin or an earlier grant): leave it exactly as it is
        content.grant_access(scoped, email, course_id, admin_email, source="batch")


def _close(scoped: TenantRepo, email: str, course_ids: list[str], still_needed: set[str]) -> None:
    for course_id in course_ids:
        access = scoped.get_access(email, course_id)
        if access is not None and access.get("source") == "batch" and course_id not in still_needed:
            scoped.delete_access(email, course_id)


# ---- Changes ----

def create(scoped: TenantRepo, body: dict, admin_email: str) -> dict:
    fields = _clean(scoped, body, None)
    batch = {"id": uuid4().hex, "status": "active", "students": [], "seat_limit": None, "faculty": "", "schedule": "", "start_date": "", "end_date": "",
             **fields, "created_at": now_iso(), "created_by": admin_email}
    scoped.put_batch(batch)
    return detail(scoped, batch["id"])


def update(scoped: TenantRepo, batch_id: str, body: dict, admin_email: str) -> dict:
    batch = scoped.get_batch(batch_id)
    if batch is None:
        raise BatchNotFound()
    fields = _clean(scoped, body, batch)
    before_courses, before_status = list(batch["course_ids"]), batch.get("status", "active")
    changed = {**batch, **fields}
    scoped.put_batch(changed)
    after_courses, after_status = changed["course_ids"], changed.get("status", "active")
    for email in changed.get("students", []):
        if before_status == "active" and after_status == "archived":
            _close(scoped, email, before_courses, _needed(scoped, email))
        elif before_status == "archived" and after_status == "active":
            _open(scoped, email, after_courses, admin_email)
        elif after_status == "active":
            _open(scoped, email, [c for c in after_courses if c not in before_courses], admin_email)
            _close(scoped, email, [c for c in before_courses if c not in after_courses], _needed(scoped, email))
    return detail(scoped, batch_id)


def enrol(scoped: TenantRepo, batch_id: str, emails, admin_email: str) -> dict:
    """Put approved students in the batch and open its courses. Stops with nothing changed if the seats would run out."""
    batch = scoped.get_batch(batch_id)
    if batch is None:
        raise BatchNotFound()
    if batch.get("status", "active") != "active":
        raise ValidationError("This batch is archived. Make it active again before adding students.")
    if not isinstance(emails, list) or not emails:
        raise ValidationError("Choose at least one student.")
    wanted = list(dict.fromkeys(str(e).strip().lower() for e in emails))
    new = []
    for email in wanted:
        person = scoped.get_member(email)
        if person is None or person.get("role") != "student":
            raise ValidationError(f"{email} is not a student here.")
        if person.get("status") != "approved":
            raise ValidationError(f"{email} is not approved yet, so they can't join a batch.")
        if email not in batch.get("students", []):
            new.append(email)
    limit = batch.get("seat_limit")
    if limit is not None and len(batch.get("students", [])) + len(new) > limit:
        raise BatchFull(f"This batch has {max(0, limit - len(batch.get('students', [])))} seats left, and you chose {len(new)} new students.")
    if new:
        scoped.put_batch({**batch, "students": sorted(set(batch.get("students", [])) | set(new))})
        for email in new:
            _open(scoped, email, batch["course_ids"], admin_email)
    return detail(scoped, batch_id)


def remove(scoped: TenantRepo, batch_id: str, email: str) -> dict:
    batch = scoped.get_batch(batch_id)
    if batch is None:
        raise BatchNotFound()
    email = str(email).strip().lower()
    if email in batch.get("students", []):
        scoped.put_batch({**batch, "students": [e for e in batch["students"] if e != email]})
        _close(scoped, email, batch["course_ids"], _needed(scoped, email, skip_batch=batch_id))
    return detail(scoped, batch_id)


# ---- What a student or parent sees ----

def for_student(scoped: TenantRepo, email: str) -> list[dict]:
    """The student's active batches: name, courses, dates, faculty and timetable. Never the other students."""
    out = []
    for batch in scoped.list_batches():
        if batch.get("status", "active") == "active" and email in batch.get("students", []):
            shown = _shown(scoped, batch)
            out.append({key: shown[key] for key in ("id", "name", "course_names", "start_date", "end_date", "faculty", "schedule")})
    return out
