"""The Ask AI log: each question a student asks is saved with how well the notes covered it, so the institute's admin
can see what the notes miss. Rows expire after 30 days by themselves (DynamoDB removes them once the 'ttl' time passes).

Students' emails are stored with each row, but the admin list leaves them out unless the admin asks to see them."""
import logging
from decimal import Decimal
from uuid import uuid4

from app import clock, study_search
from app.repo import TenantRepo, now_iso

logger = logging.getLogger(__name__)

RETENTION_SECONDS = 30 * 24 * 3600  # 30 days
MAX_QUESTION_CHARS = 200
FILTERS = ("all", "not_covered", "low_coverage")
SORTS = ("newest", "worst")


MAX_SOURCES = 3  # how many passages each row keeps, best first


def _name(student: dict) -> str:
    """The student's full name, or their email if no name is on file."""
    return " ".join(part for part in (student.get("first_name"), student.get("last_name")) if part) or student["email"]


def _source(hit: dict) -> dict:
    """Where a passage is in the coursework, and the page to open it at."""
    return {
        "course_id": hit["course_id"], "course": hit["course"], "subject": hit["subject"], "topic": hit["topic"],
        "subtopic": hit["subtopic"], "file_id": hit["file_id"], "file": hit["file"], "page": hit["page"],
    }


def record(scoped: TenantRepo, student: dict, question: str, reply: dict) -> None:
    """Save one question and its result. A failure here is logged and never stops the student's answer."""
    try:
        hits = reply.get("hits", [])
        best = hits[0]["coverage"] if hits else 0.0
        scoped.create_ask_log({
            "id": uuid4().hex,
            "created_at": now_iso(),
            "question": question.strip()[:MAX_QUESTION_CHARS],
            "student_email": student["email"],
            "student_name": _name(student),
            "sources": [_source(hit) for hit in hits[:MAX_SOURCES]],
            "best_coverage": Decimal(str(round(float(best), 2))),  # DynamoDB needs Decimal, not float
            "matches": len(hits),
            "answered": bool(reply.get("answered")),
            "ttl": int(clock.now()) + RETENTION_SECONDS,
        })
    except Exception:
        logger.exception("could not save an Ask AI log row")


def _keep(row: dict, filter_name: str) -> bool:
    if filter_name == "not_covered":
        return not row["answered"]
    if filter_name == "low_coverage":
        return row["best_coverage"] < study_search.MIN_SHOW_COVERAGE
    return True


def list_for_admin(scoped: TenantRepo, filter_name: str = "all", show_student: bool = False, limit: int = 200,
                   below: float | None = None, sort: str = "newest") -> list[dict]:
    """Newest first. Students' emails are removed unless show_student is asked for."""
    if filter_name not in FILTERS:
        raise ValueError(f"unknown filter: {filter_name!r}")
    if sort not in SORTS:
        raise ValueError(f"unknown sort: {sort!r}")
    rows = []
    for row in scoped.list_ask_logs(limit=500):
        if not _keep(row, filter_name):
            continue
        if below is not None and not row["best_coverage"] < below:
            continue
        out = {key: row[key] for key in ("id", "created_at", "question", "best_coverage", "matches", "answered")}
        out["sources"] = row.get("sources", [])  # rows saved before this change have none
        if show_student:
            out["student_name"] = row.get("student_name", row["student_email"])
            out["student_email"] = row["student_email"]
        rows.append(out)
    if sort == "worst":
        # Lowest best match first. Rows already come newest first, and the sort keeps that order for ties.
        rows.sort(key=lambda row: row["best_coverage"])
    return rows[:limit]
