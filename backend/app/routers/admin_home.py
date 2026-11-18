"""Counts for the admin's home page. Only the institute's admin can see them."""
from fastapi import APIRouter, Depends

from app import admin_home
from app.deps import TENANT_ADMIN, get_tenant_repo, require_roles
from app.repo import TenantRepo

router = APIRouter(tags=["admin home"], dependencies=[Depends(require_roles(TENANT_ADMIN))])


@router.get("/api/admin/home")
def home_counts(scoped: TenantRepo = Depends(get_tenant_repo)):
    return admin_home.counts(scoped)


@router.get("/api/admin/home/behind")
def home_behind(scoped: TenantRepo = Depends(get_tenant_repo)):
    return admin_home.behind(scoped)
