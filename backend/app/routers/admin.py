"""Admin routes: create courses, grant and revoke access by user ID, and reset a student's password."""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.deps import get_repo, require_admin
from app.repo import ConflictError, Repo, now_iso
from app.schemas import CourseIn, CourseOut, GrantIn, PasswordResetIn, UserOut
from app.security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.post("/courses", status_code=201, response_model=CourseOut)
def create_course(body: CourseIn, repo: Repo = Depends(get_repo)):
    course = {
        "id": uuid4().hex,
        "title": body.title.strip(),
        "description": body.description.strip(),
        "created_at": now_iso(),
    }
    try:
        repo.create_course(course)
    except ConflictError:
        raise HTTPException(status_code=409, detail="A course with that title already exists")
    return course


@router.post("/courses/{course_id}/grants", status_code=201, response_model=UserOut)
def grant_access(course_id: str, body: GrantIn, repo: Repo = Depends(get_repo)):
    """Give a student access to a course, by their login ID."""
    if repo.get_course(course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")
    user = repo.user_by_login(body.login_id.strip())
    if user is None:
        raise HTTPException(status_code=404, detail="No user with that ID")
    repo.grant(user["id"], course_id)
    return user


@router.delete("/courses/{course_id}/grants/{login_id}", status_code=204)
def revoke_access(course_id: str, login_id: str, repo: Repo = Depends(get_repo)) -> Response:
    user = repo.user_by_login(login_id)
    if user is not None:
        repo.revoke(user["id"], course_id)
    return Response(status_code=204)


@router.post("/users/{login_id}/password", response_model=UserOut)
def reset_password(login_id: str, body: PasswordResetIn, repo: Repo = Depends(get_repo)):
    user = repo.user_by_login(login_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    repo.update_user(user["id"], password_hash=hash_password(body.password))
    return user
