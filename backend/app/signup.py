"""Signing up for the first time, with no one's approval: a new institute (its admin), or a free student or parent.

The person proves their email with a 6-digit code, then the account is made and they are signed in. Codes are kept
(hashed) under the platform's own tenant, so a code for one kind of sign-up can't be used for another.
"""
import hmac
import logging
import math
import secrets

from app import clock, otp
from app.config import Settings
from app.limits import TooManyRequests, check_limit, fingerprint, wait_text
from app.mailer import Email, Mailer
from app.plan_limits import FREE_PLAN
from app.repo import ConflictError, Repo, is_valid_slug, now_iso
from app.tenants import PLATFORM_SLUG, RESERVED_SLUGS, ValidationError, clean_color, clean_name, normalize_email, split_name

logger = logging.getLogger(__name__)

# Free students and parents with no institute share this one tenant. It shows no institute branding.
FREE_SLUG = "free"
KINDS = ("institute", "student", "parent")
MAX_INSTITUTES_PER_EMAIL = 3


class AlreadySignedUp(Exception):
    """The email already has an account. 'message' is safe to show."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def ensure_free_tenant(repo: Repo) -> dict:
    """The shared tenant for free students and parents. Made the first time it is needed."""
    tenant = repo.get_tenant(FREE_SLUG)
    if tenant is not None:
        return tenant
    platform = repo.get_tenant(PLATFORM_SLUG) or {}
    tenant = {
        "slug": FREE_SLUG, "name": "PragyaPrep", "status": "active", "plan": FREE_PLAN,
        "branding": {"display_name": "PragyaPrep", "primary_color": "#2563eb"},
        "admin_email": platform.get("admin_email", ""), "created_at": now_iso(),
    }
    try:
        repo.create_tenant(tenant)
    except ConflictError:
        return repo.get_tenant(FREE_SLUG)
    return tenant


def _institutes_of(repo: Repo, email: str) -> int:
    return sum(1 for t in repo.list_tenants() if t.get("admin_email") == email and t["slug"] not in (PLATFORM_SLUG, FREE_SLUG))


def clean(repo: Repo, form: dict) -> dict:
    """Check the form for the kind of sign-up it is. Raises ValidationError, or AlreadySignedUp."""
    kind = form.get("kind")
    if kind not in KINDS:
        raise ValidationError("Choose institute, student or parent.")
    email = normalize_email(form.get("email") or "")
    first, last = split_name(form.get("name") or "")
    if kind == "institute":
        slug = str(form.get("slug") or "").strip().lower()
        if not is_valid_slug(slug):
            raise ValidationError("The short name must be 3 to 30 letters, digits or hyphens, starting with a letter.")
        if slug in RESERVED_SLUGS or slug == FREE_SLUG:
            raise ValidationError(f"'{slug}' is reserved. Choose another short name.")
        if repo.get_tenant(slug) is not None:
            raise ValidationError(f"The short name '{slug}' is taken. Choose another.")
        if _institutes_of(repo, email) >= MAX_INSTITUTES_PER_EMAIL:
            raise ValidationError(f"One email can start up to {MAX_INSTITUTES_PER_EMAIL} institutes.")
        return {"kind": kind, "email": email, "first_name": first, "last_name": last, "slug": slug,
                "institute_name": clean_name(form.get("institute_name") or ""), "primary_color": clean_color(form.get("primary_color") or "#2563eb")}
    free = repo.get_tenant(FREE_SLUG)
    if free is not None and repo.scoped(FREE_SLUG).get_member(email) is not None:
        raise AlreadySignedUp("This email already has a free account. Log in instead.")
    return {"kind": kind, "email": email, "first_name": first, "last_name": last}


def _key(kind: str, email: str) -> str:
    return f"signup:{kind}:{email}"


def _hash(settings: Settings, kind: str, email: str, code: str) -> str:
    return otp.hash_code(settings.secret_key, "signup", _key(kind, email), code)


def request_code(settings: Settings, repo: Repo, mailer: Mailer, form: dict, ip: str) -> None:
    """Check the form, then email a code. Raises ValidationError, AlreadySignedUp, TooManyRequests or otp.EmailFailed."""
    data = clean(repo, form)
    kind, email = data["kind"], data["email"]
    scoped = repo.scoped(PLATFORM_SLUG)
    check_limit(repo, f"ip-signup:{fingerprint(ip)}", settings.ip_requests_per_hour, 3600, "Too many attempts from this connection.")
    earlier = scoped.get_otp(_key(kind, email))
    if earlier is not None:
        wait = math.ceil(earlier["sent_at"] + settings.otp_resend_seconds - clock.now())
        if wait > 0:
            raise TooManyRequests(f"Please wait {wait_text(wait)} before asking for another code.", wait)
    check_limit(repo, f"email-signup:{fingerprint(email)}", settings.otp_requests_per_hour, 3600, "Too many codes asked for this email.")

    code = f"{secrets.randbelow(10**6):06d}"
    now = clock.now()
    scoped.save_otp(_key(kind, email), _hash(settings, kind, email, code), now + settings.otp_ttl_seconds, now)
    minutes = settings.otp_ttl_seconds // 60
    try:
        mailer.send(Email(
            to=email, from_name="PragyaPrep", subject=f"{code} is your PragyaPrep sign-up code",
            body=f"Your PragyaPrep sign-up code is {code}.\n\nIt works for {minutes} minutes and can be used once.\nIf you didn't ask for it, you can ignore this email.",
        ))
    except Exception:
        logger.exception("Could not send a sign-up email")
        scoped.delete_otp(_key(kind, email))
        raise otp.EmailFailed("We couldn't send the email right now. Please try again in a few minutes.")


def _check_code(settings: Settings, repo: Repo, kind: str, email: str, code: str, ip: str) -> None:
    scoped = repo.scoped(PLATFORM_SLUG)
    check_limit(repo, f"ip-signup-verify:{fingerprint(ip)}", settings.ip_verifies_per_hour, 3600, "Too many attempts from this connection.")
    code = str(code or "").strip().replace(" ", "")
    if not (code.isdigit() and len(code) == 6):
        raise otp.CodeRejected(otp.WRONG_CODE_MESSAGE)
    stored = scoped.get_otp(_key(kind, email))
    if stored is None or stored["expires_at"] <= clock.now():
        raise otp.CodeRejected(otp.WRONG_CODE_MESSAGE)
    attempts = scoped.add_otp_attempt(_key(kind, email))
    if attempts is None:
        raise otp.CodeRejected(otp.WRONG_CODE_MESSAGE)
    if attempts > settings.otp_max_attempts:
        scoped.delete_otp(_key(kind, email))
        raise otp.CodeRejected(otp.TOO_MANY_TRIES_MESSAGE)
    if not hmac.compare_digest(stored["code_hash"], _hash(settings, kind, email, code)):
        raise otp.CodeRejected(otp.WRONG_CODE_MESSAGE)
    scoped.delete_otp(_key(kind, email))  # a code works once


def verify_and_create(settings: Settings, repo: Repo, mailer: Mailer, form: dict, code: str, ip: str) -> tuple[dict, dict]:
    """Check the code and make the account. Returns (the tenant, the new person). Nothing is made if anything is wrong."""
    data = clean(repo, form)
    _check_code(settings, repo, data["kind"], data["email"], code, ip)
    member = {"email": data["email"], "status": "approved", "first_name": data["first_name"], "last_name": data["last_name"], "created_at": now_iso()}
    if data["kind"] == "institute":
        tenant = {
            "slug": data["slug"], "name": data["institute_name"], "status": "active", "plan": FREE_PLAN,
            "branding": {"display_name": data["institute_name"], "primary_color": data["primary_color"]},
            "admin_email": data["email"], "created_at": now_iso(),
        }
        try:
            repo.create_tenant(tenant)
        except ConflictError:
            raise ValidationError(f"The short name '{data['slug']}' is taken. Choose another.")
        repo.scoped(data["slug"]).create_member({**member, "role": "tenant_admin"})
        _notify_platform(repo, mailer, f"New institute: {data['institute_name']} ({data['slug']})", f"{data['first_name']} {data['last_name']} <{data['email']}> started the institute '{data['institute_name']}' (short name {data['slug']}) on the Free plan.")
        return tenant, {**member, "role": "tenant_admin"}
    tenant = ensure_free_tenant(repo)
    try:
        repo.scoped(FREE_SLUG).create_member({**member, "role": data["kind"], "free_course": ""})
    except ConflictError:
        raise AlreadySignedUp("This email already has a free account. Log in instead.")
    _notify_platform(repo, mailer, f"New free {data['kind']}: {data['first_name']} {data['last_name']}", f"{data['first_name']} {data['last_name']} <{data['email']}> signed up as a free {data['kind']}.")
    return tenant, {**member, "role": data["kind"]}


def _notify_platform(repo: Repo, mailer: Mailer, subject: str, body: str) -> None:
    """Tell the platform admin, quietly: a failed email never stops a sign-up."""
    admin = (repo.get_tenant(PLATFORM_SLUG) or {}).get("admin_email")
    if not admin:
        return
    try:
        mailer.send(Email(to=admin, from_name="PragyaPrep", subject=subject, body=body))
    except Exception:
        logger.exception("Could not tell the platform admin about a sign-up")
