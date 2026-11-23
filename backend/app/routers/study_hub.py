"""Study Hub for students: Wren & Martin grammar, Cambridge Maths Stage 8 and the wizard's wallet.

Notes, quizzes and student-made tests, plus the wizard: points, candies, the shop and the board.
Every route needs a signed-in student. A wizard is found by its six-letter code, as in the Study Hub.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import study_hub_cm as cambridge
from app import study_hub_shop as shop
from app import study_hub_wizard as wizard_store
from app import study_hub_wm as wren_martin
from app.deps import STUDENT, get_tenant_repo, require_roles
from app.repo import TenantRepo

router = APIRouter(tags=["study hub"])
BASE = "/api/my/study-hub"


class NewWizard(BaseModel):
    name: str = Field(min_length=1, max_length=16)


class ShopItemIn(BaseModel):
    item_id: str = Field(min_length=1, max_length=40)


class WmAnswerIn(BaseModel):
    chapter: int
    question_id: str = Field(min_length=1, max_length=40)
    choice: int = Field(ge=0, le=3)


class GradeItem(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    answer: str = Field(default="", max_length=300)


class GradeIn(BaseModel):
    items: list[GradeItem] = Field(min_length=1, max_length=50)


def _wizard(scoped: TenantRepo, code: str) -> dict:
    try:
        return wizard_store.load(scoped, code)
    except wizard_store.WizardNotFound:
        raise HTTPException(status_code=404, detail="Wizard code not found")


def _known_chapters(module):
    return [c["chapter"] for c in module.chapters()]


def _parse_build(module, chapters: str, formats: str, count: int):
    """Shared checks for a student-made test: chapters "1,5,9" (empty = all), formats "ABCD" letters."""
    known = _known_chapters(module)
    try:
        chosen = [int(c) for c in chapters.split(",") if c.strip()] or known
    except ValueError:
        raise HTTPException(status_code=400, detail="Chapters must be numbers")
    if any(c not in known for c in chosen):
        raise HTTPException(status_code=404, detail="Unknown chapter")
    wanted = [f for f in formats.upper() if f in module.FORMATS]
    if not wanted:
        raise HTTPException(status_code=400, detail="Pick at least one format")
    items = module.build(chosen, wanted, max(1, min(count, 50)))
    if not items:
        raise HTTPException(status_code=404, detail="No questions match this choice")
    return {"items": items}


# ---- The wizard: code, points, candies, shop and board ----

@router.post(f"{BASE}/players", status_code=201)
def create_wizard(body: NewWizard, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Please enter a name")
    return wizard_store.view(wizard_store.create(scoped, name))


@router.get(f"{BASE}/players/{{code}}")
def get_wizard(code: str, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return wizard_store.view(_wizard(scoped, code))


@router.get(f"{BASE}/shop")
def get_shop(student: dict = Depends(require_roles(STUDENT))):
    return {"items": shop.CATALOG}


@router.post(f"{BASE}/players/{{code}}/shop/buy")
def buy(code: str, body: ShopItemIn, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    wiz = _wizard(scoped, code)
    try:
        wizard_store.buy(scoped, wiz, body.item_id)
    except wizard_store.WizardError as error:
        raise HTTPException(status_code=error.status, detail=error.detail)
    return wizard_store.view(wiz)


@router.post(f"{BASE}/players/{{code}}/shop/equip")
def equip(code: str, body: ShopItemIn, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    wiz = _wizard(scoped, code)
    try:
        wizard_store.wear(scoped, wiz, body.item_id)
    except wizard_store.WizardError as error:
        raise HTTPException(status_code=error.status, detail=error.detail)
    return wizard_store.view(wiz)


@router.get(f"{BASE}/leaderboard")
def leaderboard(limit: int = 10, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return {"rows": wizard_store.board(scoped, max(1, min(limit, 50)))}


# ---- Wren & Martin grammar ----

@router.get(f"{BASE}/wm/notes")
def wm_notes(student: dict = Depends(require_roles(STUDENT))):
    return {"notes": wren_martin.notes()}


@router.get(f"{BASE}/wm/chapters")
def wm_chapters(student: dict = Depends(require_roles(STUDENT))):
    return {"chapters": wren_martin.chapters()}


@router.get(f"{BASE}/players/{{code}}/wm/chapters/{{chapter}}/questions")
def wm_questions(code: str, chapter: int, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    wiz = _wizard(scoped, code)
    info = next((c for c in wren_martin.chapters() if c["chapter"] == chapter), None)
    if info is None:
        raise HTTPException(status_code=404, detail="Unknown chapter")
    questions = wizard_store.chapter_questions(scoped, wiz["code"], chapter)
    return {"chapter": chapter, "title": info["title"], "questions": questions,
            "done": sum(1 for q in questions if q["done"])}


@router.get(f"{BASE}/players/{{code}}/wm/progress")
def wm_progress(code: str, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    return wizard_store.progress(scoped, _wizard(scoped, code)["code"])


@router.post(f"{BASE}/players/{{code}}/wm/answers")
def wm_answer(code: str, body: WmAnswerIn, scoped: TenantRepo = Depends(get_tenant_repo), student: dict = Depends(require_roles(STUDENT))):
    wiz = _wizard(scoped, code)
    if not any(c["chapter"] == body.chapter for c in wren_martin.chapters()):
        raise HTTPException(status_code=404, detail="Unknown chapter")
    result = wizard_store.answer(scoped, wiz, body.chapter, body.question_id, body.choice)
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown question")
    return result


@router.get(f"{BASE}/wm/tests/build")
def wm_build_test(chapters: str = "", formats: str = "ABCD", count: int = 10, student: dict = Depends(require_roles(STUDENT))):
    return _parse_build(wren_martin, chapters, formats, count)


@router.post(f"{BASE}/wm/tests/grade")
def wm_grade_test(body: GradeIn, student: dict = Depends(require_roles(STUDENT))):
    return wren_martin.grade([item.model_dump() for item in body.items])


# ---- Cambridge Maths Stage 8 ----

@router.get(f"{BASE}/cm/chapters")
def cm_chapters(student: dict = Depends(require_roles(STUDENT))):
    return {"chapters": cambridge.chapters()}


@router.get(f"{BASE}/cm/chapters/{{number}}")
def cm_chapter(number: int, student: dict = Depends(require_roles(STUDENT))):
    ch = cambridge.chapter(number)
    if ch is None:
        raise HTTPException(status_code=404, detail="Unknown chapter")
    return {"chapter": number, "title": ch["title"], "notes": ch["notes"], "questions": len(ch["questions"])}


@router.get(f"{BASE}/cm/chapters/{{number}}/quiz")
def cm_quiz(number: int, student: dict = Depends(require_roles(STUDENT))):
    ch = cambridge.chapter(number)
    if ch is None:
        raise HTTPException(status_code=404, detail="Unknown chapter")
    return {"chapter": number, "title": ch["title"], "questions": cambridge.quiz(number)}


@router.get(f"{BASE}/cm/tests/build")
def cm_build_test(chapters: str = "", formats: str = "ABCD", count: int = 10, student: dict = Depends(require_roles(STUDENT))):
    return _parse_build(cambridge, chapters, formats, count)


@router.post(f"{BASE}/cm/tests/grade")
def cm_grade_test(body: GradeIn, student: dict = Depends(require_roles(STUDENT))):
    return cambridge.grade([item.model_dump() for item in body.items])
