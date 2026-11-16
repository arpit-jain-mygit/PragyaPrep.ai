"""Signed tokens (JWT). Used for sessions, and later for other short-lived signed values."""
from datetime import datetime, timedelta, timezone

import jwt


def create_token(secret: str, subject: str, purpose: str, ttl_seconds: int, **claims) -> str:
    """Make a signed token. 'purpose' stops a token for one job being used for another."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "purpose": purpose,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
        **claims,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def decode_token(secret: str, token: str, purpose: str) -> dict:
    """Return the token's claims. Raises jwt.InvalidTokenError if it is bad, expired or misused."""
    payload = jwt.decode(token, secret, algorithms=["HS256"])
    if payload.get("purpose") != purpose:
        raise jwt.InvalidTokenError("token used for the wrong purpose")
    return payload
