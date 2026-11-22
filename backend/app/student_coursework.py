"""Coursework for students: the plan of each course they can open (published sub-topics only), with their own progress.

A student marks a sub-topic complete themselves and can undo it. Progress is per course: the same subject in two courses
has separate sub-topics, so separate progress. Topic, subject and course progress is the share of sub-topics marked complete.
A sub-topic is overdue when its finish-by date has passed and it isn't complete; nothing is blocked by that.
"""
from datetime import date, timedelta

from app import clock, content, coursework, live_classes
from app.repo import TenantRepo, now_iso

WEEK_DAYS = 7


class SubtopicNotFound(Exception):
    pass


def _open_courses(scoped: TenantRepo, member: dict) -> list[dict]:
    """The courses this student may open right now, by name."""
    return sorted((a for a in scoped.list_access(member["email"]) if content.is_active(a)), key=lambda a: a["course_name"].lower())


def _student_material(items: list[dict]) -> list[dict]:
    """A sub-topic's material as a student sees it: files (title, kind, size) and links. Never a storage key."""
    out = []
    for item in items:
        if item["type"] == "file":
            out.append({"type": "file", "file_id": item["file_id"], "title": item["title"], "kind": item["kind"], "size": item.get("size")})
        else:
            out.append({"type": "link", "url": item["url"], "title": item.get("title") or item["url"]})
    return out


def _belongs(item: dict, paper_id: str, topic_id: str, sub_id: str) -> bool:
    """A live class shows under its sub-topic, and under every sub-topic of its topic or subject when it was tagged higher up."""
    if item.get("subtopic_id"):
        return item["subtopic_id"] == sub_id
    if item.get("topic_id"):
        return item["topic_id"] == topic_id
    return item.get("paper_id") == paper_id


def _student_live(item: dict) -> dict:
    return {"id": item["id"], "title": item["title"], "held_on": item["held_on"], "held_time": item["held_time"], "description": item["description"], "materials": _student_material(item["materials"])}


def _progress(total: int, done: int) -> dict:
    return {"total": total, "done": done}


def _courses_to_show(scoped: TenantRepo, member: dict) -> list[tuple[str, bool]]:
    """Every active course of the institute, by name, with whether this student can open it. A course they can't open is shown
    locked, except for its free sample sub-topic."""
    open_ids = {a["course_id"] for a in _open_courses(scoped, member)}
    return [(c["id"], c["id"] in open_ids) for c in sorted(scoped.list_courses(), key=lambda c: c["name"].lower()) if c.get("active", True)]


def tree(scoped: TenantRepo, member: dict) -> dict:
    """Everything the student can see: courses, subjects, topics and sub-topics with progress, plus counts for the home tile.

    Free mode: courses the student can't open are listed with lock icons and no content, except the free sample sub-topic
    (the first sub-topic of the first topic of the first course), which opens for everyone. Locked sub-topics carry no note,
    dates or material, and don't count in the home tile's numbers."""
    today = clock.today_india()
    done_rows = {(d["course_id"], d["subtopic_id"]): d["done_at"] for d in scoped.list_done(member["email"])}
    free = coursework.free_pick(scoped)
    summary = {"total": 0, "done": 0, "left": 0, "overdue": 0, "this_week": 0}
    courses = []
    # True when the student can open a course with English > Vocabulary in its plan. Drives the Vocabulary link in My Learning.
    vocabulary = False
    for course_id, has_access in _courses_to_show(scoped, member):
        try:
            plan = coursework.tree(scoped, course_id)
        except coursework.CourseNotFound:
            continue
        live = live_classes.listing(scoped, course_id, published_only=True) if has_access else []
        subjects = []
        course_total = course_done = course_overdue = 0
        for subject in plan["subjects"]:
            topics = []
            subject_total = subject_done = 0
            for topic in subject["topics"]:
                subtopics = []
                for sub in topic["subtopics"]:
                    if sub["status"] != "published":
                        continue
                    is_free = bool(free) and free["course_id"] == course_id and free["subtopic_id"] == sub["id"]
                    if not has_access and not is_free:
                        subtopics.append({"id": sub["id"], "title": sub["title"], "locked": True, "note": "", "due": None, "due_from": None, "days_left": None,
                                          "overdue": False, "done": False, "done_at": None, "materials": []})
                        continue
                    done_at = done_rows.get((course_id, sub["id"]))
                    due = sub["effective_due"]
                    overdue = bool(due) and not done_at and date.fromisoformat(due) < today
                    if due and not done_at and today <= date.fromisoformat(due) <= today + timedelta(days=WEEK_DAYS):
                        summary["this_week"] += 1
                    summary["overdue"] += overdue
                    subtopics.append({"locked": False, "free": is_free and not has_access,
                        "id": sub["id"], "title": sub["title"], "note": sub["note"], "due": due, "due_from": sub["due_from"],
                        "days_left": (date.fromisoformat(due) - today).days if due else None, "overdue": overdue,
                        "done": bool(done_at), "done_at": done_at, "materials": _student_material(sub["materials"]),
                        "live_classes": [_student_live(c) for c in live if _belongs(c, subject["paper_id"], topic["id"], sub["id"])],
                    })
                if not subtopics:
                    continue
                if has_access and subject["paper_id"] == "english" and topic["title"].strip().lower() == "vocabulary":
                    vocabulary = True
                finished = sum(1 for s in subtopics if s["done"])
                summary["total"] += sum(1 for s in subtopics if not s["locked"])
                summary["done"] += finished
                subject_total += len(subtopics)
                subject_done += finished
                topics.append({"id": topic["id"], "title": topic["title"], "due": topic["due"], "progress": _progress(len(subtopics), finished), "subtopics": subtopics})
            if not topics:
                continue
            course_total += subject_total
            course_done += subject_done
            course_overdue += sum(1 for t in topics for s in t["subtopics"] if s["overdue"])
            subjects.append({"paper_id": subject["paper_id"], "name": subject["name"], "due": subject["due"], "progress": _progress(subject_total, subject_done), "topics": topics})
        if not subjects:
            continue
        courses.append({"id": course_id, "name": plan["course"]["name"], "locked": not has_access, "progress": _progress(course_total, course_done), "overdue": course_overdue, "subjects": subjects})
    summary["left"] = summary["total"] - summary["done"]
    return {"summary": summary, "courses": courses, "vocabulary": vocabulary}


def set_done(scoped: TenantRepo, member: dict, course_id: str, subtopic_id: str, done: bool) -> dict:
    """Mark a sub-topic complete or not complete. Only for a published sub-topic of a course the student can open. Returns the new tree."""
    access = scoped.get_access(member["email"], course_id)
    if access is None or not content.is_active(access):
        free = coursework.free_pick(scoped)
        if free is None or free["course_id"] != course_id or free["subtopic_id"] != subtopic_id:
            raise SubtopicNotFound()
    node = scoped.get_work(course_id, subtopic_id)
    if node is None or node["kind"] != "subtopic" or node.get("status") != "published":
        raise SubtopicNotFound()
    if done:
        if scoped.get_done(member["email"], course_id, subtopic_id) is None:
            scoped.put_done(member["email"], course_id, subtopic_id, now_iso())
    else:
        scoped.delete_done(member["email"], course_id, subtopic_id)
    return tree(scoped, member)
