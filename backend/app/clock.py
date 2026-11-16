"""The current time, in one place, so tests can move the clock and check expiry and limits."""
import time
from datetime import date, datetime, timedelta, timezone

INDIA = timezone(timedelta(hours=5, minutes=30))


def now() -> float:
    """Seconds since 1970, like time.time()."""
    return time.time()


def today_india() -> date:
    """Today's date in India. Birth dates and course end dates are judged by the Indian calendar."""
    return datetime.fromtimestamp(now(), tz=INDIA).date()
