"""Topic tests: a student practises one topic at a time. The page lists each subject's topics that have published
questions, with how many there are. Starting one makes a practice test on that topic (see practice.py).

Only students enrolled in a course may start one, since the question bank is part of what they pay for.
The student only sees the page when the institute has the switch on (see features.py).
"""
from app import features, papers, practice
from app.repo import TenantRepo


def overview(scoped: TenantRepo, tenant: dict, student: dict) -> dict:
    """The subjects and topics a student can practise, with the count of published questions in each topic."""
    if not features.is_on(tenant, "topic_tests"):
        return {"topic_tests": None}
    counts: dict[tuple[str, str], int] = {}
    for item in scoped.list_questions():
        if item.get("status") == "published" and item.get("paper") and item.get("topic"):
            key = (item["paper"], item["topic"])
            counts[key] = counts.get(key, 0) + 1
    subjects = []
    for paper in papers.PAPERS:
        topics = [{"name": topic, "count": counts[(paper["id"], topic)]} for topic in paper["topics"] if counts.get((paper["id"], topic))]
        if topics:
            subjects.append({"id": paper["id"], "name": paper["name"], "section": paper["section"], "topics": topics})
    return {"topic_tests": {"enrolled": practice._enrolled(scoped, student), "subjects": subjects}}
