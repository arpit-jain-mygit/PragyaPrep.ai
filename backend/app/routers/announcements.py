"""Announcements and reminders from the institute's admin, and each student's notices."""
from fastapi import APIRouter, Depends, HTTPException

from app import announcements, coursework
from app.config import Settings
from app.deps import STUDENT, TENANT_ADMIN, get_mailer, get_settings, get_tenant, get_tenant_repo, require_roles
from app.mailer import Mailer
from app.repo import TenantRepo
from app.schemas import AnnouncementIn, ReminderIn
from app.tenants import ValidationError

router = APIRouter(tags=["announcements"])

NO_NOTICE = "We couldn't find that notice."


# ---- Admin ----

@router.post("/api/admin/announcements", status_code=201)
def send_announcement(
    body: AnnouncementIn,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    settings: Settings = Depends(get_settings),
    mailer: Mailer = Depends(get_mailer),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    try:
        return announcements.announce(scoped, tenant, settings, mailer, admin["email"], body.model_dump())
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.get("/api/admin/announcements", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def sent_announcements(scoped: TenantRepo = Depends(get_tenant_repo)):
    return announcements.history(scoped)


@router.post("/api/admin/reminders")
def send_reminders(
    body: ReminderIn,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    settings: Settings = Depends(get_settings),
    mailer: Mailer = Depends(get_mailer),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Remind the students who are behind in a course (or just the ones named), each with their own numbers."""
    try:
        return announcements.remind(scoped, tenant, settings, mailer, admin["email"], body.course_id, body.emails, body.send_email is not False)
    except coursework.CourseNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that course.")
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


# ---- Student ----

@router.get("/api/my/notices")
def my_notices(scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return announcements.notices_for(scoped, student)


@router.put("/api/my/notices/read-all")
def read_all(scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return announcements.mark_all_read(scoped, student)


@router.put("/api/my/notices/{notice_id}/read")
def read_one(notice_id: str, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    try:
        return announcements.mark_read(scoped, student, notice_id)
    except announcements.NoticeNotFound:
        raise HTTPException(status_code=404, detail=NO_NOTICE)
