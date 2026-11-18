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


def sample(repo: Repo, settings: Settings, member: dict) -> dict | None:
    """The one open sub-topic of the picked course: where it sits, its note, and its links."""
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
                        links = [{"title": m.get("title") or m["url"], "url": m["url"]} for m in sub["materials"] if m["type"] == "link"]
                        return {"course": name, "subject": subject["name"], "topic": topic["title"], "title": sub["title"], "note": sub["note"], "links": links, "more_in_paid": sum(1 for m in sub["materials"] if m["type"] == "file")}
    return None
