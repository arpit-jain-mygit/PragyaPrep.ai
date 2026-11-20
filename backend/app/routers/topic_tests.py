"""Topic tests: the subjects and topics a student can practise, and where to start one."""
from fastapi import APIRouter, Depends

from app import topic_tests
from app.deps import STUDENT, get_tenant, get_tenant_repo, require_roles
from app.repo import TenantRepo

router = APIRouter(tags=["topic-tests"])


@router.get("/api/my/topic-tests")
def my_topic_tests(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return topic_tests.overview(scoped, tenant, student)
