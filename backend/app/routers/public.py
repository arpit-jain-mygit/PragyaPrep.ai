"""Pages and sign-ups anyone can use without signing in or naming an institute."""
from fastapi import APIRouter, Depends, HTTPException, Response

from app import glimpse, otp, signup
from app.config import Settings
from app.deps import get_client_ip, get_mailer, get_repo, get_settings
from app.limits import TooManyRequests
from app.mailer import Mailer
from app.repo import Repo
from app.schemas import MemberOut, SessionOut, SignupIn
from app.security import create_token
from app.tenants import ValidationError

router = APIRouter(tags=["public"])


@router.get("/api/public/glimpse")
def course_glimpse(response: Response, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings)):
    """The outline of the courses (names only) for the public home page."""
    response.headers["Cache-Control"] = "public, max-age=300"
    return {"courses": glimpse.outline(repo, settings.glimpse_tenant)}


def _too_many(error: TooManyRequests) -> HTTPException:
    return HTTPException(status_code=429, detail=error.message, headers={"Retry-After": str(error.retry_after)})


@router.post("/api/public/signup/code", status_code=202)
def signup_code(body: SignupIn, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), mailer: Mailer = Depends(get_mailer), ip: str = Depends(get_client_ip)):
    """Check the sign-up form and email a 6-digit code to the address."""
    try:
        signup.request_code(settings, repo, mailer, body.model_dump(), ip)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except signup.AlreadySignedUp as error:
        raise HTTPException(status_code=409, detail=error.message)
    except TooManyRequests as error:
        raise _too_many(error)
    except otp.EmailFailed as error:
        raise HTTPException(status_code=503, detail=error.message)
    return {"message": "We've emailed you a 6-digit code."}


@router.post("/api/public/signup", status_code=201, response_model=SessionOut)
def signup_verify(body: SignupIn, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), mailer: Mailer = Depends(get_mailer), ip: str = Depends(get_client_ip)):
    """Check the code, make the account and sign the person in."""
    try:
        tenant, member = signup.verify_and_create(settings, repo, mailer, body.model_dump(), body.code, ip)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except signup.AlreadySignedUp as error:
        raise HTTPException(status_code=409, detail=error.message)
    except TooManyRequests as error:
        raise _too_many(error)
    except otp.CodeRejected as error:
        raise HTTPException(status_code=400, detail=error.message)
    lifetime = settings.session_minutes * 60
    token = create_token(settings.secret_key, member["email"], "session", lifetime, tenant=tenant["slug"], role=member["role"])
    return SessionOut(access_token=token, expires_in=lifetime, tenant=tenant["slug"], member=MemberOut.model_validate(member))
