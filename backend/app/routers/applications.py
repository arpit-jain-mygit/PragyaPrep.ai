"""Application tracker for students: their own list of college applications."""
from fastapi import APIRouter, Body, Depends, HTTPException, Response

from app import applications, features
from app.deps import STUDENT, get_tenant, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.tenants import ValidationError

router = APIRouter(tags=["applications"])

NO_APPLICATION = "We couldn't find that application."


def _on(tenant: dict) -> None:
    """Refuse when the institute has the tracker switched off."""
    if not features.is_on(tenant, "application_tracker"):
        raise HTTPException(status_code=404, detail="That isn't available.")


@router.get("/api/my/applications")
def my_applications(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    _on(tenant)
    return applications.mine(scoped, student)


@router.post("/api/my/applications", status_code=201)
def add_application(
    body: dict = Body(...),
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    student: dict = Depends(require_roles(STUDENT)),
):
    _on(tenant)
    try:
        return applications.add(scoped, student, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.put("/api/my/applications/{application_id}")
def change_application(
    application_id: str,
    body: dict = Body(...),
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    student: dict = Depends(require_roles(STUDENT)),
):
    _on(tenant)
    try:
        record = applications.change(scoped, student, application_id, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    if record is None:
        raise HTTPException(status_code=404, detail=NO_APPLICATION)
    return record


@router.delete("/api/my/applications/{application_id}", status_code=204)
def remove_application(
    application_id: str,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    student: dict = Depends(require_roles(STUDENT)),
):
    _on(tenant)
    if not applications.remove(scoped, student, application_id):
        raise HTTPException(status_code=404, detail=NO_APPLICATION)
    return Response(status_code=204)
