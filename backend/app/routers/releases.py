"""Daily RC and Weekly DILR: the admin's release schedule, and what each student sees today."""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Response

from app import clock, features, practice, releases
from app.deps import STUDENT, TENANT_ADMIN, get_repo, get_tenant, get_tenant_repo, require_roles
from app.repo import Repo, TenantRepo
from app.tenants import ValidationError

router = APIRouter(tags=["releases"])


def _refuse(error: ValidationError):
    raise HTTPException(status_code=422, detail=str(error))


@router.get("/api/admin/releases/{kind}", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def list_releases(kind: str, tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo)):
    try:
        return releases.listed(scoped, tenant, releases.check_kind(kind))
    except ValidationError as error:
        _refuse(error)


@router.put("/api/admin/releases/{kind}/schedule", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def save_schedule(kind: str, body: dict = Body(...), tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo)):
    try:
        return releases.set_schedule(repo, tenant, kind, body)
    except ValidationError as error:
        _refuse(error)


@router.post("/api/admin/releases", status_code=201)
def add_releases(body: dict = Body(...), tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        return releases.add(scoped, tenant, body, admin["email"], _today())
    except ValidationError as error:
        _refuse(error)


@router.delete("/api/admin/releases/{release_id}", status_code=204)
def remove_release(release_id: str, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    releases.remove(scoped, release_id)
    return Response(status_code=204)


@router.get("/api/my/releases/today")
def my_today(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return releases.for_student(scoped, tenant)


@router.post("/api/my/releases/{kind}/attempt", status_code=201)
def my_attempt(kind: str, tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    """Open the student's practice test on today's Daily RC passage, or this week's Weekly DILR set."""
    if kind not in releases.KINDS or not features.is_on(tenant, kind):
        raise HTTPException(status_code=404, detail="That isn't available.")
    try:
        test = releases.attempt(scoped, student, kind, _today())
    except practice.NotEnrolled:
        raise HTTPException(status_code=403, detail="Practice opens once you are enrolled in a course.")
    except ValidationError as error:
        _refuse(error)
    return {"id": test["id"], "title": test["title"], "question_count": len(test["question_ids"])}


def _today() -> date:
    return clock.today_india()


@router.get("/api/my/releases/{kind}/history")
def my_history(kind: str, tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    """The student's list of Daily RC passages or Weekly DILR sets so far, newest first. Empty when the institute has the kind switched off."""
    if kind not in releases.KINDS:
        raise HTTPException(status_code=404, detail="That isn't available.")
    if not features.is_on(tenant, kind):
        return {"releases": []}
    return {"releases": releases.history(scoped, student, kind, _today())}
