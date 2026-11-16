"""Courses. Anyone can see an institute's open courses (for the registration dropdown). Only its admin can manage them."""
from fastapi import APIRouter, Depends, HTTPException

from app import courses
from app.deps import TENANT_ADMIN, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.schemas import CourseAdminOut, CourseIn, CoursePublicOut, CourseUpdateIn
from app.tenants import ValidationError

router = APIRouter(tags=["courses"])


@router.get("/api/courses", response_model=list[CoursePublicOut])
def open_courses(scoped: TenantRepo = Depends(get_tenant_repo)):
    """The courses a person can choose when they register. Hidden courses are left out."""
    return courses.public_courses(scoped)


@router.get(
    "/api/admin/courses", response_model=list[CourseAdminOut], dependencies=[Depends(require_roles(TENANT_ADMIN))]
)
def all_courses(scoped: TenantRepo = Depends(get_tenant_repo)):
    """Every course, including hidden ones, with its access length."""
    return scoped.list_courses()


@router.post(
    "/api/admin/courses",
    status_code=201,
    response_model=CourseAdminOut,
    dependencies=[Depends(require_roles(TENANT_ADMIN))],
)
def add_course(body: CourseIn, scoped: TenantRepo = Depends(get_tenant_repo)):
    try:
        return courses.create_course(scoped, body.name, body.fee, body.access.model_dump())
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.patch(
    "/api/admin/courses/{course_id}",
    response_model=CourseAdminOut,
    dependencies=[Depends(require_roles(TENANT_ADMIN))],
)
def change_course(course_id: str, body: CourseUpdateIn, scoped: TenantRepo = Depends(get_tenant_repo)):
    """Change a course's name, fee, access length, or hide it. Students who already have access keep what they have."""
    try:
        return courses.update_course(
            scoped,
            course_id,
            name=body.name,
            fee=body.fee,
            access=body.access.model_dump() if body.access is not None else None,
            active=body.active,
        )
    except courses.CourseNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that course.")
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
