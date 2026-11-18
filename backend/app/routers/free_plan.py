"""The free plan for a student or parent with no institute (the shared 'free' tenant)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import free_plan
from app.config import Settings
from app.deps import PARENT, STUDENT, get_repo, get_settings, get_storage, get_tenant, get_tenant_repo, require_roles
from app.repo import Repo, TenantRepo
from app.signup import FREE_SLUG
from app.storage import ContentStorage

router = APIRouter(prefix="/api/free", tags=["free plan"])


def free_member(tenant: dict = Depends(get_tenant), member: dict = Depends(require_roles(STUDENT, PARENT))) -> dict:
    if tenant["slug"] != FREE_SLUG:
        raise HTTPException(status_code=404, detail="This is only for the free plan.")
    return member


class PickIn(BaseModel):
    course: str


@router.get("/courses")
def courses(repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), member: dict = Depends(free_member)):
    return free_plan.state(repo, settings, member)


@router.put("/pick")
def pick(body: PickIn, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), scoped: TenantRepo = Depends(get_tenant_repo), member: dict = Depends(free_member)):
    try:
        return free_plan.pick(repo, settings, scoped, member, body.course)
    except free_plan.CourseNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that course.")
    except free_plan.AlreadyPicked:
        raise HTTPException(status_code=409, detail="You have already picked your free course. Contact us to change it.")


@router.get("/sample")
def sample(repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), member: dict = Depends(free_member)):
    return {"sample": free_plan.sample(repo, settings, member)}


@router.get("/files/{file_id}/link")
def file_link(file_id: str, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), storage: ContentStorage = Depends(get_storage), member: dict = Depends(free_member)):
    """A link to one file of the free sub-topic that works for a few minutes. Any other file is 'not found'."""
    try:
        return free_plan.file_link(repo, storage, settings, member, file_id)
    except free_plan.FileNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that file.")
