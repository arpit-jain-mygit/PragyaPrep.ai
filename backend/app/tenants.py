"""Tenant management: the checks and operations behind the create-tenant script and the platform admin's page."""
import re

from app.repo import ConflictError, Repo, is_valid_slug, now_iso

# The platform admin (the PragyaPrep owner) belongs to this reserved tenant, so they sign in like anyone else.
PLATFORM_SLUG = "platform"
RESERVED_SLUGS = {PLATFORM_SLUG, "platform-admin", "admin", "api", "www", "app", "static", "assets", "login", "register", "status", "docs"}

EMAIL_PATTERN = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
COLOR_PATTERN = re.compile(r"#[0-9a-fA-F]{6}")
DEFAULT_COLOR = "#2563eb"


class ValidationError(ValueError):
    """The input isn't acceptable. The message is safe to show to the person who typed it."""


class InstituteNotFound(Exception):
    """There is no such institute (the platform's own tenant doesn't count as one)."""


# ---- Checking input ----

def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise ValidationError("Enter a valid email address.")
    return email


def clean_name(raw: str) -> str:
    name = " ".join(str(raw).split())
    if not name or len(name) > 120:
        raise ValidationError("The institute name must be 1 to 120 characters.")
    return name


def clean_color(raw: str) -> str:
    color = str(raw).strip()
    if not COLOR_PATTERN.fullmatch(color):
        raise ValidationError("The colour must look like #2563eb.")
    return color.lower()


def split_name(raw: str) -> tuple[str, str]:
    """'Ritesh Kumar Jain' becomes ('Ritesh', 'Kumar Jain'). A first name is required."""
    first_name, _, last_name = " ".join(str(raw).split()).partition(" ")
    if not first_name:
        raise ValidationError("The admin's name is required.")
    return first_name, last_name


# ---- Creating institutes ----

