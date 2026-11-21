"""Past papers for students: the papers they can open, the syllabus table, and topics to filter and practise."""
from fastapi import APIRouter, Depends, HTTPException

from app import attempts, features, past_papers, practice
from app.deps import STUDENT, get_tenant, get_tenant_repo, require_roles
from app.repo import TenantRepo

router = APIRouter(tags=["past-papers"])


def _on(tenant: dict, *keys: str) -> None:
    """Refuse when the institute has none of these screens switched on."""
    if not any(features.is_on(tenant, key) for key in keys):
        raise HTTPException(status_code=404, detail="That isn't available.")


@router.get("/api/my/past-papers")
def my_past_papers(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    """The past papers this student can open, newest year first. Shown on Attempt and Explore."""
    _on(tenant, "past_papers", "past_papers_explore")
    papers = [card for card in attempts.list_tests(scoped, student) if card.get("kind") == past_papers.PAST_PAPER]
    papers.sort(key=lambda card: (-(card.get("year") or 0), card["title"]))
    return papers


@router.get("/api/my/syllabus")
def my_syllabus(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    _on(tenant, "syllabus", "tools_syllabus")
    return past_papers.syllabus(scoped)


@router.get("/api/my/filter-topics")
def my_filter_topics(tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    _on(tenant, "filter_topics")
    return past_papers.filter_topics(scoped)


@router.get("/api/my/filter-topics/questions")
def my_filter_questions(paper: str | None = None, topic: str | None = None, difficulty: str | None = None, year: int | None = None, tenant: dict = Depends(get_tenant), scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    """Questions for the Filter topics viewer. Filters are optional; the years and difficulty levels offered are returned too."""
    _on(tenant, "filter_topics")
    if difficulty and difficulty not in past_papers.DIFFICULTY_LEVELS:
        raise HTTPException(status_code=422, detail="Choose easy, medium or hard.")
    result = past_papers.question_viewer(scoped, paper=paper, topic=topic, difficulty=difficulty, year=year)
    result["years"] = past_papers.question_years(scoped)
    result["difficulties"] = list(past_papers.DIFFICULTY_LEVELS)
    return result
