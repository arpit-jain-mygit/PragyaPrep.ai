"""Registration: checking the form, saving it, the admin's decisions, and the emails that go with them."""
import logging
import re
from datetime import date

from app import clock
from app.config import Settings
from app.limits import check_limit, fingerprint
from app.mailer import Email, Mailer
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


def validate_form(form: dict, open_courses: dict[str, dict], today: date) -> dict:
    """Check every field and report every mistake at once, so the person can fix the form in one go."""
    errors: dict[str, str] = {}
    clean: dict = {}

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
    if not raw_birth:
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
    if gender in GENDERS:
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
    else:
        whatsapp = clean_mobile(form.get("whatsapp") or "")
        if whatsapp is None:
            errors["whatsapp"] = "Enter a 10-digit WhatsApp number, or tick 'same as mobile'."
        else:
            clean["whatsapp"] = whatsapp

    address = _text(form.get("address"), 5, 300)
    if address is None:
        errors["address"] = "Enter your complete address (5 to 300 characters)."
    else:
        clean["address"] = address

    city = _text(form.get("city"), 2, 60)
    if city is None:
        errors["city"] = "Enter your city."
    else:
        clean["city"] = city

    pin_code = (form.get("pin_code") or "").strip()
    if re.fullmatch(r"[1-9]\d{5}", pin_code):
        clean["pin_code"] = pin_code
    else:
        errors["pin_code"] = "Enter a 6-digit PIN code."

    if not open_courses:
        errors["course_id"] = "No courses are open for registration yet."
    elif form.get("course_id") in open_courses:
        clean["course_id"] = form["course_id"]
    else:
        errors["course_id"] = "Choose a course from the list."

    if errors:
        raise FormErrors(errors)
    return clean


# ---- Emails ----

def _send_quietly(mailer: Mailer, email: Email) -> bool:
    """Send an email, but never let a failure undo the registration or the decision. Returns whether it went out."""
    try:
        mailer.send(email)
        return True
    except Exception:
        logger.exception("Could not send a registration email")
        return False


def _received_email(tenant: dict, record: dict) -> Email:
    name = tenant["branding"]["display_name"]
    return Email(
        to=record["email"],
        from_name=name,
        subject=f"We received your registration with {name}",
        body=(
            f"Hello {record['first_name']},\n\n"
            f"Thank you for registering with {name} for {record['course_name']}.\n"
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
            f"After you log in, you'll see how to pay and get access to {record['course_name']}."
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
        "course_name": open_courses[clean["course_id"]]["name"],
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

    _send_quietly(mailer, _received_email(tenant, record))
    return record


# ---- The admin's review queue ----

def list_registrations(scoped: TenantRepo, status: str) -> list[dict]:
    """Students with this status, newest first. 'all' lists every status."""
    if status != "all" and status not in STATUSES:
        raise ValidationError("Status must be pending, approved, rejected, suspended or all.")
    wanted = STATUSES if status == "all" else (status,)
    people = [person for state in wanted for person in scoped.list_members_by_status(state)]
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
        email_sent = _send_quietly(mailer, _approved_email(tenant, updated))
    elif action == "reject":
        email_sent = _send_quietly(mailer, _rejected_email(tenant, updated, reason))
    return updated, email_sent
