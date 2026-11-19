"""Parents: people who can see how their child (a student of the institute) is doing, and set the child practice tests.

A parent is an approved member with the role 'parent' and a list of their children's emails. The admin adds them one by one or
from an Excel sheet (see parent_import); each parent signs in with an emailed code like everyone else. A parent can have
several children (they are linked by adding the same parent email again), and a child can have several parents.
"""
from app.config import Settings
from app.mailer import Email, Mailer, send_quietly
from app.registrations import _text, clean_mobile
from app.repo import ConflictError, TenantRepo, now_iso
from app.tenants import ValidationError, normalize_email

PARENT = "parent"
MAX_CHILDREN = 6


class ParentNotFound(Exception):
    pass


class FieldErrors(Exception):
    """The form has mistakes. 'errors' maps each field to a message to show next to it."""

    def __init__(self, errors: dict[str, str]):
        super().__init__("The form has mistakes")
        self.errors = errors


def _name(member: dict) -> str:
    return " ".join(p for p in (member.get("first_name"), member.get("last_name")) if p) or member["email"]


def find_student(scoped: TenantRepo, email: str) -> dict:
    student = scoped.get_member(email)
    if student is None or student.get("role") != "student":
        raise ValidationError(f"There is no student with the email {email} here. Register or import the student first.")
    return student


def clean_people(first, last, mobile, email, admin_email: str) -> tuple[dict, dict]:
    """The parent's own details, and the problems by field."""
    problems: dict[str, str] = {}
    record: dict = {}
    try:
        record["email"] = normalize_email(email)
        if record["email"] == admin_email.lower():
            problems["email"] = "This is the institute admin's own email."
            record.pop("email")
    except ValidationError as error:
        problems["email"] = str(error)
    for field, value, label in (("first_name", first, "first name"), ("last_name", last, "last name")):
        clean = _text(value, 1, 60)
        if clean is None:
            problems[field] = f"Enter the {label} (up to 60 characters)."
        else:
            record[field] = clean
    record["mobile"] = ""
    if mobile not in (None, ""):
        number = clean_mobile(str(mobile))
        if number is None:
            problems["mobile"] = "Enter a 10-digit Indian mobile number, or leave it empty."
        else:
            record["mobile"] = number
    return record, problems


def shown(scoped: TenantRepo, parent: dict) -> dict:
    kids = []
    for email in parent.get("children", []):
        child = scoped.get_member(email)
        kids.append({"email": email, "name": _name(child) if child else email})
    return {"email": parent["email"], "name": _name(parent), "mobile": parent.get("mobile", ""), "children": kids, "created_at": parent.get("created_at", "")}


def listing(scoped: TenantRepo) -> list[dict]:
    people = [m for m in scoped.all_members_by_status("approved") if m.get("role") == PARENT]
    return [shown(scoped, p) for p in sorted(people, key=lambda p: _name(p).lower())]


def listing_page(scoped: TenantRepo, limit: int, offset: int = 0) -> tuple[list[dict], int | None]:
    """One page of parents, by name, from `offset`, and the offset of the next page (None when there are no more).
    Only the parents on the page get their children looked up."""
    people = [m for m in scoped.all_members_by_status("approved") if m.get("role") == PARENT]
    ordered = sorted(people, key=lambda p: _name(p).lower())
    page = ordered[offset:offset + limit]
    next_offset = offset + limit if offset + limit < len(ordered) else None
    return [shown(scoped, p) for p in page], next_offset


def _welcome_email(tenant: dict, settings: Settings, parent: dict, child_names: list[str]) -> Email:
    name = tenant["branding"]["display_name"]
    who = child_names[0] if len(child_names) == 1 else ", ".join(child_names[:-1]) + " and " + child_names[-1]
    return Email(
        to=parent["email"], from_name=name, subject=f"Welcome to {name}",
        body=(
            f"Hello {parent['first_name']},\n\n"
            f"{name} has added you as the parent of {who}. You can see how they are doing and set them practice tests.\n"
            f"Log in with this email address at {settings.frontend_url.rstrip('/')}/{tenant['slug']}/login. "
            "We'll send you a 6-digit code each time you log in."
        ),
    )


def link(scoped: TenantRepo, record: dict, children: list[str], admin_email: str) -> tuple[dict, bool]:
    """Make the parent (or add children to the one that exists). Returns (the parent, whether they are new)."""
    existing = scoped.get_member(record["email"])
    if existing is not None and existing.get("role") != PARENT:
        raise ValidationError(f"This email is already registered here as a {existing.get('role')}.")
    if existing is None:
        parent = {**record, "role": PARENT, "status": "approved", "children": list(children), "created_at": now_iso(), "decided_by": admin_email, "decided_at": now_iso()}
        try:
            scoped.create_member(parent)
        except ConflictError:
            raise ValidationError("This email was just added. Please try again.")
        return parent, True
    merged = list(dict.fromkeys([*existing.get("children", []), *children]))
    if len(merged) > MAX_CHILDREN:
        raise ValidationError(f"A parent can have up to {MAX_CHILDREN} children.")
    scoped.update_member(record["email"], children=merged)
    return {**existing, "children": merged}, False


def add(scoped: TenantRepo, tenant: dict, settings: Settings, mailer: Mailer, admin_email: str, body: dict) -> dict:
    record, problems = clean_people(body.get("first_name"), body.get("last_name"), body.get("mobile"), body.get("email"), admin_email)
    child_email = None
    try:
        child_email = normalize_email(body.get("student_email") or "")
        child = find_student(scoped, child_email)
    except ValidationError as error:
        problems["student_email"] = str(error)
        child = None
    if problems:
        raise FieldErrors(problems)
    existing = scoped.get_member(record["email"])
    if existing is not None and existing.get("role") == PARENT and child_email in existing.get("children", []):
        raise ValidationError("This parent is already linked to that student.")
    parent, is_new = link(scoped, record, [child_email], admin_email)
    send_quietly(mailer, _welcome_email(tenant, settings, parent, [_name(child)]))
    return shown(scoped, parent)


def remove(scoped: TenantRepo, email: str) -> None:
    person = scoped.get_member(normalize_email(email))
    if person is None or person.get("role") != PARENT:
        raise ParentNotFound()
    scoped.delete_member(person["email"])
    scoped.delete_otp(person["email"])


def unlink(scoped: TenantRepo, email: str, child_email: str) -> dict:
    person = scoped.get_member(normalize_email(email))
    if person is None or person.get("role") != PARENT or child_email not in person.get("children", []):
        raise ParentNotFound()
    scoped.update_member(person["email"], children=[c for c in person["children"] if c != child_email])
    return shown(scoped, scoped.get_member(person["email"]))


def relink(scoped: TenantRepo, old_email: str, new_email: str) -> None:
    """A student's email changed: the parents who point at the old one follow it."""
    for parent in (m for m in scoped.all_members_by_status("approved") if m.get("role") == PARENT and old_email in m.get("children", [])):
        scoped.update_member(parent["email"], children=[new_email if c == old_email else c for c in parent["children"]])
