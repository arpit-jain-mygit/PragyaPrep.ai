"""Coursework: the learning plan of a course, as a tree: subject, topic, sub-topic.

A sub-topic carries its material (the course's own PDF and MP4 files, and links) and may have a finish-by date.
A date can also be set on a topic or a subject, and anything below without its own date follows it.
Subjects are the course's own subjects (from the fixed list); topics and sub-topics are the admin's.
A sub-topic is a draft until it is published, so a plan can be built before students see it.
"""
import re
from datetime import date
from uuid import uuid4

from app import papers as paper_list
from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

MAX_TITLE = 120
MAX_NOTE = 2000
MAX_MATERIALS = 20
MAX_LINK = 500
MAX_NODES = 1500  # topics and sub-topics together, in one course


class CourseNotFound(Exception):
    pass


class NodeNotFound(Exception):
    pass


# ---- Checking what the admin sends ----

def _title(raw, what: str) -> str:
    title = " ".join(str(raw or "").split())
    if not 1 <= len(title) <= MAX_TITLE:
        raise ValidationError(f"The {what} name must be 1 to {MAX_TITLE} characters.")
    return title


def _same(a: str, b: str) -> bool:
    return " ".join(a.lower().split()) == " ".join(b.lower().split())


def clean_due(raw) -> str | None:
    """A finish-by date as YYYY-MM-DD, or None for no date."""
    if raw is None or raw == "":
        return None
    try:
        return date.fromisoformat(raw).isoformat() if isinstance(raw, str) and len(raw) == 10 else _bad_date()
    except ValueError:
        return _bad_date()


def _bad_date():
    raise ValidationError("Enter the finish-by date as YYYY-MM-DD.")


def _note(raw) -> str:
    note = str(raw or "").strip()
    if len(note) > MAX_NOTE:
        raise ValidationError(f"The note can be up to {MAX_NOTE} characters.")
    return note


def _materials(scoped: TenantRepo, course_id: str, raw) -> list[dict]:
    """The material of a sub-topic: files of this course (by id) and links."""
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > MAX_MATERIALS:
        raise ValidationError(f"A sub-topic can have up to {MAX_MATERIALS} items of material.")
    ready = {f["id"] for f in scoped.list_files(course_id) if f.get("status") == "ready"}
    out, seen = [], set()
    for item in raw:
        if not isinstance(item, dict):
            raise ValidationError("Each item of material must be a file or a link.")
        kind = item.get("type")
        if kind == "file":
            file_id = item.get("file_id")
            if file_id not in ready:
                raise ValidationError("Choose files from this course's Files.")
            if file_id in seen:
                continue
            seen.add(file_id)
            out.append({"type": "file", "file_id": file_id})
        elif kind == "link":
            url = str(item.get("url") or "").strip()
            if not re.match(r"^https?://[^\s]+$", url, re.IGNORECASE) or len(url) > MAX_LINK:
                raise ValidationError("A link must start with http:// or https:// and have no spaces.")
            title = " ".join(str(item.get("title") or "").split())[:100]
            out.append({"type": "link", "url": url, "title": title})
        else:
            raise ValidationError("Each item of material must be a file or a link.")
    return out


# ---- Reading the plan ----

def _course(scoped: TenantRepo, course_id: str) -> dict:
    course = scoped.get_course(course_id)
    if course is None:
        raise CourseNotFound()
    return course


def _ordered(nodes: list[dict]) -> list[dict]:
    return sorted(nodes, key=lambda n: (n.get("order", 0), n["id"]))


def _shown_materials(materials: list[dict], files: dict[str, dict]) -> list[dict]:
    """A sub-topic's material as the admin sees it: files with their title and kind. A file that has gone is left out."""
    out = []
    for item in materials or []:
        if item["type"] == "file":
            file = files.get(item["file_id"])
            if file:
                out.append({"type": "file", "file_id": file["id"], "title": file["title"], "kind": file["kind"], "size": file.get("size")})
        else:
            out.append(item)
    return out


