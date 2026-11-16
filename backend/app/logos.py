"""An institute's logo. The platform admin uploads it straight to S3 with a signed form, then the API checks it.

A logo is public, because it shows on the login page before anyone signs in. It is served by redirecting
to a signed link, so the bucket itself stays private."""
from pathlib import PurePosixPath
from uuid import uuid4

from app.config import Settings
from app.repo import Repo
from app.storage import ContentStorage
from app.tenants import PLATFORM_SLUG, InstituteNotFound, ValidationError

# SVG is left out on purpose: it can carry scripts. PNG and JPEG are plain pictures.
TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
MAX_BYTES = 1024 * 1024  # 1 MB is plenty for a logo
LINK_SECONDS = 3600


def looks_like(content_type: str, head: bytes) -> bool:
    """Do the first bytes match the picture type? PNG starts with a fixed 8 bytes, and JPEG with FF D8 FF."""
    if content_type == "image/png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    return head.startswith(b"\xff\xd8\xff")


def _institute(repo: Repo, slug: str) -> dict:
    tenant = repo.get_tenant(slug.strip().lower())
    if tenant is None or tenant["slug"] == PLATFORM_SLUG:
        raise InstituteNotFound()
    return tenant


def start_upload(repo: Repo, storage: ContentStorage, settings: Settings, slug: str, filename: str, size: int) -> dict:
    """Remember the logo that is about to arrive, and return a signed form to post it to."""
    tenant = _institute(repo, slug)
    extension = PurePosixPath(str(filename or "").strip().lower()).suffix
    if extension not in TYPES:
        raise ValidationError("A logo must be a PNG or JPG picture.")
    if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= MAX_BYTES:
        raise ValidationError("A logo can be up to 1 MB.")

    content_type = TYPES[extension]
    key = f"{tenant['slug']}/branding/{uuid4().hex}{extension}"
    repo.update_tenant(tenant["slug"], logo_pending={"key": key, "content_type": content_type, "size": size})
    return storage.presigned_upload(key, content_type, size, settings.upload_url_seconds)


def finish_upload(repo: Repo, storage: ContentStorage, slug: str) -> dict:
    """Check the picture that arrived. Only a real PNG or JPEG becomes the institute's logo, and the old logo is removed."""
    tenant = _institute(repo, slug)
    pending = tenant.get("logo_pending")
    if not pending:
        raise ValidationError("Choose a logo to upload first.")

    arrived = storage.size(pending["key"])
    if arrived is None:
        raise ValidationError("The logo hasn't arrived. Please upload it again.")
    if arrived > pending["size"] or not looks_like(pending["content_type"], storage.read_head(pending["key"])):
        storage.delete(pending["key"])
        repo.update_tenant(tenant["slug"], logo_pending=None)
        raise ValidationError("That isn't a real PNG or JPG picture, so it was removed.")

    old = (tenant["branding"] or {}).get("logo")
    branding = {**tenant["branding"], "logo": {"key": pending["key"], "content_type": pending["content_type"], "version": uuid4().hex[:8]}}
    repo.update_tenant(tenant["slug"], branding=branding, logo_pending=None)
    if old:
        storage.delete(old["key"])
    return repo.get_tenant(tenant["slug"])


def remove(repo: Repo, storage: ContentStorage, slug: str) -> dict:
    """Take the logo away. The institute goes back to showing just its name."""
    tenant = _institute(repo, slug)
    logo = (tenant["branding"] or {}).get("logo")
    if logo:
        branding = {key: value for key, value in tenant["branding"].items() if key != "logo"}
        repo.update_tenant(tenant["slug"], branding=branding)
        storage.delete(logo["key"])
    return repo.get_tenant(tenant["slug"])


def public_link(repo: Repo, storage: ContentStorage, slug: str) -> str | None:
    """A signed link to the logo, good for an hour, or None if there is no such institute or no logo."""
    tenant = repo.get_tenant(slug.strip().lower())
    logo = ((tenant or {}).get("branding") or {}).get("logo")
    if tenant is None or tenant["slug"] == PLATFORM_SLUG or not logo:
        return None
    return storage.presigned_download(logo["key"], logo["content_type"], LINK_SECONDS)
