"""Send a message, with an optional screenshot, to the platform admin."""
from fastapi import APIRouter, Depends, HTTPException

from app import support
from app.deps import get_current_member, get_mailer, get_repo, get_tenant
from app.mailer import Mailer
from app.repo import Repo
from app.schemas import SupportIn
from app.tenants import ValidationError

router = APIRouter(tags=["support"])


@router.post("/api/support", status_code=202)
def send_support(
    body: SupportIn,
    tenant: dict = Depends(get_tenant),
    member: dict = Depends(get_current_member),
    repo: Repo = Depends(get_repo),
    mailer: Mailer = Depends(get_mailer),
):
    """Email the platform admin. The reply goes to the sender's own address."""
    try:
        support.send(repo, mailer, tenant, member, body.model_dump())
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except support.NotSent:
        raise HTTPException(status_code=503, detail=support.NO_ADMIN)
    return {"sent": True}
