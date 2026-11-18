"""The free plan for a student or parent with no institute: pick one course, then open that course's first sub-topic.

Everything comes from the platform's sample courses (settings.glimpse_tenant, AaptPrep's for now). Nothing about that institute
is shown, and only the one sample sub-topic's note and links are returned; files and the rest stay locked.
"""
from app import glimpse
from app.config import Settings
from app.repo import Repo, TenantRepo


class CourseNotFound(Exception):
    pass


class AlreadyPicked(Exception):
    pass


def state(repo: Repo, settings: Settings, member: dict) -> dict:
    return {"picked": member.get("free_course") or None, "courses": glimpse.outline(repo, settings.glimpse_tenant)}


def pick(repo: Repo, settings: Settings, scoped: TenantRepo, member: dict, course: str) -> dict:
    """Choose the one course. It stays chosen; changing it is for the platform team."""
    if member.get("free_course"):
        raise AlreadyPicked()
    if course not in [c["name"] for c in glimpse.outline(repo, settings.glimpse_tenant)]:
        raise CourseNotFound()
    scoped.update_member(member["email"], free_course=course)
    return state(repo, settings, {**member, "free_course": course})


def _find_sample(repo: Repo, settings: Settings, member: dict):
    """The picked course's one free sub-topic in the sample institute: (source, course, subject, topic, sub), or None."""
    name = member.get("free_course")
    if not name:
        return None
    from app import coursework
    source = repo.scoped(settings.glimpse_tenant)
    for course in source.list_courses():
        if course["name"] != name or not course.get("active", True):
            continue
        plan = coursework.tree(source, course["id"])
        for subject in plan["subjects"]:
            for topic in subject["topics"]:
                for sub in topic["subtopics"]:
                    if sub["status"] == "published":
                        return source, course, subject, topic, sub
    return None


def sample(repo: Repo, settings: Settings, member: dict) -> dict | None:
    """The one open sub-topic of the picked course: where it sits, its note, its links and its files (the files open through file_link)."""
    found = _find_sample(repo, settings, member)
    if found is None:
        return None
    _, course, subject, topic, sub = found
    links = [{"title": m.get("title") or m["url"], "url": m["url"]} for m in sub["materials"] if m["type"] == "link"]
    files = [{"file_id": m["file_id"], "title": m.get("title", ""), "kind": m.get("kind", ""), "size": m.get("size")} for m in sub["materials"] if m["type"] == "file"]
    return {"course": course["name"], "subject": subject["name"], "topic": topic["title"], "title": sub["title"], "note": sub["note"], "links": links, "files": files}


class FileNotFound(Exception):
    pass


def file_link(repo: Repo, storage, settings: Settings, member: dict, file_id: str) -> dict:
    """A short-lived link to one file of the free sub-topic. Only a file in that sub-topic opens, for this person's picked course."""
    found = _find_sample(repo, settings, member)
    if found is None or file_id not in {m["file_id"] for m in found[4]["materials"] if m["type"] == "file"}:
        raise FileNotFound()
    source, course = found[0], found[1]
    file = source.get_file(course["id"], file_id)
    if file is None or file["status"] != "ready":
        raise FileNotFound()
    url = storage.presigned_download(file["key"], file["content_type"], settings.file_url_seconds)
    return {"url": url, "expires_in": settings.file_url_seconds, "content_type": file["content_type"], "title": file["title"]}
