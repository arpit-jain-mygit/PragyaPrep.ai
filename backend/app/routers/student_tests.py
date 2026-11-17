"""A student's tests: see the ones for their courses, start or resume an attempt, save answers, submit, see the result."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app import attempts
from app.deps import STUDENT, get_storage, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.schemas import AnswersIn
from app.storage import ContentStorage
from app.tenants import ValidationError

router = APIRouter(tags=["student tests"])

NO_TEST = "We couldn't find that test."
NO_ATTEMPT = "We couldn't find that attempt."


@router.get("/api/my/tests")
def my_tests(scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    """Published tests for the courses this student can open now."""
    return attempts.list_tests(scoped, student)


@router.get("/api/my/tests/{test_id}")
def my_test(test_id: str, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    try:
        return attempts.test_card(scoped, student, attempts.visible_test(scoped, student, test_id))
    except attempts.TestNotAvailable:
        raise HTTPException(status_code=404, detail=NO_TEST)


@router.post("/api/my/tests/{test_id}/start", status_code=201)
def start_test(
    test_id: str,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    student: dict = Depends(require_roles(STUDENT)),
):
    """Begin an attempt, or carry on with the one already in progress."""
    try:
        attempt = attempts.start(scoped, student, test_id)
    except attempts.TestNotAvailable:
        raise HTTPException(status_code=404, detail=NO_TEST)
    except attempts.CannotStart as error:
        raise HTTPException(status_code=409, detail=error.message)
    return attempts.attempt_view(scoped, storage, attempt)


@router.get("/api/my/tests/{test_id}/attempts/{number}")
def get_attempt(
    test_id: str,
    number: int,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    student: dict = Depends(require_roles(STUDENT)),
):
    """An attempt in progress (questions and saved answers), or the result of a finished one."""
    try:
        return attempts.get_attempt(scoped, storage, student, test_id, number)
    except attempts.AttemptNotFound:
        raise HTTPException(status_code=404, detail=NO_ATTEMPT)


@router.put("/api/my/tests/{test_id}/attempts/{number}/answers")
def save_answers(
    test_id: str,
    number: int,
    body: AnswersIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    student: dict = Depends(require_roles(STUDENT)),
):
    """Save answers as the student goes. After the deadline the attempt is submitted for them, and the result comes back."""
    try:
        return attempts.save_answers(scoped, storage, student, test_id, number, body.answers)
    except attempts.AttemptNotFound:
        raise HTTPException(status_code=404, detail=NO_ATTEMPT)
    except attempts.TimeIsUp as done:
        return JSONResponse(status_code=409, content={"detail": "Time is up. Your test was submitted.", "finished": True, "result": done.result})
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.post("/api/my/tests/{test_id}/attempts/{number}/submit")
def submit_attempt(
    test_id: str,
    number: int,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    student: dict = Depends(require_roles(STUDENT)),
):
    """Finish the attempt and see the result."""
    try:
        return attempts.submit(scoped, storage, student, test_id, number)
    except attempts.AttemptNotFound:
        raise HTTPException(status_code=404, detail=NO_ATTEMPT)