def tree(scoped: TenantRepo, course_id: str) -> dict:
    """The whole plan of a course, with counts. Subjects come from the course; topics from the admin."""
    course = _course(scoped, course_id)
    nodes = scoped.list_work(course_id)
    files = {f["id"]: f for f in scoped.list_files(course_id) if f.get("status") == "ready"}
    subject_due = {n["paper_id"]: n.get("due") for n in nodes if n["kind"] == "subject"}
    topics_of: dict[str, list[dict]] = {}
    subs_of: dict[str, list[dict]] = {}
    for node in nodes:
        if node["kind"] == "topic":
            topics_of.setdefault(node["paper_id"], []).append(node)
        elif node["kind"] == "subtopic":
            subs_of.setdefault(node["parent_id"], []).append(node)

    # The course's own subjects first, then any subject that still has a plan but was taken off the course.
    wanted = list(course.get("papers") or [])
    wanted += [pid for pid in topics_of if pid not in wanted and pid in paper_list.BY_ID]
    counts = {"topics": 0, "subtopics": 0, "published": 0, "with_dates": 0}
    subjects = []
    for paper_id in wanted:
        paper = paper_list.BY_ID[paper_id]
        topics = []
        for topic in _ordered(topics_of.get(paper_id, [])):
            counts["topics"] += 1
            subtopics = []
            for sub in _ordered(subs_of.get(topic["id"], [])):
                own = sub.get("due")
                if own:
                    effective, source = own, "subtopic"
                elif topic.get("due"):
                    effective, source = topic["due"], "topic"
                elif subject_due.get(paper_id):
                    effective, source = subject_due[paper_id], "subject"
                else:
                    effective, source = None, None
                counts["subtopics"] += 1
                counts["published"] += sub.get("status") == "published"
                counts["with_dates"] += effective is not None
                subtopics.append({
                    "id": sub["id"], "title": sub["title"], "note": sub.get("note", ""), "due": own,
                    "effective_due": effective, "due_from": source, "status": sub.get("status", "draft"),
                    "materials": _shown_materials(sub.get("materials"), files),
                })
            topics.append({"id": topic["id"], "title": topic["title"], "due": topic.get("due"), "subtopics": subtopics})
        used = {t["title"].lower() for t in topics}
        subjects.append({
            "paper_id": paper_id, "name": paper["name"], "due": subject_due.get(paper_id), "in_course": paper_id in (course.get("papers") or []),
            "topics": topics, "topic_options": [name for name in paper["topics"] if name.lower() not in used],
        })
    return {"course": {"id": course["id"], "name": course["name"]}, "counts": counts, "subjects": subjects}


# ---- Changing the plan ----

def _count(scoped: TenantRepo, course_id: str) -> int:
    return sum(1 for n in scoped.list_work(course_id) if n["kind"] in ("topic", "subtopic"))


def _next_order(siblings: list[dict]) -> int:
    return max((n.get("order", 0) for n in siblings), default=0) + 1


def add_topic(scoped: TenantRepo, course_id: str, paper_id, title) -> dict:
    course = _course(scoped, course_id)
    if paper_id not in (course.get("papers") or []):
        raise ValidationError("That subject isn't part of this course.")
    name = _title(title, "topic")
    nodes = scoped.list_work(course_id)
    mine = [n for n in nodes if n["kind"] == "topic" and n["paper_id"] == paper_id]
    if any(_same(n["title"], name) for n in mine):
        raise ValidationError(f"There is already a topic called '{name}' in this subject.")
    if sum(1 for n in nodes if n["kind"] in ("topic", "subtopic")) >= MAX_NODES:
        raise ValidationError(f"A course plan can hold up to {MAX_NODES} topics and sub-topics.")
    node = {"id": uuid4().hex, "kind": "topic", "paper_id": paper_id, "title": name, "due": None, "order": _next_order(mine), "created_at": now_iso()}
    scoped.put_work(course_id, node)
    return node


