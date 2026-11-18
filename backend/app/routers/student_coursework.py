"""A student's coursework: the plan of each course they can open, and marking sub-topics complete."""
from fastapi import APIRouter, Depends, HTTPException

from app import student_coursework
from app.deps import STUDENT, get_tenant_repo, require_roles
from app.repo import TenantRepo

router = APIRouter(tags=["student coursework"])

NO_SUBTOPIC = "We couldn't find that sub-topic."


@router.get("/api/my/coursework")
def my_coursework(scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return student_coursework.tree(scoped, student)


def _mark(scoped: TenantRepo, student: dict, course_id: str, subtopic_id: str, done: bool):
    try:
        return student_coursework.set_done(scoped, student, course_id, subtopic_id, done)
    except student_coursework.SubtopicNotFound:
        raise HTTPException(status_code=404, detail=NO_SUBTOPIC)


@router.put("/api/my/coursework/{course_id}/{subtopic_id}/done")
def mark_done(course_id: str, subtopic_id: str, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return _mark(scoped, student, course_id, subtopic_id, True)


@router.delete("/api/my/coursework/{course_id}/{subtopic_id}/done")
def mark_not_done(course_id: str, subtopic_id: str, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return _mark(scoped, student, course_id, subtopic_id, False)
