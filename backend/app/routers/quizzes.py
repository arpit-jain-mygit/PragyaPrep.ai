"""Tests built from the question bank. Only an institute's admin can see or change them."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app import attempts, questions, quizzes
from app.deps import TENANT_ADMIN, get_storage, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.routers.questions import _errors, _present, _texts
from app.schemas import AutoPickIn, QuestionOut, TestIn
from app.storage import ContentStorage
from app.tenants import ValidationError

router = APIRouter(tags=["tests"], dependencies=[Depends(require_roles(TENANT_ADMIN))])


def _detail(scoped: TenantRepo, storage: ContentStorage, test: dict) -> dict:
    """A test with its questions in order, each as the admin sees a question."""
    bank = {item["id"]: item for item in scoped.list_questions()}
    texts = _texts(scoped)
    listed = [
        QuestionOut.model_validate(_present(bank[question_id], storage, texts)).model_dump()
        for question_id in test.get("question_ids", [])
        if question_id in bank
    ]
    return {**quizzes.summary(test), "questions": listed}


@router.get("/api/admin/tests")
def list_tests(scoped: TenantRepo = Depends(get_tenant_repo)):
    return quizzes.list_tests(scoped)


@router.post("/api/admin/tests", status_code=201)
def add_test(
    body: TestIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    try:
        test = quizzes.create_test(scoped, body.model_dump(), admin["email"])
    except questions.QuestionErrors as error:
        return _errors(error)
    return _detail(scoped, storage, test)


@router.post("/api/admin/tests/auto-pick")
def auto_pick(body: AutoPickIn, scoped: TenantRepo = Depends(get_tenant_repo)):
    """Pick random published questions for the rules. Nothing is saved: the page shows the pick, and saving the test keeps it."""
    try:
        return quizzes.auto_pick(scoped, body.rules, body.exclude)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.get("/api/admin/tests/{test_id}")
def get_test(test_id: str, scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)):
    test = scoped.get_test(test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="We couldn't find that test.")
    return _detail(scoped, storage, test)


@router.patch("/api/admin/tests/{test_id}")
def change_test(
    test_id: str,
    body: TestIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    try:
        test = quizzes.update_test(scoped, test_id, body.model_dump(exclude_unset=True), admin["email"])
    except quizzes.TestNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that test.")
    except questions.QuestionErrors as error:
        return _errors(error)
    return _detail(scoped, storage, test)


@router.get("/api/admin/tests/{test_id}/results")
def test_results(
    test_id: str,
    response: Response,
    limit: int | None = Query(None, ge=1, le=200, description="How many attempts to return. Leave out for all of them."),
    before: str | None = Query(None, description="The cursor from the X-Next-Cursor header of the last page."),
    scoped: TenantRepo = Depends(get_tenant_repo),
):
    """How students did at a test: a summary, the attempts, and how each question went.

    Pages of attempts: pass limit, then the X-Next-Cursor header as `before` for the next page. The summary is the same on every page."""
    try:
        offset = max(0, int(before)) if before else 0
    except ValueError:
        raise HTTPException(status_code=422, detail="The page cursor is not valid.")
    try:
        payload, next_offset = attempts.admin_results(scoped, test_id, limit, offset)
    except attempts.TestNotAvailable:
        raise HTTPException(status_code=404, detail="We couldn't find that test.")
    response.headers["X-Next-Cursor"] = str(next_offset) if next_offset is not None else ""
    return payload


@router.get("/api/admin/tests/{test_id}/results/{email}/{number}")
def student_attempt(
    test_id: str,
    email: str,
    number: int,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
):
    """One student's attempt with every question, the right answers and the reasons."""
    try:
        return attempts.admin_attempt(scoped, storage, test_id, email.strip().lower(), number)
    except attempts.AttemptNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that attempt.")


@router.delete("/api/admin/tests/{test_id}", status_code=204)
def remove_test(test_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    try:
        quizzes.delete_test(scoped, test_id)
    except quizzes.TestNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that test.")
    except ValidationError as error:
        raise HTTPException(status_code=409, detail=str(error))
