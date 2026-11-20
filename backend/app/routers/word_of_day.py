"""Word of the day: the admin's word list, and today's word for each student."""
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response

from app import word_of_day
from app.deps import STUDENT, TENANT_ADMIN, get_tenant, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.tenants import ValidationError

router = APIRouter(tags=["word-of-day"])


@router.get("/api/admin/words", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def list_words(kind: str = Query("word", description="word or idiom"), scoped: TenantRepo = Depends(get_tenant_repo)):
    if kind not in word_of_day.KINDS:
        raise HTTPException(status_code=422, detail="Choose a word or an idiom.")
    return word_of_day.all_words(scoped, kind)


@router.post("/api/admin/words", status_code=201)
def add_word(body: dict = Body(...), scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    try:
        return word_of_day.add(scoped, body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.delete("/api/admin/words/{word_id}", status_code=204)
def remove_word(word_id: str, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))):
    word_of_day.remove(scoped, word_id)
    return Response(status_code=204)


@router.get("/api/my/word-of-day")
def todays_word(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return word_of_day.for_student(scoped, tenant)
