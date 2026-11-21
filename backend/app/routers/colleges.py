"""Colleges for the Tools screens: the admin's college data, and the student's eligibility and cutoff views."""
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response

from app import colleges, features
from app.deps import STUDENT, TENANT_ADMIN, get_tenant, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.tenants import ValidationError

router = APIRouter(tags=["colleges"])

NO_COLLEGE = "We couldn't find that college."
NO_CUTOFF = "We couldn't find that cutoff."


def _refuse_if_off(tenant: dict, *keys: str) -> None:
    if not any(features.is_on(tenant, key) for key in keys):
        raise HTTPException(status_code=404, detail="That isn't available.")


# ---- Admin ----

@router.get("/api/admin/colleges", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def admin_colleges(scoped: TenantRepo = Depends(get_tenant_repo)):
    return colleges.admin_list(scoped)


@router.post("/api/admin/colleges", status_code=201)
def add_college(body: dict = Body(...), scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        return colleges.add_college(scoped, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.put("/api/admin/colleges/{college_id}", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def change_college(college_id: str, body: dict = Body(...), scoped: TenantRepo = Depends(get_tenant_repo)):
    try:
        record = colleges.change_college(scoped, college_id, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    if record is None:
        raise HTTPException(status_code=404, detail=NO_COLLEGE)
    return record


@router.delete("/api/admin/colleges/{college_id}", status_code=204, dependencies=[Depends(require_roles(TENANT_ADMIN))])
def remove_college(college_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    if not colleges.remove_college(scoped, college_id):
        raise HTTPException(status_code=404, detail=NO_COLLEGE)
    return Response(status_code=204)


@router.put("/api/admin/colleges/{college_id}/cutoffs", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def save_cutoff(college_id: str, body: dict = Body(...), scoped: TenantRepo = Depends(get_tenant_repo)):
    try:
        row = colleges.add_cutoff(scoped, college_id, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    if row is None:
        raise HTTPException(status_code=404, detail=NO_COLLEGE)
    return row


@router.delete("/api/admin/colleges/{college_id}/cutoffs/{row_id}", status_code=204, dependencies=[Depends(require_roles(TENANT_ADMIN))])
def remove_cutoff(college_id: str, row_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    if not colleges.remove_cutoff(scoped, college_id, row_id):
        raise HTTPException(status_code=404, detail=NO_CUTOFF)
    return Response(status_code=204)


@router.get("/api/admin/colleges/{college_id}/cutoffs", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def admin_cutoffs(college_id: str, year: int | None = Query(None), scoped: TenantRepo = Depends(get_tenant_repo)):
    view = colleges.for_cutoffs(scoped, college_id, year)
    if view is None:
        raise HTTPException(status_code=404, detail=NO_COLLEGE)
    return view


# ---- Student ----

@router.get("/api/my/colleges")
def my_colleges(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    """The college names and the years with cutoffs, for the pickers on the Cutoffs screen."""
    _refuse_if_off(tenant, "cutoffs")
    return colleges.college_names(scoped)


@router.get("/api/my/eligibility")
def my_eligibility(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    _refuse_if_off(tenant, "eligibility")
    return colleges.for_eligibility(scoped)


@router.get("/api/my/cutoffs")
def my_cutoffs(
    college: str = Query(...),
    year: int | None = Query(None),
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    student: dict = Depends(require_roles(STUDENT)),
):
    _refuse_if_off(tenant, "cutoffs")
    view = colleges.for_cutoffs(scoped, college, year)
    if view is None:
        raise HTTPException(status_code=404, detail=NO_COLLEGE)
    return view