def _create(repo: Repo, slug: str, name: str, admin_email: str, admin_name: str, role: str, primary_color: str) -> dict:
    name = clean_name(name)
    primary_color = clean_color(primary_color)
    first_name, last_name = split_name(admin_name)
    email = normalize_email(admin_email)

    tenant = {
        "slug": slug,
        "name": name,
        "status": "active",
        "branding": {"display_name": name, "primary_color": primary_color},
        # The institute's one admin. The platform admin's page reads this to show and change who it is.
        "admin_email": email,
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
            "last_name": last_name,
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
    """Make sure the platform tenant and its admin exist. Safe to run again. The platform admin is only made here."""
    email = normalize_email(email)
    if repo.get_tenant(PLATFORM_SLUG) is None:
        _create(repo, PLATFORM_SLUG, "PragyaPrep Platform", email, name, "platform_admin", DEFAULT_COLOR)
        return
    platform = repo.get_tenant(PLATFORM_SLUG)
    if platform is not None and not platform.get("admin_email"):
        repo.update_tenant(PLATFORM_SLUG, admin_email=email)
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


# ---- The platform admin's view of institutes ----

def logo_url(tenant: dict) -> str | None:
    logo = (tenant.get("branding") or {}).get("logo")
    return f"/api/logo/{tenant['slug']}?v={logo['version']}" if logo else None


def describe(repo: Repo, tenant: dict) -> dict:
    """An institute as the platform admin sees it: its details and who its admin is."""
    admin = None
    admin_email = tenant.get("admin_email")
    if admin_email:
        member = repo.scoped(tenant["slug"]).get_member(admin_email)
        if member:
            admin = {key: member.get(key, "") for key in ("email", "first_name", "last_name", "status")}
    return {
        "slug": tenant["slug"],
        "name": tenant["name"],
        "status": tenant["status"],
        "primary_color": tenant["branding"]["primary_color"],
        "logo_url": logo_url(tenant),
        "created_at": tenant.get("created_at", ""),
        "admin": admin,
    }


def list_institutes(repo: Repo) -> list[dict]:
    """Every institute, by short name. The platform's own tenant is left out."""
    return [describe(repo, tenant) for tenant in repo.list_tenants() if tenant["slug"] != PLATFORM_SLUG]


def get_institute(repo: Repo, slug: str) -> dict:
    tenant = repo.get_tenant(slug.strip().lower())
    if tenant is None or tenant["slug"] == PLATFORM_SLUG:
        raise InstituteNotFound()
    return describe(repo, tenant)


def update_institute(
    repo: Repo,
    slug: str,
    acting_email: str,
    *,
    name: str | None = None,
    primary_color: str | None = None,
    status: str | None = None,
    admin_name: str | None = None,
    admin_email: str | None = None,
) -> tuple[dict, str | None]:
    """Change an institute's name, colour or status, or its admin's name or email. Nothing here deletes anything.

    Changing the admin's email makes the new address the institute's admin and switches the old admin off,
    because an email is a person's identity and can't be edited in place. The old admin's row is kept.
    Returns (the institute as it now is, the new admin's email if there is one, so they can be told).
    """
    slug = slug.strip().lower()
    tenant = repo.get_tenant(slug)
    if tenant is None or slug == PLATFORM_SLUG:
        raise InstituteNotFound()

    # Check everything first, so a mistake in one field changes nothing.
    fields: dict = {}
    branding = dict(tenant["branding"])
    if name is not None:
        branding["display_name"] = fields["name"] = clean_name(name)
    if primary_color is not None:
        branding["primary_color"] = clean_color(primary_color)
    if branding != tenant["branding"]:
        fields["branding"] = branding
    if status is not None:
        if status not in ("active", "suspended"):
            raise ValidationError("Status must be 'active' or 'suspended'.")
        fields["status"] = status

    scoped = repo.scoped(slug)
    current_email = tenant.get("admin_email")
    current = scoped.get_member(current_email) if current_email else None
    first_name, last_name = split_name(admin_name) if admin_name is not None else (None, None)
    new_email = normalize_email(admin_email) if admin_email is not None else None
    replacing = new_email is not None and new_email != current_email

    if replacing:
        if scoped.get_member(new_email) is not None:
            raise ValidationError("That email is already registered with this institute.")
        if first_name is None:
            if current is None:
                raise ValidationError("Enter the new admin's name.")
            first_name, last_name = current["first_name"], current.get("last_name", "")
    elif first_name is not None and current is None:
        raise ValidationError("This institute has no admin on record yet. Enter the admin's email too.")

    # Now make the changes. The new admin exists before the old one is switched off, so there is never a gap.
    if replacing:
        scoped.create_member(
            {
                "email": new_email,
                "role": "tenant_admin",
                "status": "approved",
                "first_name": first_name,
                "last_name": last_name,
                "created_at": now_iso(),
            }
        )
        fields["admin_email"] = new_email
    elif first_name is not None:
        scoped.update_member(current_email, first_name=first_name, last_name=last_name)

    if fields:
        repo.update_tenant(slug, **fields)

    if replacing and current is not None:
        scoped.transition_member(
            current_email,
            ["pending", "approved", "rejected", "suspended"],
            "suspended",
            decided_by=acting_email,
            decided_at=now_iso(),
            reason="Replaced as the institute's admin",
        )

    return describe(repo, repo.get_tenant(slug)), (new_email if replacing else None)


def link_admin(repo: Repo, slug: str, email: str) -> None:
    """Record which existing person is an institute's admin. For institutes made before the record was kept."""
    slug = slug.strip().lower()
    email = normalize_email(email)
    if slug == PLATFORM_SLUG or repo.get_tenant(slug) is None:
        raise ValidationError(f"No institute called '{slug}'.")
    member = repo.scoped(slug).get_member(email)
    if member is None or member.get("role") != "tenant_admin":
        raise ValidationError(f"{email} is not the admin of '{slug}'.")
    repo.update_tenant(slug, admin_email=email)
