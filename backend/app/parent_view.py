"""What a parent sees of their children: where each one stands in each course, how their tests went, and where they are weak."""
from app import attempts, avatars, parents, progress, student_coursework
from app.repo import TenantRepo
from app.tenants import ValidationError, normalize_email


def child_of(scoped: TenantRepo, parent: dict, email: str) -> dict:
    """The child's member record, only if this parent is linked to them and they are still a student here."""
    try:
        email = normalize_email(email)
    except ValidationError:
        raise parents.ParentNotFound()
    child = scoped.get_member(email)
    if child is None or child.get("role") != "student" or email not in parent.get("children", []):
        raise parents.ParentNotFound()
    return child


def _courses(scoped: TenantRepo, child: dict) -> list[dict]:
    return [{"id": a["course_id"], "name": a["course_name"]} for a in student_coursework._open_courses(scoped, child)]


def children(scoped: TenantRepo, parent: dict, storage) -> list[dict]:
    out = []
    for email in parent.get("children", []):
        try:
            child = child_of(scoped, parent, email)
        except parents.ParentNotFound:
            continue
        courses = []
        for course in _courses(scoped, child):
            try:
                courses.append({**course, "row": progress.student(scoped, course["id"], email, storage)["row"]})
            except progress.StudentNotInCourse:
                continue
        out.append({"email": email, "name": parents._name(child), "avatar_url": avatars.url_for(storage, child), "status": child.get("status", ""), "courses": courses})
    return out


def detail(scoped: TenantRepo, parent: dict, email: str, storage) -> dict:
    child = child_of(scoped, parent, email)
    courses = []
    for course in _courses(scoped, child):
        try:
            courses.append(progress.student(scoped, course["id"], email, storage))
        except progress.StudentNotInCourse:
            continue
    results = attempts.my_results(scoped, child)
    practice = []
    for test in scoped.list_practice(email):
        card = attempts.test_card(scoped, child, test)
        practice.append({
            "id": test["id"], "title": test["title"], "question_count": card["question_count"], "attempts_used": card["attempts_used"], "best": card["best"],
            "set_by_parent": test.get("created_by") != email, "created_at": test.get("created_at", ""),
        })
    return {
        "student": {"email": email, "name": parents._name(child), "avatar_url": avatars.url_for(storage, child)},
        "courses": courses,
        "practice": practice,
        "results": {"summary": results["summary"], "trend": results["trend"], "subjects": results["subjects"]},
    }
