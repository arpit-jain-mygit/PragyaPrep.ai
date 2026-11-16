"""Tenant management: the checks and operations behind the create-tenant script and, later, the platform admin."""
import re

from app.repo import ConflictError, Repo, is_valid_slug, now_iso

# The platform admin (the PragyaPrep owner) belongs to this reserved tenant, so they sign in like anyone else.
PLATFORM_SLUG = "platform"
RESERVED_SLUGS = {PLATFORM_SLUG, "admin", "api", "www", "app", "static", "assets", "login", "register", "status", "docs"}

EMAIL_PATTERN = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
COLOR_PATTERN = re.compile(r"#[0-9a-fA-F]{6}")
DEFAULT_COLOR = "#2563eb"


class ValidationError(ValueError):
    """The input isn't acceptable. The message is safe to show to the person who typed it."""


def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise ValidationError("Enter a valid email address.")
    return email


def _create(repo: Repo, slug: str, name: str, admin_email: str, admin_name: str, role: str, primary_color: str) -> dict:
    name = name.strip()
    if not name or len(name) > 120:
        raise ValidationError("The institute name must be 1 to 120 characters.")
    if not COLOR_PATTERN.fullmatch(primary_color):
        raise ValidationError("The colour must look like #2563eb.")
    first_name, _, last_name = admin_name.strip().partition(" ")
    if not first_name:
        raise ValidationError("The admin's name is required.")
    email = normalize_email(admin_email)

    tenant = {
        "slug": slug,
        "name": name,
        "status": "active",
        "branding": {"display_name": name, "primary_color": primary_color},
        "created_at": now_iso(),
    }
    try:
        repo.create_tenant(tenant)
    except ConflictError:
        raise ValidationError(f"An institute called '{slug}' already exists.")

    # The tenant's one admin is approved from the start, so they can sign in with an emailed code.
    repo.scoped(slug).create_member(
        {
            "email": email,
            "role": role,
            "status": "approved",
            "first_name": first_name,
            "last_name": last_name.strip(),
            "created_at": now_iso(),
        }
    )
    return tenant


def create_tenant(
    repo: Repo, slug: str, name: str, admin_email: str, admin_name: str, primary_color: str = DEFAULT_COLOR
) -> dict:
    """Create an institute together with its one admin."""
    slug = slug.strip().lower()
    if not is_valid_slug(slug):
        raise ValidationError("The short name must be 3 to 30 letters, digits or hyphens, starting with a letter.")
    if slug in RESERVED_SLUGS:
        raise ValidationError(f"'{slug}' is reserved. Choose another short name.")
    return _create(repo, slug, name, admin_email, admin_name, "tenant_admin", primary_color)


def ensure_platform_admin(repo: Repo, email: str, name: str = "Platform Admin") -> None:
    """Make sure the platform tenant and its admin exist. Safe to run again."""
    email = normalize_email(email)
    if repo.get_tenant(PLATFORM_SLUG) is None:
        _create(repo, PLATFORM_SLUG, "PragyaPrep Platform", email, name, "platform_admin", DEFAULT_COLOR)
        return
    scoped = repo.scoped(PLATFORM_SLUG)
    if scoped.get_member(email) is None:
        first_name, _, last_name = name.strip().partition(" ")
        scoped.create_member(
            {
                "email": email,
                "role": "platform_admin",
                "status": "approved",
                "first_name": first_name or "Platform",
                "last_name": last_name.strip(),
                "created_at": now_iso(),
            }
        )


def set_tenant_status(repo: Repo, slug: str, status: str) -> None:
    """Suspend or reactivate an institute. A suspended institute's people can't log in or download files."""
    slug = slug.strip().lower()
    if status not in ("active", "suspended"):
        raise ValidationError("Status must be 'active' or 'suspended'.")
    if slug == PLATFORM_SLUG:
        raise ValidationError("The platform tenant can't be suspended.")
    if repo.get_tenant(slug) is None:
        raise ValidationError(f"No institute called '{slug}'.")
    repo.update_tenant(slug, status=status)