def add_subtopic(scoped: TenantRepo, course_id: str, topic_id: str, fields: dict) -> dict:
    _course(scoped, course_id)
    nodes = scoped.list_work(course_id)
    topic = next((n for n in nodes if n["id"] == topic_id and n["kind"] == "topic"), None)
    if topic is None:
        raise NodeNotFound()
    name = _title(fields.get("title"), "sub-topic")
    mine = [n for n in nodes if n["kind"] == "subtopic" and n["parent_id"] == topic_id]
    if any(_same(n["title"], name) for n in mine):
        raise ValidationError(f"There is already a sub-topic called '{name}' in this topic.")
    if sum(1 for n in nodes if n["kind"] in ("topic", "subtopic")) >= MAX_NODES:
        raise ValidationError(f"A course plan can hold up to {MAX_NODES} topics and sub-topics.")
    node = {
        "id": uuid4().hex, "kind": "subtopic", "parent_id": topic_id, "title": name, "note": _note(fields.get("note")),
        "due": clean_due(fields.get("due")), "status": "draft", "materials": _materials(scoped, course_id, fields.get("materials")),
        "order": _next_order(mine), "created_at": now_iso(),
    }
    if fields.get("status") == "published":
        node["status"] = _publishable(node)
    elif fields.get("status") not in (None, "draft"):
        raise ValidationError("The status must be draft or published.")
    scoped.put_work(course_id, node)
    return node


def _publishable(node: dict) -> str:
    if not node.get("note") and not node.get("materials"):
        raise ValidationError("Add a note or some material before publishing.")
    return "published"


def edit(scoped: TenantRepo, course_id: str, node_id: str, fields: dict) -> dict:
    """Change a topic (name, date) or a sub-topic (name, note, date, status, material). Only the fields passed change."""
    _course(scoped, course_id)
    nodes = scoped.list_work(course_id)
    node = next((n for n in nodes if n["id"] == node_id and n["kind"] in ("topic", "subtopic")), None)
    if node is None:
        raise NodeNotFound()
    changes: dict = {}
    if "title" in fields and fields["title"] is not None:
        name = _title(fields["title"], "topic" if node["kind"] == "topic" else "sub-topic")
        if node["kind"] == "topic":
            siblings = [n for n in nodes if n["kind"] == "topic" and n["paper_id"] == node["paper_id"] and n["id"] != node_id]
        else:
            siblings = [n for n in nodes if n["kind"] == "subtopic" and n["parent_id"] == node["parent_id"] and n["id"] != node_id]
        if any(_same(n["title"], name) for n in siblings):
            raise ValidationError(f"There is already one called '{name}' here.")
        changes["title"] = name
    if "due" in fields:
        changes["due"] = clean_due(fields["due"])
    if node["kind"] == "subtopic":
        if "note" in fields and fields["note"] is not None:
            changes["note"] = _note(fields["note"])
        if "materials" in fields and fields["materials"] is not None:
            changes["materials"] = _materials(scoped, course_id, fields["materials"])
        status = fields.get("status")
        if status not in (None, "draft", "published"):
            raise ValidationError("The status must be draft or published.")
        merged = {**node, **changes}
        if status == "published" or (status is None and node.get("status") == "published" and ("note" in changes or "materials" in changes)):
            changes["status"] = _publishable(merged)
        elif status == "draft":
            changes["status"] = "draft"
    if changes:
        scoped.update_work(course_id, node_id, changes)
    return {**node, **changes}


def set_subject_due(scoped: TenantRepo, course_id: str, paper_id: str, raw) -> str | None:
    course = _course(scoped, course_id)
    if paper_id not in (course.get("papers") or []):
        raise ValidationError("That subject isn't part of this course.")
    due = clean_due(raw)
    key = f"subject-{paper_id}"
    if due is None:
        scoped.delete_work(course_id, key)
    else:
        scoped.put_work(course_id, {"id": key, "kind": "subject", "paper_id": paper_id, "due": due})
    return due


