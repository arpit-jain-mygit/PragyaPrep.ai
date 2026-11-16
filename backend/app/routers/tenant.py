"""Public information about an institute, so the login and registration pages can look like it."""
from fastapi import APIRouter, Depends

from app.deps import get_tenant
from app.schemas import TenantPublicOut

router = APIRouter(prefix="/api", tags=["tenant"])


@router.get("/tenant", response_model=TenantPublicOut)
def tenant_info(tenant: dict = Depends(get_tenant)):
    return tenant
