"""A student's or parent's own profile: read it, change it, set a photo, download their data, ask for deletion."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app import avatars, profiles
from app.config import Settings
from app.deps import get_current_member, get_mailer, get_settings, get_storage, get_tenant, get_tenant_repo
from app.mailer import Mailer
from app.repo import TenantRepo
from app.schemas import PhotoDoneIn
from app.storage import ContentStorage
from app.tenants import ValidationError

router = APIRouter(prefix="/api/me", tags=["profile"])


def _person(member: dict = Depends(get_current_member)) -> dict:
    if member.get("role") not in (profiles.STUDENT, profiles.PARENT):
        raise HTTPException(status_code=403, detail="Only students and parents have a profile.")
    return member


def _with_photo(storage: ContentStorage, scoped: TenantRepo, member: dict) -> dict:
    return {**profiles.read(scoped, member), "avatar_url": avatars.url_for(storage, member)}


@router.get("/profile")
def get_profile(member: dict = Depends(_person), scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)):
    return _with_photo(storage, scoped, member)


@router.put("/profile")
def save_profile(body: dict, member: dict = Depends(_person), scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)):
    try:
        profiles.save(scoped, member, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return _with_photo(storage, scoped, scoped.get_member(member["email"]))


@router.post("/photo")
def start_photo(tenant: dict = Depends(get_tenant), settings: Settings = Depends(get_settings), storage: ContentStorage = Depends(get_storage), member: dict = Depends(_person)):
    """A signed form to post the photo to, and the key to finish it with."""
    key, upload = avatars.issue_upload(storage, settings, tenant["slug"])
    return {"upload": upload, "key": key}


@router.post("/photo/complete")
def finish_photo(body: PhotoDoneIn, member: dict = Depends(_person), scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)):
    try:
        saved = avatars.set_photo(scoped, storage, member["email"], str(body.key or ""))
    except avatars.PhotoNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find your account.")
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return _with_photo(storage, scoped, saved)


@router.delete("/photo")
def remove_photo(member: dict = Depends(_person), scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)):
    try:
        avatars.remove_photo(scoped, storage, member["email"])
    except avatars.PhotoNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find your account.")
    return _with_photo(storage, scoped, scoped.get_member(member["email"]))


@router.get("/export")
def export_data(member: dict = Depends(_person), scoped: TenantRepo = Depends(get_tenant_repo)):
    """Everything stored about the person, as a file they can save."""
    return JSONResponse(profiles.export(scoped, member), headers={"Content-Disposition": 'attachment; filename="my-pragyaprep-data.json"'})


@router.post("/delete-request", status_code=202)
def delete_request(member: dict = Depends(_person), tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), mailer: Mailer = Depends(get_mailer)):
    """Ask for the account and data to be deleted. The institute's admin is told and decides; nothing is deleted here."""
    try:
        profiles.request_deletion(scoped, mailer, tenant, member)
    except ValidationError as error:
        raise HTTPException(status_code=409, detail=str(error))
    return {"message": "We've told the institute. They will contact you."}


@router.delete("/delete-request")
def cancel_delete_request(member: dict = Depends(_person), scoped: TenantRepo = Depends(get_tenant_repo)):
    profiles.cancel_deletion(scoped, member)
    return {"message": "Your deletion request is cancelled."}
