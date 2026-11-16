"""Registration. Anyone can register with an institute. Its admin reviews the registrations."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app import registrations
from app.config import Settings
from app.deps import (
    TENANT_ADMIN,
    get_client_ip,
    get_mailer,
    get_repo,
    get_settings,
    get_tenant,
    get_tenant_repo,
    require_roles,
)
from app.limits import TooManyRequests
from app.mailer import Mailer
from app.repo import Repo, TenantRepo
from app.schemas import DecisionIn, DecisionOut, RegistrationIn, RegistrationOut, RegistrationReceivedOut
from app.tenants import ValidationError

router = APIRouter(tags=["registration"])


@router.post("/api/register", status_code=201, response_model=RegistrationReceivedOut)
def register(
    body: RegistrationIn,
    tenant: dict = Depends(get_tenant),
    repo: Repo = Depends(get_repo),
    settings: Settings = Depends(get_settings),
    mailer: Mailer = Depends(get_mailer),
    ip: str = Depends(get_client_ip),
):
    """Submit the registration form. It starts as 'pending' until the institute's admin approves it."""
    try:
        registrations.register(settings, repo, tenant, body.model_dump(), ip, mailer)
    except registrations.FormErrors as error:
        return JSONResponse(
            status_code=422, content={"detail": "Please correct the marked fields.", "errors": error.errors}
        )
    except registrations.AlreadyRegistered as error:
        raise HTTPException(status_code=409, detail=error.message)
    except TooManyRequests as error:
        raise HTTPException(status_code=429, detail=error.message, headers={"Retry-After": str(error.retry_after)})
    return RegistrationReceivedOut(
        status="pending",
        message="Thank you. Your registration is waiting for approval. We'll email you once it's approved.",
    )


@router.get("/api/admin/registrations", response_model=list[RegistrationOut])
def review_queue(
    status: str = Query("pending", description="pending, approved, rejected, suspended or all"),
    scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """The registrations waiting for a decision (or any other status), newest first."""
    try:
        return registrations.list_registrations(scoped, status)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


def _decision(action: str, email: str, body: DecisionIn | None, tenant, scoped, mailer, admin) -> DecisionOut:
    try:
        person, email_sent = registrations.decide(
            scoped, tenant, mailer, action, email, admin["email"], (body.reason if body else "") or ""
        )
    except registrations.RegistrationNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that registration.")
    except registrations.InvalidTransition as error:
        raise HTTPException(status_code=409, detail=error.message)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return DecisionOut(registration=RegistrationOut.model_validate(person), email_sent=email_sent)


@router.post("/api/admin/registrations/{email}/approve", response_model=DecisionOut)
def approve(
    email: str,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    mailer: Mailer = Depends(get_mailer),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Approve a pending (or rejected) registration. The student can then log in, and gets an email."""
    return _decision("approve", email, None, tenant, scoped, mailer, admin)


@router.post("/api/admin/registrations/{email}/reject", response_model=DecisionOut)
def reject(
    email: str,
    body: DecisionIn | None = None,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    mailer: Mailer = Depends(get_mailer),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Reject a pending registration, with an optional reason that goes in the email. The student may register again."""
    return _decision("reject", email, body, tenant, scoped, mailer, admin)


@router.post("/api/admin/registrations/{email}/suspend", response_model=DecisionOut)
def suspend(
    email: str,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    mailer: Mailer = Depends(get_mailer),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Pause an approved student. They can't log in, and their session ends."""
    return _decision("suspend", email, None, tenant, scoped, mailer, admin)


@router.post("/api/admin/registrations/{email}/reactivate", response_model=DecisionOut)
def reactivate(
    email: str,
    tenant: dict = Depends(get_tenant),
    scoped: TenantRepo = Depends(get_tenant_repo),
    mailer: Mailer = Depends(get_mailer),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Let a suspended student back in."""
    return _decision("reactivate", email, None, tenant, scoped, mailer, admin)
