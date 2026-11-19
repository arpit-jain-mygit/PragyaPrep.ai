"""The admin's view of the Ask AI log: what students asked and how well the notes covered it."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app import study_log
from app.deps import TENANT_ADMIN, get_tenant_repo, require_roles
from app.repo import TenantRepo

router = APIRouter(tags=["admin study log"])


@router.get("/api/admin/study-log")
def ask_log(
    response: Response,
    match: str = Query(default="all"),
    show_student: bool = Query(default=False),
    sort: str = Query(default="newest"),
    limit: int = Query(default=200, ge=1, le=200),
    before: str | None = Query(default=None, description="The offset from the X-Next-Cursor header of the last page."),
    scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Logged questions. Students' names and emails are left out unless show_student is true.

    Pages: pass limit, and the X-Next-Cursor header of each reply as `before` for the next page. Empty when there are no more."""
    try:
        offset = max(0, int(before)) if before else 0
    except ValueError:
        raise HTTPException(status_code=422, detail="The page cursor is not valid.")
    try:
        rows, next_offset = study_log.list_for_admin(scoped, match, show_student, limit=limit, sort=sort, offset=offset)
    except ValueError:
        raise HTTPException(status_code=422, detail="Choose a valid match and sort.")
    response.headers["X-Next-Cursor"] = str(next_offset) if next_offset is not None else ""
    return {"rows": rows}