def remove(scoped: TenantRepo, course_id: str, node_id: str) -> int:
    """Delete a topic with its sub-topics, or one sub-topic. Returns how many nodes went."""
    _course(scoped, course_id)
    nodes = scoped.list_work(course_id)
    node = next((n for n in nodes if n["id"] == node_id and n["kind"] in ("topic", "subtopic")), None)
    if node is None:
        raise NodeNotFound()
    doomed = [node_id]
    if node["kind"] == "topic":
        doomed += [n["id"] for n in nodes if n["kind"] == "subtopic" and n["parent_id"] == node_id]
    for item in doomed:
        scoped.delete_work(course_id, item)
    return len(doomed)


def move(scoped: TenantRepo, course_id: str, node_id: str, direction) -> None:
    """Swap a topic or sub-topic with its neighbour, up or down."""
    if direction not in ("up", "down"):
        raise ValidationError("Choose up or down.")
    _course(scoped, course_id)
    nodes = scoped.list_work(course_id)
    node = next((n for n in nodes if n["id"] == node_id and n["kind"] in ("topic", "subtopic")), None)
    if node is None:
        raise NodeNotFound()
    if node["kind"] == "topic":
        siblings = [n for n in nodes if n["kind"] == "topic" and n["paper_id"] == node["paper_id"]]
    else:
        siblings = [n for n in nodes if n["kind"] == "subtopic" and n["parent_id"] == node["parent_id"]]
    siblings = _ordered(siblings)
    at = next(i for i, n in enumerate(siblings) if n["id"] == node_id)
    other = at - 1 if direction == "up" else at + 1
    if not 0 <= other < len(siblings):
        return
    siblings[at], siblings[other] = siblings[other], siblings[at]
    for position, item in enumerate(siblings, start=1):
        if item.get("order") != position:
            scoped.update_work(course_id, item["id"], {"order": position})


def drop_file(scoped: TenantRepo, course_id: str, file_id: str) -> None:
    """A file was deleted from the course: take it out of any sub-topic that used it."""
    for node in scoped.list_work(course_id):
        if node["kind"] == "subtopic" and any(m.get("file_id") == file_id for m in node.get("materials") or []):
            scoped.update_work(course_id, node["id"], {"materials": [m for m in node["materials"] if m.get("file_id") != file_id]})


# ---- Copying from another course ----

def _borrow_file(scoped: TenantRepo, source_id: str, target_id: str, file_id: str, admin_email: str) -> tuple[str | None, bool]:
    """Make a source course's file usable in the target course without a second upload: a file row that points at the same stored file.
    Returns the target's file id (None if the source file is missing or not ready) and whether a new row was made."""
    source = scoped.get_file(source_id, file_id)
    if source is None or source.get("status") != "ready":
        return None, False
    for existing in scoped.list_files(target_id):
        if existing.get("key") == source["key"] and existing.get("status") == "ready":
            return existing["id"], False
    row = {
        "id": uuid4().hex, "course_id": target_id, "title": source["title"], "kind": source["kind"], "content_type": source["content_type"],
        "size": source.get("size"), "status": "ready", "key": source["key"], "created_at": now_iso(), "created_by": admin_email,
        "copied_from": file_id,
    }
    scoped.create_file(row)
    return row["id"], True


