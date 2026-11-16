"""Login by emailed code: asking for a code, checking it, and the limits that protect both steps."""
import hashlib
import hmac
import logging
import math
import secrets

from app import clock
from app.config import Settings
from app.limits import TooManyRequests, check_limit, fingerprint, wait_text
from app.mailer import Email, Mailer
from app.repo import Repo

logger = logging.getLogger(__name__)

# What the login page tells a person, by the state of their email. These are shown straight away.
STATUS_MESSAGES = {
    "not_registered": "This email isn't registered with {name}. Register first.",
    "pending": "Your registration is waiting for approval. We'll email you once it's approved.",
    "rejected": "Your registration wasn't approved. Contact {name}.",
    "suspended": "Your access is paused. Contact {name}.",
    "code_sent": "We've emailed you a 6-digit code.",
}

WRONG_CODE_MESSAGE = "That code isn't right, or it has expired. Ask for a new one."
TOO_MANY_TRIES_MESSAGE = "Too many wrong tries. Ask for a new code."


class CodeRejected(Exception):
    """The code can't be used. 'message' is safe to show."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class EmailFailed(Exception):
    """The email couldn't be sent. 'message' is safe to show."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotApproved(Exception):
    """The person's email is no longer approved. 'status' and 'message' say why."""

    def __init__(self, status: str, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def status_message(status: str, institute_name: str) -> tuple[str, str]:
    """Return (status, message). A status we don't know is treated as paused, which is the safe choice."""
    if status not in STATUS_MESSAGES:
        status = "suspended"
    return status, STATUS_MESSAGES[status].format(name=institute_name)


def hash_code(secret: str, tenant_slug: str, email: str, code: str) -> str:
    """The code is stored only as a keyed hash tied to the institute and the email, never as plain text."""
    message = f"{tenant_slug}:{email}:{code}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def request_code(settings: Settings, repo: Repo, tenant: dict, email: str, ip: str, mailer: Mailer) -> tuple[str, str]:
    """Ask for a login code. Returns (status, message). Only an approved email gets a code by email."""
    slug = tenant["slug"]
    name = tenant["branding"]["display_name"]
    scoped = repo.scoped(slug)

    # The connection limit applies to every answer, so checking many emails quickly is slowed down.
    check_limit(repo, f"ip-request:{fingerprint(ip)}", settings.ip_requests_per_hour, 3600,
                "Too many attempts from this connection.")

    member = scoped.get_member(email)
    if member is None:
        return status_message("not_registered", name)
    if member["status"] != "approved":
        return status_message(member["status"], name)

    # Wait a short while between codes, and cap how many one email can ask for in an hour.
    earlier = scoped.get_otp(email)
    if earlier is not None:
        wait = math.ceil(earlier["sent_at"] + settings.otp_resend_seconds - clock.now())
        if wait > 0:
            raise TooManyRequests(f"Please wait {wait_text(wait)} before asking for another code.", wait)
    check_limit(repo, f"email-request:{slug}:{fingerprint(email)}", settings.otp_requests_per_hour, 3600,
                "Too many codes asked for this email.")

    code = f"{secrets.randbelow(10**6):06d}"
    now = clock.now()
    scoped.save_otp(email, hash_code(settings.secret_key, slug, email, code), now + settings.otp_ttl_seconds, now)

    minutes = settings.otp_ttl_seconds // 60
    try:
        mailer.send(
            Email(
                to=email,
                from_name=name,
                subject=f"{code} is your {name} login code",
                body=(
                    f"Your {name} login code is {code}.\n\n"
                    f"It works for {minutes} minutes and can be used once.\n"
                    "If you didn't ask for it, you can ignore this email."
                ),
            )
        )
    except Exception:
        # The email didn't go out, so the code is useless. Remove it, so the person can try again straight away.
        logger.exception("Could not send a login email")
        scoped.delete_otp(email)
        raise EmailFailed("We couldn't send the email right now. Please try again in a few minutes.")
    return status_message("code_sent", name)


def verify_code(settings: Settings, repo: Repo, tenant: dict, email: str, code: str, ip: str) -> dict:
    """Check a code. Returns the person on success. Raises CodeRejected, NotApproved or TooManyRequests."""
    slug = tenant["slug"]
    name = tenant["branding"]["display_name"]
    scoped = repo.scoped(slug)

    check_limit(repo, f"ip-verify:{fingerprint(ip)}", settings.ip_verifies_per_hour, 3600,
                "Too many attempts from this connection.")

    code = code.strip().replace(" ", "")
    if not (code.isdigit() and len(code) == 6):
        raise CodeRejected(WRONG_CODE_MESSAGE)

    stored = scoped.get_otp(email)
    if stored is None or stored["expires_at"] <= clock.now():
        raise CodeRejected(WRONG_CODE_MESSAGE)

    # Every try counts, right or wrong. After too many, the code is thrown away.
    attempts = scoped.add_otp_attempt(email)
    if attempts is None:
        raise CodeRejected(WRONG_CODE_MESSAGE)
    if attempts > settings.otp_max_attempts:
        scoped.delete_otp(email)
        raise CodeRejected(TOO_MANY_TRIES_MESSAGE)

    given = hash_code(settings.secret_key, slug, email, code)
    if not hmac.compare_digest(stored["code_hash"], given):
        raise CodeRejected(WRONG_CODE_MESSAGE)

    scoped.delete_otp(email)  # a code works once

    member = scoped.get_member(email)
    if member is None or member["status"] != "approved":
        status, message = status_message(member["status"] if member else "not_registered", name)
        raise NotApproved(status, message)
    return member
