"""Question bank. Only an institute's admin can see or change its questions."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app import questions
from app.deps import TENANT_ADMIN, get_tenant_repo, require_roles
from app.papers import PAPERS
from app.repo import TenantRepo
from app.schemas import PaperOut, QuestionIn, QuestionOut

router = APIRouter(tags=["questions"])


def _errors(error: questions.QuestionErrors):
    return JSONResponse(status_code=422, content={"detail": "Please correct the marked fields.", "errors": error.errors})


@router.get("/api/admin/papers", response_model=list[PaperOut], dependencies=[Depends(require_roles(TENANT_ADMIN))])
def papers():
    """The papers and topics a question can belong to. The same for every institute."""
    return PAPERS


@router.get(
    "/api/admin/questions", response_model=list[QuestionOut], dependencies=[Depends(require_roles(TENANT_ADMIN))]
)
def list_questions(
    paper: str | None = Query(None),
    topic: str | None = Query(None),
    status: str | None = Query(None),
    difficulty: str | None = Query(None),
    scoped: TenantRepo = Depends(get_tenant_repo),
):
    return questions.list_questions(scoped, paper, topic, status, difficulty)


@router.post("/api/admin/questions", status_code=201)
def add_question(
    body: QuestionIn, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))
):
    try:
        question = questions.create_question(scoped, body.model_dump(), admin["email"])
    except questions.QuestionErrors as error:
        return _errors(error)
    return QuestionOut.model_validate(question)


@router.patch("/api/admin/questions/{question_id}")
def change_question(
    question_id: str,
    body: QuestionIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Change a question. Send only what changed (options go as a whole list)."""
    try:
        question = questions.update_question(
            scoped, question_id, body.model_dump(exclude_unset=True), admin["email"]
        )
    except questions.QuestionNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that question.")
    except questions.QuestionErrors as error:
        return _errors(error)
    return QuestionOut.model_validate(question)


@router.delete("/api/admin/questions/{question_id}", status_code=204, dependencies=[Depends(require_roles(TENANT_ADMIN))])
def remove_question(question_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    try:
        questions.delete_question(scoped, question_id)
    except questions.QuestionNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that question.")
