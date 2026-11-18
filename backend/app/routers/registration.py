"""Registration. Anyone can register with an institute. Its admin reviews the registrations."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app import avatars, plan_limits, registrations
from app.config import Settings
from app.deps import (
    TENANT_ADMIN,
    get_client_ip,
    get_mailer,
    get_repo,
    get_settings,
    get_storage,
    get_tenant,
    get_tenant_repo,
    require_roles,
)
from app.limits import TooManyRequests
from app.mailer import Mailer
from app.repo import Repo, TenantRepo
from app.schemas import DecisionIn, DecisionOut, PhotoDoneIn, RegistrationEditIn, RegistrationIn, RegistrationOut, RegistrationReceivedOut
from app.storage import ContentStorage
from app.tenants import ValidationError

router = APIRouter(tags=["registration"])


@router.post("/api/register", status_code=201, response_model=RegistrationReceivedOut, response_model_exclude_none=True)
def register(
    body: RegistrationIn,
    tenant: dict = Depends(get_tenant),
    repo: Repo = Depends(get_repo),
    settings: Settings = Depends(get_settings),
    mailer: Mailer = Depends(get_mailer),
    storage: ContentStorage = Depends(get_storage),
    ip: str = Depends(get_client_ip),
):
    """Submit the registration form. It starts as 'pending' until the institute's admin approves it."""
    try:
        record = registrations.register(settings, repo, tenant, body.model_dump(), ip, mailer)
    except registrations.FormErrors as error:
        return JSONResponse(
            status_code=422, content={"detail": "Please correct the marked fields.", "errors": error.errors}
        )
    except registrations.AlreadyRegistered as error:
        raise HTTPException(status_code=409, detail=error.message)
    except TooManyRequests as error:
        raise HTTPException(status_code=429, detail=error.message, headers={"Retry-After": str(error.retry_after)})
    permission = avatars.registration_permission(storage, settings, tenant["slug"], record["email"]) if body.photo else None
    return RegistrationReceivedOut(
        status="pending",
        message="Thank you. Your registration is waiting for approval. We'll email you once it's approved.",
        photo_upload=permission["upload"] if permission else None,
        photo_token=permission["token"] if permission else None,
    )


@router.post("/api/register/photo")
def finish_registration_photo(
    body: PhotoDoneIn,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    settings: Settings = Depends(get_settings),
    storage: ContentStorage = Depends(get_storage),
):
    """The student has sent their photo. The token from the registration proves it is theirs; the photo is then attached to them."""
    email = str(body.email or "").strip().lower()
    try:
        key = avatars.key_from_token(settings, tenant["slug"], email, body.token)
        avatars.set_photo(scoped, storage, email, key)
    except avatars.PhotoNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that registration.")
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"ok": True}


@router.get("/api/admin/registrations", response_model=list[RegistrationOut])
def review_queue(
    status: str = Query("pending", description="pending, approved, rejected, suspended or all"),
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """The registrations waiting for a decision (or any other status), newest first."""
    try:
        return [avatars.with_url(storage, person) for person in registrations.list_registrations(scoped, status)]
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


def _decision(action: str, email: str, body: DecisionIn | None, tenant, scoped, mailer, admin, storage) -> DecisionOut:
    try:
        if action in ("approve", "reactivate"):
            plan_limits.check(scoped, tenant, "student")
        person, email_sent = registrations.decide(
            scoped, tenant, mailer, action, email, admin["email"], (body.reason if body else "") or ""
        )
    except plan_limits.PlanLimit as error:
        raise HTTPException(status_code=403, detail=error.message)
    except registrations.RegistrationNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that registration.")
    except registrations.InvalidTransition as error:
        raise HTTPException(status_code=409, detail=error.message)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return DecisionOut(registration=RegistrationOut.model_validate(avatars.with_url(storage, person)), email_sent=email_sent)


@router.post("/api/admin/registrations/{email}/approve", response_model=DecisionOut)
def approve(
    email: str,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    mailer: Mailer = Depends(get_mailer),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Approve a pending (or rejected) registration. The student can then log in, and gets an email."""
    return _decision("approve", email, None, tenant, scoped, mailer, admin, storage)


@router.post("/api/admin/registrations/{email}/reject", response_model=DecisionOut)
def reject(
    email: str,
    body: DecisionIn | None = None,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    mailer: Mailer = Depends(get_mailer),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Reject a pending registration, with an optional reason that goes in the email. The student may register again."""
    return _decision("reject", email, body, tenant, scoped, mailer, admin, storage)


@router.post("/api/admin/registrations/{email}/suspend", response_model=DecisionOut)
def suspend(
    email: str,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    mailer: Mailer = Depends(get_mailer),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Pause an approved student. They can't log in, and their session ends."""
    return _decision("suspend", email, None, tenant, scoped, mailer, admin, storage)


@router.post("/api/admin/registrations/{email}/reactivate", response_model=DecisionOut)
def reactivate(
    email: str,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    mailer: Mailer = Depends(get_mailer),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Let a suspended student back in."""
    return _decision("reactivate", email, None, tenant, scoped, mailer, admin, storage)


@router.patch("/api/admin/registrations/{email}", response_model=DecisionOut)
def edit_registration(
    email: str,
    body: RegistrationEditIn,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    mailer: Mailer = Depends(get_mailer),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Correct a student's details, including their email, at any status. Send only what changed."""
    try:
        person, email_sent = registrations.edit(
            scoped, tenant, mailer, email, body.model_dump(exclude_unset=True), admin["email"]
        )
    except registrations.RegistrationNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that registration.")
    except registrations.FormErrors as error:
        return JSONResponse(
            status_code=422, content={"detail": "Please correct the marked fields.", "errors": error.errors}
        )
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return DecisionOut(registration=RegistrationOut.model_validate(avatars.with_url(storage, person)), email_sent=email_sent)


# ---- A student's photo, set by the admin ----

@router.post("/api/admin/registrations/{email}/photo")
def start_student_photo(
    email: str,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    settings: Settings = Depends(get_settings),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """A signed form to post a student's photo to, and the key to finish it with."""
    person = scoped.get_member(email.strip().lower())
    if person is None or person.get("role") != "student":
        raise HTTPException(status_code=404, detail="We couldn't find that registration.")
    key, upload = avatars.issue_upload(storage, settings, tenant["slug"])
    return {"upload": upload, "key": key}


@router.post("/api/admin/registrations/{email}/photo/complete", response_model=RegistrationOut)
def finish_student_photo(
    email: str,
    body: PhotoDoneIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    try:
        person = avatars.set_photo(scoped, storage, email.strip().lower(), str(body.key or ""))
    except avatars.PhotoNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that registration.")
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return RegistrationOut.model_validate(avatars.with_url(storage, person))


@router.delete("/api/admin/registrations/{email}/photo", response_model=RegistrationOut)
def remove_student_photo(
    email: str,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    try:
        avatars.remove_photo(scoped, storage, email.strip().lower())
    except avatars.PhotoNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that registration.")
    return RegistrationOut.model_validate(avatars.with_url(storage, scoped.get_member(email.strip().lower())))
