"""Login routes. The only way to sign in is an emailed 6-digit code, for an email an admin has approved."""
from fastapi import APIRouter, Depends, HTTPException

from app import otp
from app.config import Settings
from app.deps import get_client_ip, get_current_member, get_mailer, get_repo, get_settings, get_tenant
from app.mailer import Mailer
from app.repo import Repo
from app.schemas import MemberOut, RequestCodeIn, RequestCodeOut, SessionOut, VerifyCodeIn
from app.security import create_token
from app.tenants import ValidationError, normalize_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _clean_email(raw: str) -> str:
    try:
        return normalize_email(raw)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.post("/request-code", response_model=RequestCodeOut)
def request_code(
    body: RequestCodeIn,
    tenant: dict = Depends(get_tenant),
    repo: Repo = Depends(get_repo),
    settings: Settings = Depends(get_settings),
    mailer: Mailer = Depends(get_mailer),
    ip: str = Depends(get_client_ip),
):
    """Ask for a login code. The answer says straight away whether the email is registered, pending, rejected,
    paused, or approved (and a code was sent)."""
    email = _clean_email(body.email)
    try:
        status, message = otp.request_code(settings, repo, tenant, email, ip, mailer)
    except otp.TooManyRequests as error:
        raise HTTPException(status_code=429, detail=error.message, headers={"Retry-After": str(error.retry_after)})
    except otp.EmailFailed as error:
        raise HTTPException(status_code=503, detail=error.message)
    return RequestCodeOut(status=status, message=message)


@router.post("/verify-code", response_model=SessionOut)
def verify_code(
    body: VerifyCodeIn,
    tenant: dict = Depends(get_tenant),
    repo: Repo = Depends(get_repo),
    settings: Settings = Depends(get_settings),
    ip: str = Depends(get_client_ip),
):
    """Check the code. If it is right, the person is signed in for this institute."""
    email = _clean_email(body.email)
    try:
        member = otp.verify_code(settings, repo, tenant, email, body.code, ip)
    except otp.TooManyRequests as error:
        raise HTTPException(status_code=429, detail=error.message, headers={"Retry-After": str(error.retry_after)})
    except otp.CodeRejected as error:
        raise HTTPException(status_code=400, detail=error.message)
    except otp.NotApproved as error:
        raise HTTPException(status_code=403, detail=error.message)

    lifetime = settings.session_minutes * 60
    token = create_token(
        settings.secret_key, member["email"], "session", lifetime, tenant=tenant["slug"], role=member["role"]
    )
    return SessionOut(
        access_token=token,
        expires_in=lifetime,
        tenant=tenant["slug"],
        member=MemberOut.model_validate(member),
    )


@router.get("/me", response_model=MemberOut)
def me(member: dict = Depends(get_current_member)):
    """Who is signed in right now."""
    return member
