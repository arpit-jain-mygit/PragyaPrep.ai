"""Coursework for students: the plan of each course they can open (published sub-topics only), with their own progress.

A student marks a sub-topic complete themselves and can undo it. Progress is per course: the same subject in two courses
has separate sub-topics, so separate progress. Topic, subject and course progress is the share of sub-topics marked complete.
A sub-topic is overdue when its finish-by date has passed and it isn't complete; nothing is blocked by that.
"""
from datetime import date, timedelta

from app import clock, content, coursework
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


def _progress(total: int, done: int) -> dict:
    return {"total": total, "done": done}


def tree(scoped: TenantRepo, member: dict) -> dict:
    """Everything the student can see: courses, subjects, topics and sub-topics with progress, plus counts for the home tile."""
    today = clock.today_india()
    done_rows = {(d["course_id"], d["subtopic_id"]): d["done_at"] for d in scoped.list_done(member["email"])}
    summary = {"total": 0, "done": 0, "left": 0, "overdue": 0, "this_week": 0}
    courses = []
    for access in _open_courses(scoped, member):
        course_id = access["course_id"]
        try:
            plan = coursework.tree(scoped, course_id)
        except coursework.CourseNotFound:
            continue
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
                    done_at = done_rows.get((course_id, sub["id"]))
                    due = sub["effective_due"]
                    overdue = bool(due) and not done_at and date.fromisoformat(due) < today
                    if due and not done_at and today <= date.fromisoformat(due) <= today + timedelta(days=WEEK_DAYS):
                        summary["this_week"] += 1
                    summary["overdue"] += overdue
                    subtopics.append({
                        "id": sub["id"], "title": sub["title"], "note": sub["note"], "due": due, "due_from": sub["due_from"],
                        "days_left": (date.fromisoformat(due) - today).days if due else None, "overdue": overdue,
                        "done": bool(done_at), "done_at": done_at, "materials": _student_material(sub["materials"]),
                    })
                if not subtopics:
                    continue
                finished = sum(1 for s in subtopics if s["done"])
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
        summary["total"] += course_total
        summary["done"] += course_done
        courses.append({"id": course_id, "name": plan["course"]["name"], "progress": _progress(course_total, course_done), "overdue": course_overdue, "subjects": subjects})
    summary["left"] = summary["total"] - summary["done"]
    return {"summary": summary, "courses": courses}


def set_done(scoped: TenantRepo, member: dict, course_id: str, subtopic_id: str, done: bool) -> dict:
    """Mark a sub-topic complete or not complete. Only for a published sub-topic of a course the student can open. Returns the new tree."""
    access = scoped.get_access(member["email"], course_id)
    if access is None or not content.is_active(access):
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
