"""The institute admin's My institute page: name, logo, colour, description, contact details, exam categories, and their own details."""
from fastapi import APIRouter, Depends, HTTPException

from app import avatars, institute_profile, logos
from app.config import Settings
from app.deps import TENANT_ADMIN, get_repo, get_settings, get_storage, get_tenant, require_roles
from app.repo import Repo, TenantRepo
from app.deps import get_tenant_repo
from app.schemas import LogoStartIn, PhotoDoneIn
from app.storage import ContentStorage
from app.tenants import ValidationError

router = APIRouter(prefix="/api/admin/institute", tags=["my institute"])


def _view(repo: Repo, storage: ContentStorage, slug: str, admin_email: str) -> dict:
    tenant = repo.get_tenant(slug)
    admin = repo.scoped(slug).get_member(admin_email)
    view = institute_profile.read(repo, tenant, admin)
    view["admin"]["avatar_url"] = avatars.url_for(storage, admin)
    return view


@router.get("")
def get_institute(tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), storage: ContentStorage = Depends(get_storage), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    return _view(repo, storage, tenant["slug"], admin["email"])


@router.put("")
def save_institute(body: dict, tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), storage: ContentStorage = Depends(get_storage), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        institute_profile.save(repo, tenant, admin, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return _view(repo, storage, tenant["slug"], admin["email"])


# ---- The logo ----

@router.post("/logo")
def start_logo(body: LogoStartIn, tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), storage: ContentStorage = Depends(get_storage), settings: Settings = Depends(get_settings), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        return {"upload": logos.start_upload(repo, storage, settings, tenant["slug"], body.filename, body.size)}
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.post("/logo/complete")
def finish_logo(tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), storage: ContentStorage = Depends(get_storage), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        logos.finish_upload(repo, storage, tenant["slug"])
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return _view(repo, storage, tenant["slug"], admin["email"])


@router.post("/logo/remove")
def remove_logo(tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), storage: ContentStorage = Depends(get_storage), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    logos.remove(repo, storage, tenant["slug"])
    return _view(repo, storage, tenant["slug"], admin["email"])


# ---- The admin's own photo ----

@router.post("/photo")
def start_photo(tenant: dict = Depends(get_tenant), settings: Settings = Depends(get_settings), storage: ContentStorage = Depends(get_storage), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    key, upload = avatars.issue_upload(storage, settings, tenant["slug"])
    return {"upload": upload, "key": key}


@router.post("/photo/complete")
def finish_photo(body: PhotoDoneIn, tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        avatars.set_photo(scoped, storage, admin["email"], str(body.key or ""))
    except avatars.PhotoNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find your account.")
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return _view(repo, storage, tenant["slug"], admin["email"])


@router.delete("/photo")
def remove_photo(tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo), scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        avatars.remove_photo(scoped, storage, admin["email"])
    except avatars.PhotoNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find your account.")
    return _view(repo, storage, tenant["slug"], admin["email"])
