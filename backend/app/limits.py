"""Rate limits shared by login and registration: counting, the 'too many requests' error, and friendly wait times."""
import hashlib
import math

from app.repo import Repo


class TooManyRequests(Exception):
    """A limit was hit. 'message' is safe to show, and 'retry_after' is how many seconds to wait."""

    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.message = message
        self.retry_after = retry_after


def wait_text(seconds: int) -> str:
    if seconds <= 60:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    return f"{math.ceil(seconds / 60)} minutes"


def fingerprint(value: str) -> str:
    """A short fingerprint, so counters don't keep readable emails or addresses in their keys."""
    return hashlib.sha256(value.encode()).hexdigest()[:20]


def check_limit(repo: Repo, name: str, limit: int, window_seconds: int, message: str) -> None:
    """Count one use of 'name'. Raises TooManyRequests, with the wait time, if the limit is passed."""
    wait = repo.rate_hit(name, limit, window_seconds)
    if wait is not None:
        raise TooManyRequests(f"{message} Try again in {wait_text(wait)}.", wait)
