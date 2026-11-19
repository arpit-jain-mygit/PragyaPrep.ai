"""Progress, for the institute's admin only: who is behind in a course, which sub-topics students are not finishing, and one student's detail."""
from fastapi import APIRouter, Depends, HTTPException

from app import coursework, progress
from app.deps import TENANT_ADMIN, get_storage, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.storage import ContentStorage

router = APIRouter(tags=["progress"], dependencies=[Depends(require_roles(TENANT_ADMIN))])

NO_COURSE = "We couldn't find that course."
NO_STUDENT = "We couldn't find that student in this course."


def _guard(action):
    try:
        return action()
    except coursework.CourseNotFound:
        raise HTTPException(status_code=404, detail=NO_COURSE)
    except progress.StudentNotInCourse:
        raise HTTPException(status_code=404, detail=NO_STUDENT)


@router.get("/api/admin/progress/{course_id}")
def course_progress(course_id: str, scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)):
    """The saved student list, instantly (worked out only the first time). 'fresh' is false when it is over 15 minutes old."""
    return _guard(lambda: progress.overview(scoped, course_id, storage))


@router.post("/api/admin/progress/{course_id}/refresh")
def refresh_progress(course_id: str, scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)):
    """Work the page out again from the records and save it. Asked again within a minute, it returns what is saved."""
    return _guard(lambda: progress.overview(scoped, course_id, storage, refresh=True))


@router.get("/api/admin/progress/{course_id}/stuck")
def course_stuck(course_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    return _guard(lambda: progress.stuck_overview(scoped, course_id))


@router.get("/api/admin/progress/{course_id}/students/{email}")
def student_progress(course_id: str, email: str, scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)):
    return _guard(lambda: progress.student(scoped, course_id, email.strip().lower(), storage))
