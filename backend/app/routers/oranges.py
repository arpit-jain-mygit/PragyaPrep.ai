"""Oranges: a student's daily count on the dashboard, the leaderboard, and the institute's daily target."""
from fastapi import APIRouter, Body, Depends, HTTPException

from app import oranges
from app.deps import STUDENT, TENANT_ADMIN, get_repo, get_tenant, get_tenant_repo, require_roles
from app.repo import Repo, TenantRepo
from app.tenants import ValidationError

router = APIRouter(tags=["oranges"])


@router.get("/api/my/oranges")
def my_oranges(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return oranges.for_student(scoped, tenant, student["email"])


@router.get("/api/my/leaderboard")
def my_leaderboard(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return oranges.leaderboard_for_student(scoped, tenant, student["email"])


@router.get("/api/admin/oranges-target", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def get_target(tenant: dict = Depends(get_tenant)):
    return {"target": oranges.target_of(tenant)}


@router.put("/api/admin/oranges-target")
def put_target(body: dict = Body(...), tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        return {"target": oranges.set_target(repo, tenant, body.get("target"))}
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
