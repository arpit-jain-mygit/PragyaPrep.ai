"""Vocabulary and Idioms for students: today's pack, its calendar, and today's test."""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException

from app import clock, features, vocab
from app.deps import STUDENT, get_tenant, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.tenants import ValidationError

router = APIRouter(tags=["vocabulary"])


def _feature(kind: str, tenant: dict) -> str:
    """The feature for a kind of list, or 404 when the institute has it switched off."""
    if kind not in vocab.KIND_OF_FEATURE or not features.is_on(tenant, kind):
        raise HTTPException(status_code=404, detail="That isn't available.")
    return kind


def _today() -> date:
    return clock.today_india()


@router.get("/api/my/vocab/{kind}")
def my_pack(kind: str, tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return vocab.view(scoped, _feature(kind, tenant), _today())


@router.post("/api/my/vocab/{kind}/test")
def my_test(kind: str, tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    feature = _feature(kind, tenant)
    try:
        return {"questions": vocab.public_questions(vocab.questions(scoped, feature, _today()))}
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.post("/api/my/vocab/{kind}/test/answers")
def my_marks(kind: str, body: dict = Body(...), tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    feature = _feature(kind, tenant)
    try:
        return vocab.mark(scoped, feature, _today(), body.get("answers"))
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
