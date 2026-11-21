"""PI question bank: the admin's questions, and each student's list and done marks."""
from fastapi import APIRouter, Body, Depends, HTTPException, Response

from app import features, pi_bank
from app.deps import STUDENT, TENANT_ADMIN, get_tenant, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.tenants import ValidationError

router = APIRouter(tags=["pi-bank"])

NO_QUESTION = "We couldn't find that question."


@router.get("/api/admin/pi-questions", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def list_questions(scoped: TenantRepo = Depends(get_tenant_repo)):
    return scoped.list_pi_questions()


@router.post("/api/admin/pi-questions", status_code=201)
def add_question(body: dict = Body(...), scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        return pi_bank.add(scoped, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.delete("/api/admin/pi-questions/{question_id}", status_code=204)
def remove_question(question_id: str, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    pi_bank.remove(scoped, question_id)
    return Response(status_code=204)


def _on(tenant: dict) -> None:
    if not features.is_on(tenant, "pi_bank"):
        raise HTTPException(status_code=404, detail="That isn't available.")


@router.get("/api/my/pi-questions")
def my_questions(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    _on(tenant)
    return pi_bank.student_view(scoped, student)


@router.put("/api/my/pi-questions/{question_id}/done")
def mark_done(question_id: str, tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    _on(tenant)
    if not pi_bank.mark(scoped, student, question_id, True):
        raise HTTPException(status_code=404, detail=NO_QUESTION)
    return {"id": question_id, "done": True}


@router.delete("/api/my/pi-questions/{question_id}/done")
def mark_not_done(question_id: str, tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    _on(tenant)
    if not pi_bank.mark(scoped, student, question_id, False):
        raise HTTPException(status_code=404, detail=NO_QUESTION)
    return {"id": question_id, "done": False}
