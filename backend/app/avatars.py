"""Student photos shown as round avatars.

The browser crops each photo to a square and shrinks it to a small JPEG, so the server only checks the size and that the file
really is a JPEG. Photos live in the institute's own folder of the private bucket and are shown through short-lived links.

Three ways a photo arrives:
 - a student registering: the server hands out a ten-minute upload permission for that one student, only right after the
   registration succeeded (so the public registration page can never be used to store files for nobody);
 - the admin, from a student's edit form;
 - a bulk import: pictures are uploaded first under their file names and matched to the sheet's Photo column.
"""
from pathlib import PurePosixPath
from uuid import uuid4

from app import clock
from app.config import Settings
from app.repo import TenantRepo, now_iso
from app.security import create_token, decode_token
from app.storage import ContentStorage
from app.tenants import ValidationError

MAX_BYTES = 300 * 1024
LINK_SECONDS = 3600
UPLOAD_SECONDS = 600
PENDING_HOURS = 24
CONTENT_TYPE = "image/jpeg"
NAME_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


class PhotoNotFound(Exception):
    pass


def looks_like_jpeg(head: bytes) -> bool:
    return head[:3] == b"\xff\xd8\xff"


def new_key(slug: str) -> str:
    return f"{slug}/avatars/{uuid4().hex}.jpg"


def issue_upload(storage: ContentStorage, settings: Settings, slug: str) -> tuple[str, dict]:
    """A new key and a signed form to post a JPEG of up to 300 KB to it."""
    key = new_key(slug)
    return key, storage.presigned_upload(key, CONTENT_TYPE, MAX_BYTES, settings.upload_url_seconds if settings.upload_url_seconds else UPLOAD_SECONDS)


def registration_permission(storage: ContentStorage, settings: Settings, slug: str, email: str) -> dict:
    """What a student who has just registered needs to send their photo: the signed form and a token that proves it is theirs."""
    key, upload = issue_upload(storage, settings, slug)
    token = create_token(settings.secret_key, email, "photo", UPLOAD_SECONDS, tenant=slug, key=key)
    return {"upload": upload, "token": token}


def key_from_token(settings: Settings, slug: str, email: str, token) -> str:
    """The key a registration permission is for. Raises ValidationError if the token is bad, expired, or for someone else."""
    import jwt

    try:
        claims = decode_token(settings.secret_key, str(token or ""), "photo")
    except jwt.InvalidTokenError:
        raise ValidationError("This photo upload has expired. The institute can add your photo later.")
    if claims.get("tenant") != slug or claims.get("sub") != email:
        raise ValidationError("This photo upload isn't for this registration.")
    return claims["key"]


def _check_arrived(storage: ContentStorage, key: str) -> int:
    size = storage.size(key)
    if size is None:
        raise ValidationError("The photo hasn't arrived. Please try again.")
    if size > MAX_BYTES or not looks_like_jpeg(storage.read_head(key)):
        storage.delete(key)
        raise ValidationError("That isn't a usable photo, so it was removed.")
    return size


def set_photo(scoped: TenantRepo, storage: ContentStorage, email: str, key: str) -> dict:
    """Make `key` the student's photo, after checking it arrived and is a JPEG. A photo they had before is deleted."""
    if not key.startswith(f"{scoped.slug}/avatars/"):
        raise ValidationError("That photo isn't one of this institute's.")
    member = scoped.get_member(email)
    if member is None or member.get("role") not in ("student", "parent", "tenant_admin"):
        raise PhotoNotFound()
    _check_arrived(storage, key)
    old = member.get("avatar_key")
    scoped.update_member(email, avatar_key=key, avatar_at=now_iso())
    if old and old != key:
        storage.delete(old)
    return scoped.get_member(email)


def remove_photo(scoped: TenantRepo, storage: ContentStorage, email: str) -> None:
    member = scoped.get_member(email)
    if member is None or member.get("role") not in ("student", "parent", "tenant_admin"):
        raise PhotoNotFound()
    old = member.get("avatar_key")
    if old:
        scoped.update_member(email, avatar_key="", avatar_at=now_iso())
        storage.delete(old)


# ---- Showing photos ----

def url_for(storage: ContentStorage, member: dict) -> str:
    key = member.get("avatar_key")
    return storage.presigned_download(key, CONTENT_TYPE, LINK_SECONDS) if key else ""


def with_url(storage: ContentStorage, member: dict) -> dict:
    """The member as a dict for the API: a link to the photo (or empty) and never the storage key."""
    shown = {k: v for k, v in member.items() if k != "avatar_key"}
    shown["avatar_url"] = url_for(storage, member)
    return shown


# ---- Bulk: photos uploaded first, by file name ----

def start_photo_upload(scoped: TenantRepo, storage: ContentStorage, settings: Settings, filename, size, admin_email: str) -> tuple[dict, dict]:
    name = PurePosixPath(str(filename or "").strip().replace("\\", "/")).name.lower()
    if PurePosixPath(name).suffix not in NAME_EXTENSIONS:
        raise ValidationError("A photo must be a JPG, PNG or WebP picture.")
    if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= MAX_BYTES:
        raise ValidationError("A photo can be up to 300 KB once it has been made small.")
    photo_id = uuid4().hex
    key = f"{scoped.slug}/avatars/{photo_id}.jpg"
    photo = {"id": photo_id, "name": name, "key": key, "size": size, "status": "uploading", "created_at": now_iso(), "created_by": admin_email,
             "ttl": int(clock.now() + PENDING_HOURS * 3600)}
    scoped.create_photo(photo)
    return photo, storage.presigned_upload(key, CONTENT_TYPE, size, settings.upload_url_seconds)


def finish_photo_upload(scoped: TenantRepo, storage: ContentStorage, photo_id: str) -> dict:
    """The browser says the photo is sent. Only a real JPEG of the right size is kept."""
    photo = scoped.get_photo(photo_id)
    if photo is None:
        raise PhotoNotFound()
    if photo["status"] == "ready":
        return photo
    arrived = storage.size(photo["key"])
    if arrived is None:
        raise ValidationError("The photo hasn't arrived. Please upload it again.")
    if arrived > MAX_BYTES or not looks_like_jpeg(storage.read_head(photo["key"])):
        storage.delete(photo["key"])
        scoped.delete_photo(photo_id)
        raise ValidationError("That isn't a usable photo, so it was removed.")
    scoped.mark_photo_ready(photo_id, arrived)
    return scoped.get_photo(photo_id)
