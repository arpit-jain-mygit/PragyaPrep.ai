"""A student makes a practice test on one of their weak topics."""
from fastapi import APIRouter, Depends, HTTPException

from app import practice
from app.deps import STUDENT, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.schemas import PracticeIn
from app.tenants import ValidationError

router = APIRouter(tags=["practice"])

NOT_ENROLLED = "Practice tests open once you are enrolled in a course."


@router.post("/api/my/practice", status_code=201)
def make_practice(body: PracticeIn, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    try:
        test = practice.create(scoped, student, body.model_dump(), student["email"])
    except practice.NotEnrolled:
        raise HTTPException(status_code=403, detail=NOT_ENROLLED)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"id": test["id"], "title": test["title"], "question_count": len(test["question_ids"])}
