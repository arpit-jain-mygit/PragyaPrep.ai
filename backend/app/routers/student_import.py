"""Bulk onboarding for the institute's admin: the Excel template, a preview or import of a filled-in sheet, and the welcome emails."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app import student_import
from app.config import Settings
from app.deps import TENANT_ADMIN, get_mailer, get_settings, get_tenant, get_tenant_repo, require_roles
from app.mailer import Mailer
from app.repo import TenantRepo
from app.schemas import WelcomeIn
from app.tenants import ValidationError

router = APIRouter(tags=["student import"], dependencies=[Depends(require_roles(TENANT_ADMIN))])


@router.get("/api/admin/students/import/template")
def template(scoped: TenantRepo = Depends(get_tenant_repo)):
    """The Excel file to fill in, listing this institute's open courses."""
    names = sorted(c["name"] for c in scoped.list_courses() if c.get("active", True))
    return Response(
        student_import.build_template(names), media_type=student_import.XLSX_TYPE,
        headers={"Content-Disposition": 'attachment; filename="student-import-template.xlsx"'},
    )


@router.post("/api/admin/students/import")
async def import_students(
    request: Request,
    confirm: bool = Query(False),
    scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Read an uploaded .xlsx (the request body). Without confirm=true, only check it and show what would happen.
    With confirm=true, create every row that passed. Rows with problems and students already registered are never touched."""
    body = await request.body()
    try:
        checked = student_import.read(body, scoped, admin["email"])
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    result = {"summary": checked["summary"], "rows": checked["rows"], "confirmed": confirm, "batch": None, "created": []}
    if confirm:
        made = student_import.create(scoped, admin["email"], checked["ready_records"]) if checked["ready_records"] else {"batch": None, "results": []}
        by_email = {r["email"]: r for r in made["results"]}
        created = 0
        for row in result["rows"]:
            outcome = by_email.get(row["email"])
            if row["status"] == "ready" and outcome:
                if outcome["result"] == "created":
                    row["status"] = "created"
                    created += 1
                    if outcome["access_failed"]:
                        row["message"] = f"Created, but could not give access to {', '.join(outcome['access_failed'])}."
                else:
                    row["status"], row["message"] = "skipped", outcome["message"]
        result["batch"] = made["batch"]
        result["created"] = [r["email"] for r in made["results"] if r["result"] == "created"]
        result["summary"] = {**checked["summary"], "created": created, "skipped": sum(1 for r in result["rows"] if r["status"] == "skipped")}
    return result


@router.post("/api/admin/students/welcome")
def welcome(
    body: WelcomeIn,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    settings: Settings = Depends(get_settings),
    mailer: Mailer = Depends(get_mailer),
):
    """Email a welcome to some imported students (up to 25 at a time). Each is emailed once."""
    try:
        return student_import.welcome(scoped, tenant, settings, mailer, body.emails)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
