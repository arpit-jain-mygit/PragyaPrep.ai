"""Analyse for students: topic tests, sectionals and mocks analytics, and SWOT."""
from fastapi import APIRouter, Depends, HTTPException

from app import analytics, features
from app.deps import STUDENT, get_tenant, get_tenant_repo, require_roles
from app.repo import TenantRepo

router = APIRouter(tags=["analyse"])


@router.get("/api/my/analyse/{view}")
def my_analyse(view: str, tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    if view not in analytics.VIEWS:
        raise HTTPException(status_code=404, detail="That isn't available.")
    if not features.is_on(tenant, {"topic": "analyse_topic_tests", "sectional": "analyse_sectionals", "mock": "analyse_mocks"}[view]):
        raise HTTPException(status_code=404, detail="That isn't available.")
    return analytics.view(scoped, student, analytics.VIEWS[view])


@router.get("/api/my/swot")
def my_swot(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    if not features.is_on(tenant, "swot"):
        raise HTTPException(status_code=404, detail="That isn't available.")
    return analytics.swot(scoped, student)
