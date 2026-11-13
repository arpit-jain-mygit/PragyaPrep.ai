"""Password hashing and signed tokens (JWT)."""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt


def hash_password(password: str) -> str:
    # bcrypt stores a salt inside the hash, so two equal passwords get different hashes.
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


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
