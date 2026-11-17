"""Courses: what an institute offers, with a fee and how long a student keeps access after paying."""
from datetime import date
from uuid import uuid4

from app import clock, papers as paper_list
from app.repo import ConflictError, TenantRepo, now_iso
from app.tenants import ValidationError

MAX_FEE = 10_000_000  # rupees
MAX_DAYS = 3650


class CourseNotFound(Exception):
    pass


def clean_name(raw: str) -> str:
    name = " ".join(str(raw).split())
    if not 1 <= len(name) <= 80:
        raise ValidationError("The course name must be 1 to 80 characters.")
    return name


def clean_fee(raw) -> int:
    # bool is a kind of int in Python, so rule it out by hand: True is not a fee of 1.
    if isinstance(raw, bool) or not isinstance(raw, int) or not 0 <= raw <= MAX_FEE:
        raise ValidationError("The fee must be a whole number of rupees, from 0 to 10,000,000.")
    return raw


def clean_access(access: dict | None) -> dict:
    """How long access lasts: no end, a number of days after payment is verified, or until a fixed date."""
    access = access or {}
    kind = access.get("type") or "unlimited"

    if kind == "unlimited":
        return {"type": "unlimited"}

    if kind == "days":
        days = access.get("days")
        if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= MAX_DAYS:
            raise ValidationError("Enter the number of days, from 1 to 3650.")
        return {"type": "days", "days": days}

    if kind == "until_date":
        try:
            until = date.fromisoformat(access.get("until") or "")
        except ValueError:
            raise ValidationError("Enter the end date as YYYY-MM-DD.")
        if until < clock.today_india():
            raise ValidationError("The end date can't be in the past.")
        return {"type": "until_date", "until": until.isoformat()}

    raise ValidationError("Access length must be 'unlimited', 'days' or 'until_date'.")


def clean_papers(raw) -> list[str]:
    """The papers (subjects) a course covers: ids from the fixed paper list, each once, in the list's own order."""
    if not isinstance(raw, list) or not all(isinstance(item, str) for item in raw):
        raise ValidationError("Choose the papers from the list.")
    unknown = [item for item in raw if item not in paper_list.BY_ID]
    if unknown:
        raise ValidationError("Choose the papers from the list.")
    chosen = set(raw)
    return [paper["id"] for paper in paper_list.PAPERS if paper["id"] in chosen]


def create_course(scoped: TenantRepo, name: str, fee: int, access: dict | None = None, papers=None) -> dict:
    """papers: the ids the admin chose. Left out (None), the usual papers for the course name are used, if we know it."""
    course = {
        "id": uuid4().hex,
        "name": clean_name(name),
        "fee": clean_fee(fee),
        "access": clean_access(access),
        "papers": clean_papers(papers) if papers is not None else paper_list.suggested_for(name),
        "active": True,
        "created_at": now_iso(),
    }
    try:
        scoped.create_course(course)
    except ConflictError:
        raise ValidationError(f"A course called '{course['name']}' already exists.")
    return course


def update_course(
    scoped: TenantRepo,
    course_id: str,
    name: str | None = None,
    fee: int | None = None,
    access: dict | None = None,
    active: bool | None = None,
    papers=None,
) -> dict:
    """Change a course. Only the things you pass are changed. Existing students keep the access they already have."""
    course = scoped.get_course(course_id)
    if course is None:
        raise CourseNotFound()

    fields = {}
    if fee is not None:
        fields["fee"] = clean_fee(fee)
    if access is not None:
        fields["access"] = clean_access(access)
    if active is not None:
        fields["active"] = bool(active)
    if papers is not None:
        fields["papers"] = clean_papers(papers)
    if fields:
        scoped.update_course(course_id, **fields)

    if name is not None:
        new_name = clean_name(name)
        if new_name != course["name"]:
            try:
                scoped.rename_course(course_id, course["name"], new_name)
            except ConflictError:
                raise ValidationError(f"A course called '{new_name}' already exists.")
    return scoped.get_course(course_id)


def public_courses(scoped: TenantRepo) -> list[dict]:
    """What the registration dropdown shows: open courses only, with just the id, name and fee."""
    return [
        {"id": course["id"], "name": course["name"], "fee": course["fee"]}
        for course in scoped.list_courses()
        if course.get("active", True)
    ]
