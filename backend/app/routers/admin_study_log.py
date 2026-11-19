"""The admin's view of the Ask AI log: what students asked and how well the notes covered it."""
from fastapi import APIRouter, Depends, HTTPException, Query

from app import study_log
from app.deps import TENANT_ADMIN, get_tenant_repo, require_roles
from app.repo import TenantRepo

router = APIRouter(tags=["admin study log"])


@router.get("/api/admin/study-log")
def ask_log(
    match: str = Query(default="all"),
    show_student: bool = Query(default=False),
    sort: str = Query(default="newest"),
    scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Logged questions. Students' names and emails are left out unless show_student is true."""
    try:
        return {"rows": study_log.list_for_admin(scoped, match, show_student, sort=sort)}
    except ValueError:
        raise HTTPException(status_code=422, detail="Choose a valid match and sort.")
