"""A public peek at the courses: only the names of courses, subjects, topics and sub-topics, never notes, files, links or dates.

Until the platform has courses of its own, the outline comes from one institute (settings.glimpse_tenant). Nothing about that
institute is returned, so the home page carries no institute branding.
"""
from app import coursework
from app.repo import Repo


def outline(repo: Repo, slug: str) -> list[dict]:
    tenant = repo.get_tenant(slug)
    if tenant is None or tenant.get("status") != "active":
        return []
    scoped = repo.scoped(slug)
    out = []
    for course in sorted((c for c in scoped.list_courses() if c.get("active", True)), key=lambda c: c["name"].lower()):
        try:
            plan = coursework.tree(scoped, course["id"])
        except coursework.CourseNotFound:
            continue
        subjects = []
        for subject in plan["subjects"]:
            topics = [
                {"title": t["title"], "subtopics": [x["title"] for x in t["subtopics"] if x["status"] == "published"]}
                for t in subject["topics"]
            ]
            topics = [t for t in topics if t["subtopics"]]
            if topics:
                subjects.append({"name": subject["name"], "topics": topics})
        if subjects:
            out.append({"name": course["name"], "subjects": subjects})
    return out
