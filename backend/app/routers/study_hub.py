"""Study Hub for students: Wren & Martin grammar and Cambridge Maths Stage 8.

Notes, quizzes and student-made tests. Every route needs a signed-in student. Nothing is saved:
quiz answers are checked here and the page keeps its own progress.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import study_hub_cm as cambridge
from app import study_hub_wm as wren_martin
from app.deps import STUDENT, require_roles

router = APIRouter(tags=["study hub"])


class WmAnswerIn(BaseModel):
    chapter: int
    question_id: str
    choice: int = Field(ge=0, le=3)


class GradeItem(BaseModel):
    id: str
    answer: str = ""


class GradeIn(BaseModel):
    items: list[GradeItem] = Field(min_length=1, max_length=50)


def _known_chapters(module):
    return [c["chapter"] for c in module.chapters()]


def _parse_build(module, chapters: str, formats: str, count: int, label: str):
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


# ---- Wren & Martin ----

@router.get("/api/my/study-hub/wm/notes")
def wm_notes(student: dict = Depends(require_roles(STUDENT))):
    return {"notes": wren_martin.notes()}


@router.get("/api/my/study-hub/wm/chapters")
def wm_chapters(student: dict = Depends(require_roles(STUDENT))):
    return {"chapters": wren_martin.chapters()}


@router.get("/api/my/study-hub/wm/chapters/{chapter}/questions")
def wm_questions(chapter: int, student: dict = Depends(require_roles(STUDENT))):
    info = next((c for c in wren_martin.chapters() if c["chapter"] == chapter), None)
    if info is None:
        raise HTTPException(status_code=404, detail="Unknown chapter")
    return {"chapter": chapter, "title": info["title"], "questions": wren_martin.questions(chapter)}


@router.post("/api/my/study-hub/wm/answers")
def wm_answer(body: WmAnswerIn, student: dict = Depends(require_roles(STUDENT))):
    result = wren_martin.check_answer(body.chapter, body.question_id, body.choice)
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown question")
    return result


@router.get("/api/my/study-hub/wm/tests/build")
def wm_build_test(chapters: str = "", formats: str = "ABCD", count: int = 10, student: dict = Depends(require_roles(STUDENT))):
    return _parse_build(wren_martin, chapters, formats, count, "Wren & Martin")


@router.post("/api/my/study-hub/wm/tests/grade")
def wm_grade_test(body: GradeIn, student: dict = Depends(require_roles(STUDENT))):
    return wren_martin.grade([item.model_dump() for item in body.items])


# ---- Cambridge Maths Stage 8 ----

@router.get("/api/my/study-hub/cm/chapters")
def cm_chapters(student: dict = Depends(require_roles(STUDENT))):
    return {"chapters": cambridge.chapters()}


@router.get("/api/my/study-hub/cm/chapters/{number}")
def cm_chapter(number: int, student: dict = Depends(require_roles(STUDENT))):
    ch = cambridge.chapter(number)
    if ch is None:
        raise HTTPException(status_code=404, detail="Unknown chapter")
    return {"chapter": number, "title": ch["title"], "notes": ch["notes"], "questions": len(ch["questions"])}


@router.get("/api/my/study-hub/cm/chapters/{number}/quiz")
def cm_quiz(number: int, student: dict = Depends(require_roles(STUDENT))):
    ch = cambridge.chapter(number)
    if ch is None:
        raise HTTPException(status_code=404, detail="Unknown chapter")
    return {"chapter": number, "title": ch["title"], "questions": cambridge.quiz(number)}


@router.get("/api/my/study-hub/cm/tests/build")
def cm_build_test(chapters: str = "", formats: str = "ABCD", count: int = 10, student: dict = Depends(require_roles(STUDENT))):
    return _parse_build(cambridge, chapters, formats, count, "Cambridge Maths")


@router.post("/api/my/study-hub/cm/tests/grade")
def cm_grade_test(body: GradeIn, student: dict = Depends(require_roles(STUDENT))):
    return cambridge.grade([item.model_dump() for item in body.items])
