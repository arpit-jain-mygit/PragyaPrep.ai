"""The institute admin's Features & labels page: which screens show, what they are called, and their order.
Only the institute's own admin can change them."""
from fastapi import APIRouter, Body, Depends, HTTPException

from app import features, oranges
from app.deps import TENANT_ADMIN, get_repo, get_tenant, require_roles
from app.repo import Repo
from app.tenants import ValidationError

router = APIRouter(prefix="/api/admin/features", tags=["features"])


@router.get("")
def get_features(tenant: dict = Depends(get_tenant), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    return {"features": features.view(tenant), "oranges_target": oranges.target_of(tenant)}


@router.get("/headings")
def get_headings(tenant: dict = Depends(get_tenant), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    return {"headings": features.headings(tenant)}


@router.put("/headings")
def save_headings(body: dict = Body(...), tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        saved = features.save_headings(repo, tenant, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"headings": saved}


@router.put("")
def save_features(body: list = Body(...), tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        listed = features.save(repo, tenant, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"features": listed}
