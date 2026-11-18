"""Registration: checking the form, saving it, the admin's decisions, and the emails that go with them."""
import logging
import re
from datetime import date

from app import clock
from app.config import Settings
from app.limits import check_limit, fingerprint
from app.mailer import Email, Mailer, send_quietly
from app.repo import ConflictError, Repo, TenantRepo, now_iso
from app.tenants import ValidationError, normalize_email

logger = logging.getLogger(__name__)

GENDERS = {"male", "female", "other", "prefer_not_to_say"}
STATUSES = ("pending", "approved", "rejected", "suspended")

# What the admin can do with a registration: the statuses it may be in now, and the status it moves to.
ACTIONS = {
    "approve": (["pending", "rejected"], "approved"),
    "reject": (["pending"], "rejected"),
    "suspend": (["approved"], "suspended"),
    "reactivate": (["suspended"], "approved"),
}

MIN_AGE, MAX_AGE = 10, 80


class FormErrors(Exception):
    """The form has mistakes. 'errors' maps each field to a message that can be shown next to it."""

    def __init__(self, errors: dict[str, str]):
        super().__init__("The form has mistakes")
        self.errors = errors


class AlreadyRegistered(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class RegistrationNotFound(Exception):
    pass


class InvalidTransition(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


# ---- Checking the form ----

def clean_mobile(raw: str) -> str | None:
    """A 10-digit Indian mobile number, or None. Accepts spaces, dashes, a leading +91, 91 or 0."""
    digits = re.sub(r"[\s\-()]", "", raw)
    if digits.startswith("+91"):
        digits = digits[3:]
    elif len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if re.fullmatch(r"[6-9]\d{9}", digits) else None


def _text(raw, minimum: int, maximum: int) -> str | None:
    value = " ".join(str(raw or "").split())
    return value if minimum <= len(value) <= maximum else None


BLANK_OK_FIELDS = ("birth_date", "gender", "whatsapp", "address", "city", "pin_code")


def validate_form(form: dict, open_courses: dict[str, dict], today: date, blank_ok: frozenset = frozenset()) -> dict:
    """Check every field and report every mistake at once, so the person can fix the form in one go.

    blank_ok names fields that may stay empty: a student the admin imported without them. A value that is given is still checked."""
    errors: dict[str, str] = {}
    clean: dict = {}

    def may_skip(field: str, raw) -> bool:
        return field in blank_ok and not str(raw or "").strip()

    try:
        clean["email"] = normalize_email(form.get("email") or "")
    except ValidationError as error:
        errors["email"] = str(error)

    for field, label in (("first_name", "first name"), ("last_name", "last name")):
        value = _text(form.get(field), 1, 60)
        if value is None:
            errors[field] = f"Enter your {label} (up to 60 characters)."
        else:
            clean[field] = value

    raw_birth = (form.get("birth_date") or "").strip()
    if may_skip("birth_date", raw_birth):
        pass
    elif not raw_birth:
        errors["birth_date"] = "Enter your birth date."
    else:
        try:
            born = date.fromisoformat(raw_birth)
        except ValueError:
            errors["birth_date"] = "Enter your birth date as YYYY-MM-DD."
        else:
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            if not MIN_AGE <= age <= MAX_AGE:
                errors["birth_date"] = "Enter a valid birth date."
            else:
                clean["birth_date"] = born.isoformat()

    gender = (form.get("gender") or "").strip().lower()
    if may_skip("gender", gender):
        pass
    elif gender in GENDERS:
        clean["gender"] = gender
    else:
        errors["gender"] = "Choose a gender from the list."

    mobile = clean_mobile(form.get("mobile") or "")
    if mobile is None:
        errors["mobile"] = "Enter a 10-digit Indian mobile number."
    else:
        clean["mobile"] = mobile

    if form.get("whatsapp_same_as_mobile"):
        if mobile is not None:
            clean["whatsapp"] = mobile
    elif not may_skip("whatsapp", form.get("whatsapp")):
        whatsapp = clean_mobile(form.get("whatsapp") or "")
        if whatsapp is None:
            errors["whatsapp"] = "Enter a 10-digit WhatsApp number, or tick 'same as mobile'."
        else:
            clean["whatsapp"] = whatsapp

    address = _text(form.get("address"), 5, 300)
    if may_skip("address", form.get("address")):
        pass
    elif address is None:
        errors["address"] = "Enter your complete address (5 to 300 characters)."
    else:
        clean["address"] = address

    city = _text(form.get("city"), 2, 60)
    if may_skip("city", form.get("city")):
        pass
    elif city is None:
        errors["city"] = "Enter your city."
    else:
        clean["city"] = city

    pin_code = (form.get("pin_code") or "").strip()
    if may_skip("pin_code", pin_code):
        pass
    elif re.fullmatch(r"[1-9]\d{5}", pin_code):
        clean["pin_code"] = pin_code
    else:
        errors["pin_code"] = "Enter a 6-digit PIN code."

    wanted = form.get("course_ids")
    if wanted is None:  # an older caller that sends one course
        wanted = [form["course_id"]] if form.get("course_id") else []
    if not open_courses:
        errors["course_ids"] = "No courses are open for registration yet."
    elif not isinstance(wanted, list) or not all(isinstance(item, str) for item in wanted):
        errors["course_ids"] = "Choose the courses from the list."
    elif not wanted:
        errors["course_ids"] = "Choose at least one course."
    elif any(item not in open_courses for item in wanted):
        errors["course_ids"] = "Choose the courses from the list."
    else:
        clean["course_ids"] = list(dict.fromkeys(wanted))

    if errors:
        raise FormErrors(errors)
    return clean


# ---- Emails ----

def courses_of(person: dict) -> tuple[list[str], list[str]]:
    """A student's chosen courses as (ids, names). Older registrations hold a single course; that is their one choice."""
    if person.get("course_ids"):
        return list(person["course_ids"]), list(person.get("course_names") or [])
    if person.get("course_id"):
        return [person["course_id"]], [person.get("course_name") or ""]
    return [], []


def _course_phrase(record: dict) -> str:
    """'CAT', 'CAT and CLAT' or 'CAT, CLAT and IPMAT', for emails."""
    names = [name for name in courses_of(record)[1] if name]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1] if names else "your course"


def _received_email(tenant: dict, record: dict) -> Email:
    name = tenant["branding"]["display_name"]
    return Email(
        to=record["email"],
        from_name=name,
        subject=f"We received your registration with {name}",
        body=(
            f"Hello {record['first_name']},\n\n"
            f"Thank you for registering with {name} for {_course_phrase(record)}.\n"
            "Your registration is waiting for approval. We'll email you once it's approved.\n\n"
            "You can check where it stands at any time by trying to log in with this email address."
        ),
    )


def _approved_email(tenant: dict, record: dict) -> Email:
    name = tenant["branding"]["display_name"]
    return Email(
        to=record["email"],
        from_name=name,
        subject=f"Your registration with {name} is approved",
        body=(
            f"Hello {record['first_name']},\n\n"
            f"Good news: your registration with {name} has been approved.\n"
            "You can now log in with this email address. We'll send you a 6-digit code each time you log in.\n"
            f"After you log in, you'll see how to pay and get access to {_course_phrase(record)}."
        ),
    )


def _rejected_email(tenant: dict, record: dict, reason: str) -> Email:
    name = tenant["branding"]["display_name"]
    lines = [
        f"Hello {record['first_name']},\n",
        f"We're sorry: your registration with {name} wasn't approved.",
    ]
    if reason:
        lines.append(f"\nReason: {reason}")
    lines.append(f"\nIf you think this is a mistake, please contact {name}.")
    return Email(to=record["email"], from_name=name, subject=f"About your registration with {name}", body="\n".join(lines))


# ---- Registering ----

def _already_registered_message(member: dict, institute_name: str) -> str:
    if member["role"] == "student" and member["status"] == "pending":
        return "This email is already registered. Your registration is waiting for approval."
    if member["status"] == "suspended":
        return f"Your access is paused. Contact {institute_name}."
    return "This email is already registered. Log in with the code we'll email you."


def register(settings: Settings, repo: Repo, tenant: dict, form: dict, ip: str, mailer: Mailer) -> dict:
    """Save a new registration as 'pending' and email a receipt. Raises FormErrors or AlreadyRegistered."""
    check_limit(repo, f"ip-register:{fingerprint(ip)}", settings.registrations_per_hour_per_ip, 3600,
                "Too many registrations from this connection.")

    scoped = repo.scoped(tenant["slug"])
    institute_name = tenant["branding"]["display_name"]
    open_courses = {course["id"]: course for course in scoped.list_courses() if course.get("active", True)}

    # Mistakes in the form are reported before we say anything about whether the email is already known.
    clean = validate_form(form, open_courses, clock.today_india())

    record = {
        **clean,
        "role": "student",
        "status": "pending",
        "course_names": [open_courses[course_id]["name"] for course_id in clean["course_ids"]],
        # The first choice is also kept as a single course, for anything that still reads one.
        "course_id": clean["course_ids"][0],
        "course_name": open_courses[clean["course_ids"][0]]["name"],
        "created_at": now_iso(),
    }

    existing = scoped.get_member(clean["email"])
    if existing is None:
        try:
            scoped.create_member(record)
        except ConflictError:
            # Someone registered this email a moment ago.
            existing = scoped.get_member(clean["email"])
            raise AlreadyRegistered(_already_registered_message(existing, institute_name))
    elif existing["role"] == "student" and existing["status"] == "rejected":
        # A rejected student may try again. The new form replaces the old one.
        if not scoped.replace_rejected_member(record):
            raise AlreadyRegistered(_already_registered_message(scoped.get_member(clean["email"]), institute_name))
    else:
        raise AlreadyRegistered(_already_registered_message(existing, institute_name))

    send_quietly(mailer, _received_email(tenant, record))
    return record


# ---- The admin's review queue ----

def list_registrations(scoped: TenantRepo, status: str) -> list[dict]:
    """Students with this status, newest first. 'all' lists every status."""
    if status != "all" and status not in STATUSES:
        raise ValidationError("Status must be pending, approved, rejected, suspended or all.")
    wanted = STATUSES if status == "all" else (status,)
    people = [person for state in wanted for person in scoped.all_members_by_status(state)]
    students = [person for person in people if person.get("role") == "student"]
    return sorted(students, key=lambda person: person.get("created_at", ""), reverse=True)


def decide(
    scoped: TenantRepo, tenant: dict, mailer: Mailer, action: str, email: str, admin_email: str, reason: str = ""
) -> tuple[dict, bool]:
    """Approve, reject, suspend or reactivate a registration. Returns (the registration, whether an email went out)."""
    email = normalize_email(email)
    person = scoped.get_member(email)
    if person is None or person.get("role") != "student":
        raise RegistrationNotFound()

    allowed_from, to_status = ACTIONS[action]
    reason = " ".join((reason or "").split())[:300] if action == "reject" else ""
    moved = scoped.transition_member(
        email, allowed_from, to_status, decided_by=admin_email, decided_at=now_iso(), reason=reason
    )
    if not moved:
        current = scoped.get_member(email)["status"]
        raise InvalidTransition(f"You can't {action} a registration that is {current}.")

    updated = scoped.get_member(email)
    email_sent = False
    if action == "approve":
        email_sent = send_quietly(mailer, _approved_email(tenant, updated))
    elif action == "reject":
        email_sent = send_quietly(mailer, _rejected_email(tenant, updated, reason))
    return updated, email_sent


# ---- Corrections by the admin ----

EDITABLE = ("email", "first_name", "last_name", "birth_date", "gender", "mobile", "whatsapp", "address", "city", "pin_code", "course_ids")


def _email_changed_email(tenant: dict, record: dict) -> Email:
    name = tenant["branding"]["display_name"]
    return Email(
        to=record["email"],
        from_name=name,
        subject=f"Your email with {name} was corrected",
        body=(
            f"Hello {record['first_name']},\n\n"
            f"{name} has corrected the email address on your registration. It is now this address.\n"
            "Please use it to log in. We'll send a 6-digit code each time you log in."
        ),
    )


def _sync_access(scoped: TenantRepo, email: str, person: dict, before: list[str], after: list[str], admin_email: str) -> None:
    """The courses on a registration were changed: a course taken off loses its access, and one added is opened (for an approved
    student). Access the student has to other courses is left alone."""
    from app import content  # imported here because content is loaded after this module

    for course_id in set(before) - set(after):
        if scoped.get_access(email, course_id) is not None:
            scoped.delete_access(email, course_id)
    if person.get("status") == "approved":
        for course_id in [c for c in after if c not in before]:
            try:
                content.grant_access(scoped, email, course_id, admin_email, source="edit")
            except Exception:
                logger.exception("Could not open a course after an edit")


def edit(
    scoped: TenantRepo, tenant: dict, mailer: Mailer, email: str, changes: dict, admin_email: str
) -> tuple[dict, bool]:
    """Correct a student's details, including their email. Only the fields in 'changes' are touched.

    Every field is checked again with the rule used at registration. Returns (the registration, whether an email went out).
    Raises RegistrationNotFound, or FormErrors (including when the new email already belongs to someone).
    """
    email = normalize_email(email)
    person = scoped.get_member(email)
    if person is None or person.get("role") != "student":
        raise RegistrationNotFound()

    if "course_id" in changes and "course_ids" not in changes and changes["course_id"]:
        changes = {**changes, "course_ids": [changes["course_id"]]}  # an older caller that sends one course
    changes = {name: value for name, value in changes.items() if name in EDITABLE + ("whatsapp_same_as_mobile",) and value is not None}
    same = changes.get(
        "whatsapp_same_as_mobile", "whatsapp" not in changes and person.get("whatsapp") == person.get("mobile")
    )
    current_ids, _ = courses_of(person)
    form = {**person, "course_ids": current_ids, **changes, "whatsapp_same_as_mobile": same}
    form.pop("course_id", None)

    # The student's own courses are always allowed, even if the institute has since hidden one.
    courses = {course["id"]: course for course in scoped.list_courses() if course.get("active", True) or course["id"] in current_ids}
    taken = "Someone at this institute is already registered with that email."
    # Fields a student was imported without may stay blank; anything typed is still checked.
    blank_ok = frozenset(name for name in BLANK_OK_FIELDS if not person.get(name))
    try:
        clean = validate_form(form, courses, clock.today_india(), blank_ok)
    except FormErrors as error:
        # Say so about a taken email in the same pass, so the admin can fix everything in one go.
        wanted = (changes.get("email") or "").strip().lower()
        if "email" not in error.errors and wanted and wanted != email and scoped.get_member(wanted) is not None:
            error.errors["email"] = taken
        raise

    new_email = clean["email"]
    fields = {name: clean[name] for name in EDITABLE[1:-1] if name in clean and clean[name] != person.get(name)}
    if clean["course_ids"] != current_ids:
        fields["course_ids"] = clean["course_ids"]
        fields["course_names"] = [courses[course_id]["name"] for course_id in clean["course_ids"]]
        fields["course_id"] = clean["course_ids"][0]
        fields["course_name"] = courses[clean["course_ids"][0]]["name"]

    if new_email == email and not fields:
        return person, False

    audit = {"edited_by": admin_email, "edited_at": now_iso()}
    changed_courses = clean["course_ids"] != current_ids
    if new_email == email:
        scoped.update_member(email, **fields, **audit)
        if changed_courses:
            _sync_access(scoped, email, person, current_ids, clean["course_ids"], admin_email)
        return scoped.get_member(email), False

    moved = {**person, **fields, **audit, "email": new_email, "previous_email": email}
    try:
        scoped.move_member(email, moved)
    except ConflictError:
        raise FormErrors({"email": taken})
    scoped.delete_otp(email)
    from app import parents  # imported here because parents itself uses this module

    parents.relink(scoped, email, new_email)
    if changed_courses:
        _sync_access(scoped, new_email, person, current_ids, clean["course_ids"], admin_email)
    updated = scoped.get_member(new_email)
    return updated, send_quietly(mailer, _email_changed_email(tenant, updated))
