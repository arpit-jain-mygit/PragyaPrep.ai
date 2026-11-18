"""The admin adds parents (one by one or from an Excel sheet) and links them to their children."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

from app import parent_import, parents
from app.config import Settings
from app.deps import TENANT_ADMIN, get_mailer, get_settings, get_tenant, get_tenant_repo, require_roles
from app.mailer import Mailer
from app.repo import TenantRepo
from app.schemas import ParentIn
from app.tenants import ValidationError

router = APIRouter(tags=["parents"], dependencies=[Depends(require_roles(TENANT_ADMIN))])

NO_PARENT = "We couldn't find that parent."


@router.get("/api/admin/parents")
def list_parents(scoped: TenantRepo = Depends(get_tenant_repo)):
    return parents.listing(scoped)


@router.post("/api/admin/parents", status_code=201)
def add_parent(
    body: ParentIn, scoped: TenantRepo = Depends(get_tenant_repo), tenant: dict = Depends(get_tenant), settings: Settings = Depends(get_settings),
    mailer: Mailer = Depends(get_mailer), admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    try:
        parents.add(scoped, tenant, settings, mailer, admin["email"], body.model_dump())
    except parents.FieldErrors as error:
        return JSONResponse(status_code=422, content={"detail": "Please correct the marked fields.", "errors": error.errors})
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return parents.listing(scoped)


@router.get("/api/admin/parents/template")
def template():
    return Response(parent_import.build_template(), media_type=parent_import.XLSX_TYPE, headers={"Content-Disposition": 'attachment; filename="parents-template.xlsx"'})


@router.post("/api/admin/parents/import")
async def import_parents(
    request: Request, confirm: bool = Query(False), scoped: TenantRepo = Depends(get_tenant_repo), tenant: dict = Depends(get_tenant),
    settings: Settings = Depends(get_settings), mailer: Mailer = Depends(get_mailer), admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Read an uploaded .xlsx (the request body). Without confirm=true, only check it. With confirm=true, add every row that passed."""
    try:
        checked = parent_import.read(await request.body(), scoped, admin["email"])
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    result = {"summary": checked["summary"], "rows": checked["rows"], "confirmed": confirm}
    if confirm:
        done = parent_import.create(scoped, tenant, settings, mailer, checked["ready_records"], admin["email"]) if checked["ready_records"] else {"created": 0, "linked": 0, "emailed": 0}
        for row in result["rows"]:
            if row["status"] == "ready":
                row["status"] = "created"
        result["summary"] = {**checked["summary"], **done}
    return result


@router.delete("/api/admin/parents/{email}")
def remove_parent(email: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    try:
        parents.remove(scoped, email)
    except (parents.ParentNotFound, ValidationError):
        raise HTTPException(status_code=404, detail=NO_PARENT)
    return parents.listing(scoped)


@router.delete("/api/admin/parents/{email}/children/{child}")
def unlink_child(email: str, child: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    try:
        parents.unlink(scoped, email, child.strip().lower())
    except (parents.ParentNotFound, ValidationError):
        raise HTTPException(status_code=404, detail=NO_PARENT)
    return parents.listing(scoped)
