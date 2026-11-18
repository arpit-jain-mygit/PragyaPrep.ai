"""A student's or parent's own profile: the details they keep themselves, apart from the ones the institute owns.

The institute owns a person's name, email, courses and status. The person owns the rest:
 - a student: photo, birth date, mobile, the exams they are aiming for, the exam date, a weekly study goal, and which
   emails they want;
 - a parent: photo, mobile, how they are related to the child, how often they want a progress summary, and their consent to
   be contacted about the child.
Everything is saved as extra fields on the member record. Nothing here changes who a person is or what they may open.
"""
from datetime import date

from app import clock
from app.mailer import Email, Mailer, send_quietly
from app.registrations import clean_mobile
from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

STUDENT, PARENT = "student", "parent"
RELATIONS = ("Mother", "Father", "Guardian", "Other")
SUMMARIES = ("weekly", "monthly", "off")
STUDENT_NOTICES = ("announcements", "tests", "live_classes")
MAX_EXAMS = 5
MAX_GOAL_HOURS = 80

STUDENT_DEFAULTS = {"birth_date": "", "mobile": "", "target_exams": [], "exam_date": "", "weekly_goal_hours": 0,
                    "notify": {"announcements": True, "tests": True, "live_classes": True}}
PARENT_DEFAULTS = {"mobile": "", "relation": "", "summary": "weekly", "consent": False}


def _kind(member: dict) -> str:
    if member.get("role") not in (STUDENT, PARENT):
        raise ValidationError("Only students and parents have a profile.")
    return member["role"]


def _name(person: dict) -> str:
    return f"{person.get('first_name', '')} {person.get('last_name', '')}".strip() or person["email"]


def read(scoped: TenantRepo, member: dict) -> dict:
    """The person's profile with every field filled in (a default where they have not chosen yet), plus the people linked to them."""
    kind = _kind(member)
    defaults = STUDENT_DEFAULTS if kind == STUDENT else PARENT_DEFAULTS
    fields = {key: member.get(key, default) for key, default in defaults.items()}
    if kind == STUDENT:
        fields["notify"] = {**defaults["notify"], **(member.get("notify") or {})}
    profile = {"role": kind, "email": member["email"], "first_name": member.get("first_name", ""), "last_name": member.get("last_name", ""), **fields,
               "deletion_requested": bool(member.get("deletion_requested_at"))}
    profile["linked"] = linked(scoped, member)
    return profile


def linked(scoped: TenantRepo, member: dict) -> list[dict]:
    """A student's parents, or a parent's children, as name and email."""
    people = []
    if member["role"] == PARENT:
        for email in member.get("children", []):
            child = scoped.get_member(email)
            if child is not None:
                people.append({"name": _name(child), "email": child["email"]})
    else:
        for parent in scoped.all_members_by_status("approved"):
            if parent.get("role") == PARENT and member["email"] in parent.get("children", []):
                people.append({"name": _name(parent), "email": parent["email"]})
    return sorted(people, key=lambda p: p["name"].lower())


def _birth_date(raw) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        born = date.fromisoformat(text)
    except ValueError:
        raise ValidationError("Enter your birth date as YYYY-MM-DD.")
    today = date.fromtimestamp(clock.now())
    if born >= today or today.year - born.year > 80:
        raise ValidationError("Enter a valid birth date.")
    return born.isoformat()


def _exam_date(raw) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    try:
        day = date.fromisoformat(text)
    except ValueError:
        raise ValidationError("Enter the exam date as YYYY-MM-DD.")
    today = date.fromtimestamp(clock.now())
    if day < today or day.year > today.year + 5:
        raise ValidationError("The exam date must be today or later, within the next five years.")
    return day.isoformat()


def _mobile(raw) -> str:
    if raw in (None, ""):
        return ""
    number = clean_mobile(str(raw))
    if number is None:
        raise ValidationError("Enter a 10-digit Indian mobile number, or leave it empty.")
    return number


