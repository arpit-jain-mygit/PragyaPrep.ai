"""A course's learning plan (subject, topic, sub-topic, with material and finish-by dates). Only the institute's admin can see or change it."""
from fastapi import APIRouter, Depends, HTTPException

from app import coursework
from app.deps import TENANT_ADMIN, get_tenant_repo, require_roles
from app.repo import TenantRepo
from app.schemas import CourseworkCopyIn, CourseworkIn
from app.tenants import ValidationError

router = APIRouter(tags=["coursework"], dependencies=[Depends(require_roles(TENANT_ADMIN))])

NO_COURSE = "We couldn't find that course."
NO_NODE = "We couldn't find that topic or sub-topic."


def _guard(action):
    """Run an action and turn its known problems into the right HTTP answers."""
    try:
        return action()
    except coursework.CourseNotFound:
        raise HTTPException(status_code=404, detail=NO_COURSE)
    except coursework.NodeNotFound:
        raise HTTPException(status_code=404, detail=NO_NODE)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.get("/api/admin/courses/{course_id}/coursework")
def get_plan(course_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    return _guard(lambda: coursework.tree(scoped, course_id))


@router.post("/api/admin/courses/{course_id}/coursework/copy")
def copy_plan(
    course_id: str, body: CourseworkCopyIn, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))
):
    """Copy topics and sub-topics from another course. The answer is the new plan, with what was copied under 'copied'."""
    def run():
        copied = coursework.copy_from(
            scoped, course_id, body.source_course_id, body.topic_ids, body.subtopic_ids,
            keep_dates=body.keep_dates is True, keep_status=body.keep_status is True, admin_email=admin["email"],
        )
        return {**coursework.tree(scoped, course_id), "copied": copied}
    return _guard(run)


@router.post("/api/admin/courses/{course_id}/coursework/topics", status_code=201)
def add_topic(course_id: str, body: CourseworkIn, scoped: TenantRepo = Depends(get_tenant_repo)):
    def run():
        coursework.add_topic(scoped, course_id, body.paper_id, body.title)
        return coursework.tree(scoped, course_id)
    return _guard(run)


@router.post("/api/admin/courses/{course_id}/coursework/topics/{topic_id}/subtopics", status_code=201)
def add_subtopic(course_id: str, topic_id: str, body: CourseworkIn, scoped: TenantRepo = Depends(get_tenant_repo)):
    def run():
        coursework.add_subtopic(scoped, course_id, topic_id, body.model_dump())
        return coursework.tree(scoped, course_id)
    return _guard(run)


@router.patch("/api/admin/courses/{course_id}/coursework/subjects/{paper_id}")
def set_subject_date(course_id: str, paper_id: str, body: CourseworkIn, scoped: TenantRepo = Depends(get_tenant_repo)):
    def run():
        coursework.set_subject_due(scoped, course_id, paper_id, body.due)
        return coursework.tree(scoped, course_id)
    return _guard(run)


@router.patch("/api/admin/courses/{course_id}/coursework/{node_id}")
def change_node(course_id: str, node_id: str, body: CourseworkIn, scoped: TenantRepo = Depends(get_tenant_repo)):
    def run():
        coursework.edit(scoped, course_id, node_id, body.model_dump(exclude_unset=True))
        return coursework.tree(scoped, course_id)
    return _guard(run)


@router.post("/api/admin/courses/{course_id}/coursework/{node_id}/move")
def move_node(course_id: str, node_id: str, body: CourseworkIn, scoped: TenantRepo = Depends(get_tenant_repo)):
    def run():
        coursework.move(scoped, course_id, node_id, body.direction)
        return coursework.tree(scoped, course_id)
    return _guard(run)


@router.delete("/api/admin/courses/{course_id}/coursework/{node_id}")
def remove_node(course_id: str, node_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    """Delete a topic with all its sub-topics, or one sub-topic. The answer says how many went."""
    removed = _guard(lambda: coursework.remove(scoped, course_id, node_id))
    return {"removed": removed, **coursework.tree(scoped, course_id)}
