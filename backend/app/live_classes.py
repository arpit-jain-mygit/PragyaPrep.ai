"""Live classes: the recordings (videos) and slides (PDFs) of a course's live sessions, with a date, a note and a status.

The admin adds them one by one, or many at once from an Excel sheet that names the files (see live_import). The files are the
course's own PDF and MP4 files; a live class only points at them. A live class is a draft until it is published.
"""
import re
from datetime import date
from uuid import uuid4

from app import coursework
from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

MAX_TITLE = 120
MAX_NOTE = 2000
STATUSES = ("draft", "published")


class LiveClassNotFound(Exception):
    pass


def _course(scoped: TenantRepo, course_id: str) -> dict:
    course = scoped.get_course(course_id)
    if course is None:
        raise coursework.CourseNotFound()
    return course


# ---- Checking what the admin sends ----

def clean_title(raw) -> str:
    title = " ".join(str(raw or "").split())
    if not 1 <= len(title) <= MAX_TITLE:
        raise ValidationError(f"The title must be 1 to {MAX_TITLE} characters.")
    return title


def clean_date(raw) -> str:
    try:
        return date.fromisoformat(raw).isoformat() if isinstance(raw, str) and len(raw) == 10 else _bad("date")
    except ValueError:
        return _bad("date")


def clean_time(raw) -> str:
    if raw in (None, ""):
        return ""
    if isinstance(raw, str) and re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", raw):
        return raw
    return _bad("time")


def _bad(what: str):
    if what == "date":
        raise ValidationError("Enter the date as YYYY-MM-DD.")
    raise ValidationError("Enter the time as HH:MM, for example 18:30.")


def clean_note(raw) -> str:
    note = str(raw or "").strip()
    if len(note) > MAX_NOTE:
        raise ValidationError(f"The note can be up to {MAX_NOTE} characters.")
    return note


def clean_status(raw, materials: list, note: str) -> str:
    status = "draft" if raw in (None, "") else raw
    if status not in STATUSES:
        raise ValidationError("The status must be draft or published.")
    if status == "published" and not materials and not note:
        raise ValidationError("Add a recording, slides, a link or a note before publishing.")
    return status


def _places(scoped: TenantRepo, course_id: str) -> dict:
    """The course plan as lookups: subject id -> (name, {topic id -> (title, {sub-topic id -> title})})."""
    out = {}
    for subject in coursework.tree(scoped, course_id)["subjects"]:
        out[subject["paper_id"]] = (subject["name"], {t["id"]: (t["title"], {x["id"]: x["title"] for x in t["subtopics"]}) for t in subject["topics"]})
    return out


def clean_tag(scoped: TenantRepo, course_id: str, body: dict) -> dict:
    """Where in the course plan a class belongs: a subject, and optionally one of its topics and a sub-topic of that topic."""
    places = _places(scoped, course_id)
    paper, topic, sub = (str(body.get(key) or "") for key in ("paper_id", "topic_id", "subtopic_id"))
    if not paper:
        raise ValidationError("Choose the subject this class belongs to.")
    if paper not in places:
        raise ValidationError("That subject isn't in this course.")
    topics = places[paper][1]
    if topic and topic not in topics:
        raise ValidationError("That topic isn't in this subject.")
    if sub and not topic:
        raise ValidationError("Choose the topic before the sub-topic.")
    if sub and sub not in topics[topic][1]:
        raise ValidationError("That sub-topic isn't in this topic.")
    return {"paper_id": paper, "topic_id": topic, "subtopic_id": sub}


# ---- Reading ----

def _sorted(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda c: (c["held_on"], c.get("held_time", ""), c["id"]), reverse=True)