def copy_from(
    scoped: TenantRepo, target_id: str, source_id, topic_ids, subtopic_ids, keep_dates=False, keep_status=False, admin_email: str = "",
) -> dict:
    """Copy topics and sub-topics from another course into this one.

    A chosen topic copies all its sub-topics; a chosen sub-topic copies just itself (and its topic is made if needed).
    Subjects are matched by the fixed list, so only subjects this course also has are copied. A topic with the same name
    gets the new sub-topics added to it; a sub-topic with the same name is skipped. Files are shared, not uploaded again.
    Dates are left out and sub-topics become drafts, unless keep_dates / keep_status say otherwise.
    """
    target = _course(scoped, target_id)
    if not isinstance(source_id, str) or source_id == target_id:
        raise ValidationError("Choose a different course to copy from.")
    if scoped.get_course(source_id) is None:
        raise ValidationError("Choose the course to copy from.")
    topic_ids = [] if topic_ids is None else topic_ids
    subtopic_ids = [] if subtopic_ids is None else subtopic_ids
    if not isinstance(topic_ids, list) or not isinstance(subtopic_ids, list) or not all(isinstance(i, str) for i in topic_ids + subtopic_ids):
        raise ValidationError("Choose topics and sub-topics from the list.")
    if not topic_ids and not subtopic_ids:
        raise ValidationError("Choose at least one topic or sub-topic to copy.")

    source_nodes = scoped.list_work(source_id)
    topics = {n["id"]: n for n in source_nodes if n["kind"] == "topic"}
    subs = {n["id"]: n for n in source_nodes if n["kind"] == "subtopic"}
    subject_dues = {n["paper_id"]: n.get("due") for n in source_nodes if n["kind"] == "subject"}
    wanted: dict[str, set | None] = {}  # source topic id -> the sub-topic ids wanted, or None for all of them
    for tid in topic_ids:
        if tid not in topics:
            raise ValidationError("Choose topics and sub-topics from the list.")
        wanted[tid] = None
    for sid in subtopic_ids:
        if sid not in subs:
            raise ValidationError("Choose topics and sub-topics from the list.")
        parent = subs[sid]["parent_id"]
        if wanted.get(parent, set()) is not None:
            wanted.setdefault(parent, set()).add(sid)

    target_papers = set(target.get("papers") or [])
    result = {"topics_added": 0, "subtopics_added": 0, "subtopics_skipped": 0, "files_linked": 0, "subjects_skipped": []}
    for topic in sorted((topics[t] for t in wanted), key=lambda n: (n["paper_id"], n.get("order", 0), n["id"])):
        paper_id = topic["paper_id"]
        if paper_id not in target_papers:
            name = paper_list.BY_ID[paper_id]["name"]
            if name not in result["subjects_skipped"]:
                result["subjects_skipped"].append(name)
            continue
        here = scoped.list_work(target_id)
        match = next((n for n in here if n["kind"] == "topic" and n["paper_id"] == paper_id and _same(n["title"], topic["title"])), None)
        if match is None:
            match = add_topic(scoped, target_id, paper_id, topic["title"])
            result["topics_added"] += 1
            if keep_dates and topic.get("due"):
                scoped.update_work(target_id, match["id"], {"due": topic["due"]})
        if keep_dates and subject_dues.get(paper_id) and not any(n["kind"] == "subject" and n["paper_id"] == paper_id for n in here):
            set_subject_due(scoped, target_id, paper_id, subject_dues[paper_id])
        have = {" ".join(n["title"].lower().split()) for n in here if n["kind"] == "subtopic" and n["parent_id"] == match["id"]}
        chosen = _ordered([s for s in subs.values() if s["parent_id"] == topic["id"] and (wanted[topic["id"]] is None or s["id"] in wanted[topic["id"]])])
        for sub in chosen:
            if " ".join(sub["title"].lower().split()) in have:
                result["subtopics_skipped"] += 1
                continue
            materials = []
            for item in sub.get("materials") or []:
                if item["type"] == "file":
                    new_id, made = _borrow_file(scoped, source_id, target_id, item["file_id"], admin_email)
                    if new_id:
                        materials.append({"type": "file", "file_id": new_id})
                        result["files_linked"] += made
                else:
                    materials.append(dict(item))
            status = sub.get("status", "draft") if keep_status else "draft"
            if status == "published" and not (sub.get("note") or materials):
                status = "draft"
            add_subtopic(scoped, target_id, match["id"], {
                "title": sub["title"], "note": sub.get("note", ""), "due": sub.get("due") if keep_dates else None,
                "materials": materials, "status": status,
            })
            have.add(" ".join(sub["title"].lower().split()))
            result["subtopics_added"] += 1
    return result
