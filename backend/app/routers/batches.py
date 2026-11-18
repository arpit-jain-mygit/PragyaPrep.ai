"""Batches: the admin creates them and enrols students; a student sees their own batches."""
from fastapi import APIRouter, Depends, HTTPException

from app import batches
from app.deps import STUDENT, TENANT_ADMIN, get_storage, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.storage import ContentStorage
from app.tenants import ValidationError

router = APIRouter(tags=["batches"])
NO_BATCH = "We couldn't find that batch."


def _guard(run):
    try:
        return run()
    except batches.BatchNotFound:
        raise HTTPException(status_code=404, detail=NO_BATCH)
    except batches.BatchFull as error:
        raise HTTPException(status_code=409, detail=error.message)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.get("/api/admin/batches")
def list_batches(scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    return batches.list_all(scoped)


@router.post("/api/admin/batches", status_code=201)
def create_batch(body: dict, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    return _guard(lambda: batches.create(scoped, body, admin["email"]))


@router.get("/api/admin/batches/{batch_id}")
def get_batch(batch_id: str, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    return _guard(lambda: batches.detail(scoped, batch_id))


@router.patch("/api/admin/batches/{batch_id}")
def change_batch(batch_id: str, body: dict, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    return _guard(lambda: batches.update(scoped, batch_id, body, admin["email"]))


@router.post("/api/admin/batches/{batch_id}/students")
def enrol_students(batch_id: str, body: dict, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    return _guard(lambda: batches.enrol(scoped, batch_id, body.get("emails"), admin["email"]))


@router.delete("/api/admin/batches/{batch_id}/students/{email}")
def remove_student(batch_id: str, email: str, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    return _guard(lambda: batches.remove(scoped, batch_id, email))


@router.get("/api/my/batches")
def my_batches(scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return batches.for_student(scoped, student["email"])


@router.get("/api/admin/students/{email}/quick")
def quick_view(email: str, scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    """A student at a glance, for the side drawer: details, courses open, batches, parents."""
    try:
        return batches.quick_view(scoped, storage, email)
    except batches.BatchNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that student.")