def shown(record: dict, files: dict[str, dict], places: dict | None = None) -> dict:
    """A live class with its material resolved to titles and kinds, and where in the plan it sits. A file that has gone is left out."""
    paper, topic, sub = record.get("paper_id", ""), record.get("topic_id", ""), record.get("subtopic_id", "")
    names = []
    subject = (places or {}).get(paper)
    if subject:
        names.append(subject[0])
        if topic in subject[1]:
            names.append(subject[1][topic][0])
            if sub in subject[1][topic][1]:
                names.append(subject[1][topic][1][sub])
    return {
        "paper_id": paper, "topic_id": topic, "subtopic_id": sub, "place": " › ".join(names),
        "id": record["id"], "title": record["title"], "held_on": record["held_on"], "held_time": record.get("held_time", ""),
        "description": record.get("description", ""), "status": record.get("status", "draft"),
        "materials": coursework._shown_materials(record.get("materials"), files),
    }


def listing(scoped: TenantRepo, course_id: str, published_only: bool = False) -> list[dict]:
    """A course's live classes, newest first."""
    _course(scoped, course_id)
    files = {f["id"]: f for f in scoped.list_files(course_id) if f.get("status") == "ready"}
    records = [r for r in scoped.list_live(course_id) if not published_only or r.get("status") == "published"]
    places = _places(scoped, course_id)
    return [shown(r, files, places) for r in _sorted(records)]


# ---- Changing ----

def create(scoped: TenantRepo, course_id: str, body: dict, admin_email: str) -> dict:
    _course(scoped, course_id)
    materials = coursework._materials(scoped, course_id, body.get("materials"))
    note = clean_note(body.get("description"))
    record = {
        **clean_tag(scoped, course_id, body), "id": uuid4().hex, "title": clean_title(body.get("title")), "held_on": clean_date(body.get("held_on")), "held_time": clean_time(body.get("held_time")),
        "description": note, "materials": materials, "status": clean_status(body.get("status"), materials, note),
        "created_at": now_iso(), "created_by": admin_email,
    }
    scoped.put_live(course_id, record)
    return record


def edit(scoped: TenantRepo, course_id: str, live_id: str, body: dict) -> dict:
    """Change a live class. Only the fields sent change."""
    _course(scoped, course_id)
    record = scoped.get_live(course_id, live_id)
    if record is None:
        raise LiveClassNotFound()
    changes: dict = {}
    if any(key in body for key in ("paper_id", "topic_id", "subtopic_id")):
        changes.update(clean_tag(scoped, course_id, body))
    if body.get("title") is not None:
        changes["title"] = clean_title(body["title"])
    if body.get("held_on") is not None:
        changes["held_on"] = clean_date(body["held_on"])
    if "held_time" in body:
        changes["held_time"] = clean_time(body["held_time"])
    if body.get("description") is not None:
        changes["description"] = clean_note(body["description"])
    if body.get("materials") is not None:
        changes["materials"] = coursework._materials(scoped, course_id, body["materials"])
    if "status" in body or "materials" in changes or "description" in changes:
        merged = {**record, **changes}
        changes["status"] = clean_status(body.get("status", record.get("status", "draft")), merged.get("materials") or [], merged.get("description", ""))
    if changes:
        scoped.update_live(course_id, live_id, changes)
    return {**record, **changes}


def remove(scoped: TenantRepo, course_id: str, live_id: str) -> None:
    _course(scoped, course_id)
    if scoped.get_live(course_id, live_id) is None:
        raise LiveClassNotFound()
    scoped.delete_live(course_id, live_id)


def drop_file(scoped: TenantRepo, course_id: str, file_id: str) -> None:
    """A file was deleted from the course: take it out of any live class that used it."""
    for record in scoped.list_live(course_id):
        if any(m.get("file_id") == file_id for m in record.get("materials") or []):
            scoped.update_live(course_id, record["id"], {"materials": [m for m in record["materials"] if m.get("file_id") != file_id]})


# ---- Finding files by the names written in a sheet ----

def file_names(file: dict) -> set[str]:
    """Every name a sheet may use for a file: the original file name (with or without its ending) and its title."""
    names = set()
    for value in (file.get("filename"), file.get("title")):
        if value:
            lowered = " ".join(str(value).lower().split())
            names.add(lowered)
            names.add(re.sub(r"\.(mp4|pdf)$", "", lowered))
    return names
