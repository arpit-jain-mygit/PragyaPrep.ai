"""Course content and access. The admin adds files to courses and gives students access. Students open what they have."""
from fastapi import APIRouter, Depends, HTTPException, Response

from app import content
from app.config import Settings
from app.deps import STUDENT, TENANT_ADMIN, get_settings, get_storage, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.schemas import (
    AccessGrantIn,
    AccessOut,
    FileLinkOut,
    FileOut,
    FileStartIn,
    FileStartOut,
    GrantRequestedOut,
    MyCourseOut,
)
from app.storage import ContentStorage
from app.tenants import ValidationError

router = APIRouter(tags=["content"])

NO_COURSE = "We couldn't find that course."
NO_FILE = "We couldn't find that file."
NO_STUDENT = "We couldn't find that student."


# ---- Files, for the admin ----

@router.get("/api/admin/courses/{course_id}/files", response_model=list[FileOut])
def course_files(
    course_id: str, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))
):
    """Every file of a course, including ones still uploading."""
    try:
        return [content.public_file(f) for f in content.list_files(scoped, course_id)]
    except content.CourseNotFound:
        raise HTTPException(status_code=404, detail=NO_COURSE)


@router.post("/api/admin/courses/{course_id}/files", status_code=201, response_model=FileStartOut)
def start_upload(
    course_id: str,
    body: FileStartIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Say which file you are adding. You get a signed form: post the file to it, then call 'complete'."""
    try:
        file, upload = content.start_upload(
            scoped, storage, settings, course_id, body.filename, body.size, body.title or "", admin["email"]
        )
    except content.CourseNotFound:
        raise HTTPException(status_code=404, detail=NO_COURSE)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"file": content.public_file(file), "upload": upload}


@router.post("/api/admin/courses/{course_id}/files/{file_id}/complete", response_model=FileOut)
def finish_upload(
    course_id: str,
    file_id: str,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Check the uploaded file. Only a file that is really a PDF or MP4 becomes available to students."""
    try:
        return content.public_file(content.finish_upload(scoped, storage, course_id, file_id))
    except content.FileNotFound:
        raise HTTPException(status_code=404, detail=NO_FILE)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.post("/api/admin/courses/{course_id}/files/reindex", response_model=list[FileOut])
def reindex_files(
    course_id: str,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Read the text of every PDF of the course again (for files uploaded before reading existed)."""
    try:
        return content.reindex_course(scoped, storage, course_id)
    except content.CourseNotFound:
        raise HTTPException(status_code=404, detail=NO_COURSE)


@router.delete("/api/admin/courses/{course_id}/files/{file_id}", status_code=204)
def remove_file(
    course_id: str,
    file_id: str,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    try:
        content.delete_file(scoped, storage, course_id, file_id)
    except content.FileNotFound:
        raise HTTPException(status_code=404, detail=NO_FILE)
    return Response(status_code=204)


# ---- Access, for the admin ----

@router.get("/api/admin/registrations/{email}/access", response_model=list[AccessOut])
def student_access(
    email: str, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))
):
    try:
        return content.list_access(scoped, email)
    except content.StudentNotFound:
        raise HTTPException(status_code=404, detail=NO_STUDENT)


@router.post("/api/admin/registrations/{email}/access", status_code=201, response_model=AccessOut)
def give_access(
    email: str,
    body: AccessGrantIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Give an approved student a course, for the length the course sets. Doing it again renews it."""
    try:
        return content.grant_access(scoped, email, body.course_id, admin["email"])
    except content.StudentNotFound:
        raise HTTPException(status_code=404, detail=NO_STUDENT)
    except content.CourseNotFound:
        raise HTTPException(status_code=404, detail=NO_COURSE)
    except content.AccessRefused as error:
        raise HTTPException(status_code=409, detail=error.message)


@router.post("/api/admin/registrations/{email}/access/requested", status_code=201, response_model=GrantRequestedOut)
def give_requested_access(
    email: str, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))
):
    """Give an approved student every course they chose at registration, each for its own length."""
    try:
        return content.grant_requested(scoped, email, admin["email"])
    except content.StudentNotFound:
        raise HTTPException(status_code=404, detail=NO_STUDENT)
    except content.AccessRefused as error:
        raise HTTPException(status_code=409, detail=error.message)


@router.delete("/api/admin/registrations/{email}/access/{course_id}", status_code=204)
def take_access_away(
    email: str, course_id: str, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))
):
    try:
        content.revoke_access(scoped, email, course_id)
    except content.StudentNotFound:
        raise HTTPException(status_code=404, detail=NO_STUDENT)
    except content.CourseNotFound:
        raise HTTPException(status_code=404, detail="This student doesn't have that course.")
    return Response(status_code=204)


# ---- What a student sees ----

@router.get("/api/my/courses", response_model=list[MyCourseOut])
def my_courses(scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    """The courses this student can open now, with their files."""
    return content.my_courses(scoped, student)


@router.get("/api/my/courses/{course_id}/files/{file_id}/link", response_model=FileLinkOut)
def open_file(
    course_id: str,
    file_id: str,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
    student: dict = Depends(require_roles(STUDENT)),
):
    """A link to one file that works for a few minutes. Without access to the course, the answer is 'not found'."""
    try:
        return content.file_link(scoped, storage, settings, student, course_id, file_id)
    except content.NoAccess:
        raise HTTPException(status_code=404, detail=NO_FILE)
