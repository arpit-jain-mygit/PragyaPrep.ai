"""Counts for the admin's home page. Only the institute's admin can see them."""
from fastapi import APIRouter, Depends

from app import admin_home
from app.deps import TENANT_ADMIN, get_repo, get_tenant, get_tenant_repo, require_roles
from app.repo import Repo, TenantRepo

router = APIRouter(tags=["admin home"], dependencies=[Depends(require_roles(TENANT_ADMIN))])


@router.get("/api/admin/home")
def home_counts(scoped: TenantRepo = Depends(get_tenant_repo)):
    return admin_home.counts(scoped)


@router.get("/api/admin/home/behind")
def home_behind(tenant: dict = Depends(get_tenant)):
    """The saved answer, instantly (nothing is worked out here). The page then asks for a refresh when the answer is old or missing."""
    return admin_home.saved(tenant)


@router.post("/api/admin/home/behind/refresh")
def refresh_behind(tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), scoped: TenantRepo = Depends(get_tenant_repo)):
    """Work out how many students are behind and save it. Takes a few seconds on a large institute."""
    return admin_home.refresh(repo, scoped, tenant)
