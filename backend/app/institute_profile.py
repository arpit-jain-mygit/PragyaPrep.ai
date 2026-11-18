"""An institute's own profile, kept by its admin: the name students see, the colour, a short description, where it is, how to
reach it, and which exams it prepares students for. These details are public (students and visitors see them), so the admin is
told that where they edit them. The admin's own name and mobile are kept here too; their login email never changes here."""
from urllib.parse import urlparse

from app import tenants
from app.registrations import clean_mobile
from app.repo import Repo, TenantRepo
from app.tenants import ValidationError, clean_color, clean_name, normalize_email

MAX_CATEGORIES = 8
PROFILE_FIELDS = ("description", "city", "contact_email", "contact_phone", "website", "exam_categories")
PUBLIC_DEFAULTS = {"description": "", "city": "", "contact_email": "", "contact_phone": "", "website": "", "exam_categories": []}


def public_profile(tenant: dict) -> dict:
    """The details anyone may see, with every field present."""
    return {**PUBLIC_DEFAULTS, **{key: value for key, value in (tenant.get("profile") or {}).items() if key in PUBLIC_DEFAULTS}}


def _text(raw, limit: int, label: str) -> str:
    value = " ".join(str(raw or "").split())
    if len(value) > limit:
        raise ValidationError(f"{label} can be up to {limit} characters.")
    return value


def _description(raw) -> str:
    value = str(raw or "").strip()
    if len(value) > 300:
        raise ValidationError("The description can be up to 300 characters.")
    return value


def _city(raw) -> str:
    return _text(raw, 60, "The city")


def _email(raw) -> str:
    return normalize_email(raw) if str(raw or "").strip() else ""


def _phone(raw) -> str:
    if not str(raw or "").strip():
        return ""
    number = clean_mobile(str(raw))
    if number is None:
        raise ValidationError("Enter a 10-digit Indian mobile number, or leave the phone empty.")
    return number


def _website(raw) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    if len(value) > 200:
        raise ValidationError("The website address can be up to 200 characters.")
    if "://" not in value:
        value = "https://" + value
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or "." not in parsed.netloc or " " in value:
        raise ValidationError("Enter a website address like https://example.com.")
    return value


def _categories(raw) -> list[str]:
    if not isinstance(raw, list):
        raise ValidationError("Exam categories must be a list.")
    out: list[str] = []
    for item in raw:
        text = " ".join(str(item or "").split())
        if not text:
            continue
        if len(text) > 40:
            raise ValidationError("An exam category can be up to 40 characters.")
        if text.lower() not in (x.lower() for x in out):
            out.append(text)
    if len(out) > MAX_CATEGORIES:
        raise ValidationError(f"You can list up to {MAX_CATEGORIES} exam categories.")
    return out


PROFILE_CHECKS = {"description": _description, "city": _city, "contact_email": _email, "contact_phone": _phone, "website": _website, "exam_categories": _categories}


def _admin_mobile(raw) -> str:
    return _phone(raw)


def _name_part(raw, label: str, required: bool) -> str:
    value = " ".join(str(raw or "").split())
    if (required and not value) or len(value) > 60:
        raise ValidationError(f"Enter {label} (up to 60 characters).")
    return value


def read(repo: Repo, tenant: dict, admin: dict) -> dict:
    """Everything the admin's My institute page shows."""
    return {
        "slug": tenant["slug"], "name": tenant["branding"]["display_name"], "primary_color": tenant["branding"]["primary_color"],
        "logo_url": tenants.logo_url(tenant), "plan": tenant.get("plan", "paid"), "profile": public_profile(tenant),
        "admin": {"email": admin["email"], "first_name": admin.get("first_name", ""), "last_name": admin.get("last_name", ""), "mobile": admin.get("mobile", "")},
    }


def save(repo: Repo, tenant: dict, admin: dict, body: dict) -> dict:
    """Save the fields that were sent. Checks everything first, so a mistake in one field changes nothing. Raises ValidationError."""
    allowed = {"name", "primary_color", "admin_first_name", "admin_last_name", "admin_mobile", *PROFILE_FIELDS}
    unknown = sorted(set(body) - allowed)
    if unknown:
        raise ValidationError(f"These can't be changed here: {', '.join(unknown)}.")
    branding = dict(tenant["branding"])
    fields: dict = {}
    if "name" in body:
        branding["display_name"] = fields["name"] = clean_name(body["name"])
    if "primary_color" in body:
        branding["primary_color"] = clean_color(body["primary_color"])
    if branding != tenant["branding"]:
        fields["branding"] = branding
    profile = dict(tenant.get("profile") or {})
    for key in PROFILE_FIELDS:
        if key in body:
            profile[key] = PROFILE_CHECKS[key](body[key])
    if profile != (tenant.get("profile") or {}):
        fields["profile"] = profile
    member_fields: dict = {}
    if "admin_first_name" in body:
        member_fields["first_name"] = _name_part(body["admin_first_name"], "your first name", True)
    if "admin_last_name" in body:
        member_fields["last_name"] = _name_part(body["admin_last_name"], "your last name", False)
    if "admin_mobile" in body:
        member_fields["mobile"] = _admin_mobile(body["admin_mobile"])
    if fields:
        repo.update_tenant(tenant["slug"], **fields)
    if member_fields:
        repo.scoped(tenant["slug"]).update_member(admin["email"], **member_fields)
    fresh = repo.get_tenant(tenant["slug"])
    return read(repo, fresh, repo.scoped(tenant["slug"]).get_member(admin["email"]))