def _exams(raw) -> list[str]:
    if not isinstance(raw, list):
        raise ValidationError("Target exams must be a list.")
    seen: list[str] = []
    for item in raw:
        text = " ".join(str(item or "").split())
        if not text:
            continue
        if len(text) > 40:
            raise ValidationError("An exam name can be up to 40 characters.")
        if text.lower() not in (s.lower() for s in seen):
            seen.append(text)
    if len(seen) > MAX_EXAMS:
        raise ValidationError(f"You can list up to {MAX_EXAMS} exams.")
    return seen


def _goal(raw) -> int:
    if isinstance(raw, bool) or not isinstance(raw, int) or not 0 <= raw <= MAX_GOAL_HOURS:
        raise ValidationError(f"The weekly goal is a whole number of hours from 0 to {MAX_GOAL_HOURS}.")
    return raw


def _notify(raw) -> dict:
    if not isinstance(raw, dict) or set(raw) - set(STUDENT_NOTICES) or not all(isinstance(v, bool) for v in raw.values()):
        raise ValidationError("Notification choices are on or off for announcements, tests and live classes.")
    return raw


def save(scoped: TenantRepo, member: dict, body: dict) -> dict:
    """Save the fields that were sent (the others stay as they are) and return the new profile. Raises ValidationError."""
    kind = _kind(member)
    checks = (
        {"birth_date": _birth_date, "mobile": _mobile, "target_exams": _exams, "exam_date": _exam_date, "weekly_goal_hours": _goal, "notify": _notify}
        if kind == STUDENT else
        {"mobile": _mobile, "relation": _relation, "summary": _summary, "consent": _consent}
    )
    unknown = [key for key in body if key not in checks]
    if unknown:
        raise ValidationError(f"These can't be changed here: {', '.join(sorted(unknown))}.")
    fields = {key: checks[key](value) for key, value in body.items()}
    if kind == STUDENT and "notify" in fields:
        fields["notify"] = {**STUDENT_DEFAULTS["notify"], **(member.get("notify") or {}), **fields["notify"]}
    if kind == PARENT and "consent" in fields and fields["consent"] != bool(member.get("consent")):
        fields["consent_at"] = now_iso()
    if fields:
        scoped.update_member(member["email"], **fields)
    return read(scoped, scoped.get_member(member["email"]))


def _relation(raw) -> str:
    if raw in (None, ""):
        return ""
    if raw not in RELATIONS:
        raise ValidationError("Choose Mother, Father, Guardian or Other.")
    return raw


def _summary(raw) -> str:
    if raw not in SUMMARIES:
        raise ValidationError("Choose weekly, monthly or off.")
    return raw


def _consent(raw) -> bool:
    if not isinstance(raw, bool):
        raise ValidationError("Consent is a yes or no.")
    return raw


# ---- Their data ----

def export(scoped: TenantRepo, member: dict) -> dict:
    """Everything stored about the person, as a plain document they can keep. Never includes storage keys or login codes."""
    profile = read(scoped, member)
    out = {"exported_at": now_iso(), "profile": profile, "joined": member.get("created_at", ""), "status": member.get("status", "")}
    if member["role"] == STUDENT:
        out["courses"] = member.get("course_ids") or ([member["course_id"]] if member.get("course_id") else [])
        if member.get("free_course"):
            out["free_course"] = member["free_course"]
    return out


def request_deletion(scoped: TenantRepo, mailer: Mailer, tenant: dict, member: dict) -> None:
    """Record that the person wants their account and data deleted, and tell the institute's admin. Nothing is deleted yet: the admin decides."""
    _kind(member)
    if member.get("deletion_requested_at"):
        raise ValidationError("You have already asked for your account to be deleted. The institute will contact you.")
    scoped.update_member(member["email"], deletion_requested_at=now_iso())
    send_quietly(mailer, Email(
        to=tenant["admin_email"], from_name="PragyaPrep", subject=f"Deletion request from {_name(member)}",
        body=f"{_name(member)} <{member['email']}> ({member['role']}) has asked for their account and data to be deleted.\n"
             "Please reply to them, then remove them from your registrations or parents list.",
    ))


def cancel_deletion(scoped: TenantRepo, member: dict) -> None:
    _kind(member)
    scoped.update_member(member["email"], deletion_requested_at="")
