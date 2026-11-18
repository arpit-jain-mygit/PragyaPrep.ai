"""Live classes for students: the published live classes of each course they can open now, newest first."""
from app import live_classes
from app.repo import TenantRepo
from app.student_coursework import _open_courses, _student_material


def listing(scoped: TenantRepo, member: dict) -> list[dict]:
    """One entry per course the student can open, with its published live classes. Never a storage key."""
    out = []
    for access in _open_courses(scoped, member):
        try:
            classes = live_classes.listing(scoped, access["course_id"], published_only=True)
        except Exception:
            continue
        if not classes:
            continue
        out.append({
            "course_id": access["course_id"], "course_name": access["course_name"],
            "classes": [{**c, "materials": _student_material(c["materials"])} for c in classes],
        })
    return out
