"""A message to the platform admin from a signed-in person, with an optional screenshot, sent by email.

The platform admin can reply straight to the person (the reply goes to the sender's own address). Nothing is stored.
"""
import base64
import binascii

from app.mailer import Attachment, Email
from app.repo import Repo
from app.tenants import PLATFORM_SLUG, ValidationError

MAX_MESSAGE = 2000
MAX_PAGE = 200
MAX_IMAGE_BYTES = 3 * 1024 * 1024
NO_ADMIN = "We couldn't reach the platform admin right now. Please try again later."


class NotSent(Exception):
    pass


def _image_type(head: bytes) -> tuple[str, str] | None:
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png", "png"
    if head[:3] == b"\xff\xd8\xff":
        return "image/jpeg", "jpg"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None


def clean_message(raw) -> str:
    message = str(raw or "").strip()
    if not message:
        raise ValidationError("Write your message first.")
    if len(message) > MAX_MESSAGE:
        raise ValidationError(f"The message can be up to {MAX_MESSAGE} characters.")
    return message


def clean_screenshot(raw) -> Attachment | None:
    """The picture, as base64 text, checked by what it really is (a PNG, JPG or WebP of up to 3 MB), never by its name."""
    if raw in (None, ""):
        return None
    if not isinstance(raw, str):
        raise ValidationError("The screenshot couldn't be read.")
    try:
        data = base64.b64decode(raw.split(",", 1)[-1], validate=True)
    except (binascii.Error, ValueError):
        raise ValidationError("The screenshot couldn't be read.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValidationError("The screenshot must be 3 MB or smaller.")
    kind = _image_type(data[:16])
    if kind is None:
        raise ValidationError("The screenshot must be a PNG, JPG or WebP picture.")
    return Attachment(f"screenshot.{kind[1]}", kind[0], data)


def platform_admin_email(repo: Repo) -> str | None:
    """The platform admin's address: kept on the platform's own tenant record, as every institute's admin is."""
    platform = repo.get_tenant(PLATFORM_SLUG)
    return (platform or {}).get("admin_email") or None


FEEDBACK = "feedback"
MIN_RATING, MAX_RATING = 1, 5


def clean_rating(raw) -> int:
    """A feedback rating from 1 to 5 stars. Required for feedback."""
    if isinstance(raw, bool) or not isinstance(raw, int) or not MIN_RATING <= raw <= MAX_RATING:
        raise ValidationError("Choose a rating from 1 to 5 stars.")
    return raw


def send(repo: Repo, mailer, tenant: dict, member: dict, body: dict) -> None:
    message = clean_message(body.get("message"))
    feedback = body.get("kind") == FEEDBACK
    rating = clean_rating(body.get("rating")) if feedback else None
    page = " ".join(str(body.get("page") or "").split())[:MAX_PAGE]
    attachment = clean_screenshot(body.get("screenshot"))
    to = platform_admin_email(repo)
    if to is None:
        raise NotSent()
    name = f"{member.get('first_name', '')} {member.get('last_name', '')}".strip() or member["email"]
    lines = [
        f"From: {name} <{member['email']}>", f"Role: {member.get('role', '')}", f"Institute: {tenant['name']} ({tenant['slug']})",
    ]
    if page:
        lines.append(f"Page: {page}")
    if feedback:
        lines.append(f"Feedback rating: {rating} of {MAX_RATING} stars")
    lines += ["", message]
    if attachment:
        lines += ["", "A screenshot is attached."]
    label = "feedback" if feedback else "support"
    subject = f"[PragyaPrep {label}] {tenant['name']}: {message.splitlines()[0][:60]}"
    try:
        mailer.send(Email(to=to, from_name=f"{name} via PragyaPrep", subject=subject, body="\n".join(lines), reply_to=member["email"], attachments=(attachment,) if attachment else ()))
    except Exception:
        raise NotSent()
