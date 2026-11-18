"""A student's live classes."""
from fastapi import APIRouter, Depends

from app import student_live
from app.deps import STUDENT, get_tenant_repo, require_roles
from app.repo import TenantRepo

router = APIRouter(tags=["student live classes"])


@router.get("/api/my/live-classes")
def my_live_classes(scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return student_live.listing(scoped, student)
