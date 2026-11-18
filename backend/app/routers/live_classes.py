"""Live classes of a course: the admin adds, changes and removes them, one by one or from an Excel sheet."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app import coursework, live_classes, live_import
from app.deps import TENANT_ADMIN, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.schemas import LiveClassIn
from app.tenants import ValidationError

router = APIRouter(tags=["live classes"], dependencies=[Depends(require_roles(TENANT_ADMIN))])

NO_COURSE = "We couldn't find that course."
NO_CLASS = "We couldn't find that live class."


def _guard(action):
    try:
        return action()
    except coursework.CourseNotFound:
        raise HTTPException(status_code=404, detail=NO_COURSE)
    except live_classes.LiveClassNotFound:
        raise HTTPException(status_code=404, detail=NO_CLASS)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.get("/api/admin/courses/{course_id}/live-classes")
def list_live(course_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    return _guard(lambda: live_classes.listing(scoped, course_id))


@router.post("/api/admin/courses/{course_id}/live-classes", status_code=201)
def add_live(course_id: str, body: LiveClassIn, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    def run():
        live_classes.create(scoped, course_id, body.model_dump(), admin["email"])
        return live_classes.listing(scoped, course_id)
    return _guard(run)


@router.get("/api/admin/courses/{course_id}/live-classes/template")
def template(course_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    """The Excel file to fill in for adding many live classes, listing the course's uploaded files."""
    course = scoped.get_course(course_id)
    if course is None:
        raise HTTPException(status_code=404, detail=NO_COURSE)
    return Response(
        live_import.build_template(course["name"], scoped.list_files(course_id), coursework.tree(scoped, course_id)["subjects"]), media_type=live_import.XLSX_TYPE,
        headers={"Content-Disposition": 'attachment; filename="live-classes-template.xlsx"'},
    )


@router.post("/api/admin/courses/{course_id}/live-classes/import")
async def import_live(
    course_id: str, request: Request, confirm: bool = Query(False), scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Read an uploaded .xlsx (the request body). Without confirm=true, only check it. With confirm=true, create every row that passed."""
    if scoped.get_course(course_id) is None:
        raise HTTPException(status_code=404, detail=NO_COURSE)
    body = await request.body()
    try:
        checked = live_import.read(body, scoped, course_id)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    result = {"summary": checked["summary"], "rows": checked["rows"], "confirmed": confirm}
    if confirm:
        created = live_import.create(scoped, course_id, checked["ready_records"], admin["email"]) if checked["ready_records"] else 0
        done = 0
        for row in result["rows"]:
            if row["status"] == "ready":
                row["status"] = "created"
                done += 1
        result["summary"] = {**checked["summary"], "created": created}
    return result


@router.patch("/api/admin/courses/{course_id}/live-classes/{live_id}")
def change_live(course_id: str, live_id: str, body: LiveClassIn, scoped: TenantRepo = Depends(get_tenant_repo)):
    def run():
        live_classes.edit(scoped, course_id, live_id, body.model_dump(exclude_unset=True))
        return live_classes.listing(scoped, course_id)
    return _guard(run)


@router.delete("/api/admin/courses/{course_id}/live-classes/{live_id}")
def remove_live(course_id: str, live_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    def run():
        live_classes.remove(scoped, course_id, live_id)
        return live_classes.listing(scoped, course_id)
    return _guard(run)
