"""The free plan for a student or parent with no institute (the shared 'free' tenant)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app import attempts, free_plan
from app.config import Settings
from app.deps import PARENT, STUDENT, get_repo, get_settings, get_storage, get_tenant, get_tenant_repo, require_roles
from app.repo import Repo, TenantRepo
from app.schemas import AnswersIn
from app.signup import FREE_SLUG
from app.tenants import ValidationError
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


# ---- The one free test (the same shapes as a student's own tests, so the same pages work) ----

NO_TEST = "We couldn't find that test."
NO_ATTEMPT = "We couldn't find that attempt."


def free_student(member: dict = Depends(free_member)) -> dict:
    if member["role"] != STUDENT:
        raise HTTPException(status_code=403, detail="The free test is for students.")
    return member


def scope(test_id: str | None, repo: Repo, settings: Settings, own: TenantRepo, student: dict):
    found = free_plan.test_scope(repo, settings, own, student)
    if found is None or (test_id is not None and found.get_test(test_id) is None):
        raise HTTPException(status_code=404, detail=NO_TEST)
    return found


@router.get("/test")
def free_test(repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), own: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(free_student)):
    """The picked course's free test (how it stands for this student), or none."""
    found = free_plan.test_scope(repo, settings, own, student)
    if found is None:
        return {"test": None}
    return {"test": attempts.test_card(found, student, found._test)}


@router.get("/tests/{test_id}")
def free_test_card(test_id: str, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), own: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(free_student)):
    found = scope(test_id, repo, settings, own, student)
    return attempts.test_card(found, student, found.get_test(test_id))


@router.post("/tests/{test_id}/start", status_code=201)
def free_start(test_id: str, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), own: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage), student: dict = Depends(free_student)):
    found = scope(test_id, repo, settings, own, student)
    try:
        attempt = attempts.start(found, student, test_id)
    except attempts.TestNotAvailable:
        raise HTTPException(status_code=404, detail=NO_TEST)
    except attempts.CannotStart as error:
        raise HTTPException(status_code=409, detail=error.message)
    return attempts.attempt_view(found, storage, attempt)


@router.get("/tests/{test_id}/attempts/{number}")
def free_attempt(test_id: str, number: int, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), own: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage), student: dict = Depends(free_student)):
    found = scope(test_id, repo, settings, own, student)
    try:
        return attempts.get_attempt(found, storage, student, test_id, number)
    except attempts.AttemptNotFound:
        raise HTTPException(status_code=404, detail=NO_ATTEMPT)


@router.put("/tests/{test_id}/attempts/{number}/answers")
def free_answers(test_id: str, number: int, body: AnswersIn, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), own: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage), student: dict = Depends(free_student)):
    found = scope(test_id, repo, settings, own, student)
    try:
        return attempts.save_answers(found, storage, student, test_id, number, body.answers)
    except attempts.AttemptNotFound:
        raise HTTPException(status_code=404, detail=NO_ATTEMPT)
    except attempts.TimeIsUp as done:
        return JSONResponse(status_code=409, content={"detail": "Time is up. Your test was submitted.", "finished": True, "result": done.result})
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.post("/tests/{test_id}/attempts/{number}/submit")
def free_submit(test_id: str, number: int, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings), own: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage), student: dict = Depends(free_student)):
    found = scope(test_id, repo, settings, own, student)
    try:
        return attempts.submit(found, storage, student, test_id, number)
    except attempts.AttemptNotFound:
        raise HTTPException(status_code=404, detail=NO_ATTEMPT)
