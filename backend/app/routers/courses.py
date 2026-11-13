"""Course routes: list the courses you can see, and open one with its ready videos and PDFs."""
from fastapi import APIRouter, Depends, HTTPException

from app.deps import can_access_course, get_current_user, get_repo
from app.repo import Repo
from app.schemas import CourseDetailOut, CourseOut

router = APIRouter(prefix="/api/courses", tags=["courses"])


@router.get("", response_model=list[CourseOut])
def list_courses(user: dict = Depends(get_current_user), repo: Repo = Depends(get_repo)):
    if user["role"] == "admin":
        return sorted(repo.list_courses(), key=lambda course: course["title"].lower())
    # Students only see courses they have been granted.
    courses = [repo.get_course(course_id) for course_id in repo.granted_course_ids(user["id"])]
    return sorted((course for course in courses if course), key=lambda course: course["title"].lower())


@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course(course_id: str, user: dict = Depends(get_current_user), repo: Repo = Depends(get_repo)):
    course = repo.get_course(course_id)
    # 404 for both "missing" and "no access", so students can't probe which courses exist.
    if course is None or not can_access_course(repo, user, course_id):
        raise HTTPException(status_code=404, detail="Course not found")
    return {**course, "content_items": repo.list_course_content(course_id)}
