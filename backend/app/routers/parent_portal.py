"""A parent's view of their children, and setting them practice tests."""
from fastapi import APIRouter, Depends, HTTPException

from app import parent_view, parents, practice
from app.deps import PARENT, get_storage, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.schemas import PracticeIn
from app.storage import ContentStorage
from app.tenants import ValidationError

router = APIRouter(tags=["parent"])

NO_CHILD = "We couldn't find that student."


@router.get("/api/parent/children")
def my_children(scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage), parent: dict = Depends(require_roles(PARENT))):
    return parent_view.children(scoped, parent, storage)


@router.get("/api/parent/children/{email}")
def child(email: str, scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage), parent: dict = Depends(require_roles(PARENT))):
    try:
        return parent_view.detail(scoped, parent, email, storage)
    except parents.ParentNotFound:
        raise HTTPException(status_code=404, detail=NO_CHILD)


@router.post("/api/parent/children/{email}/practice", status_code=201)
def set_practice(email: str, body: PracticeIn, scoped: TenantRepo = Depends(get_tenant_repo), parent: dict = Depends(require_roles(PARENT))):
    """Make a practice test for the child on one topic. The child finds it in their Tests."""
    try:
        kid = parent_view.child_of(scoped, parent, email)
        test = practice.create(scoped, kid, body.model_dump(), parent["email"])
    except parents.ParentNotFound:
        raise HTTPException(status_code=404, detail=NO_CHILD)
    except practice.NotEnrolled:
        raise HTTPException(status_code=403, detail="Practice tests open once the student is enrolled in a course.")
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"id": test["id"], "title": test["title"], "question_count": len(test["question_ids"])}
