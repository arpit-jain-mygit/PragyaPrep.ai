"""Question bank. Only an institute's admin can see or change its questions."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

from app import passages, question_import, questions
from app.config import Settings
from app.deps import TENANT_ADMIN, get_settings, get_storage, get_tenant_repo, require_roles
from app.papers import PAPERS
from app.repo import TenantRepo
from app.schemas import PaperOut, QuestionImageStartIn, QuestionImageStartOut, QuestionIn, QuestionOut, PassageIn, PassageOut, QuestionDeleteIn, QuestionPictureOut, QuestionStatusIn
from app.storage import ContentStorage
from app.tenants import ValidationError

PICTURE_LINK_SECONDS = 3600

router = APIRouter(tags=["questions"])


def _present(question: dict, storage: ContentStorage) -> dict:
    """The question as the admin sees it: each picture comes with a short-lived link instead of its storage path."""
    pictures = {
        slot: {"id": picture["id"], "url": storage.presigned_download(picture["key"], picture["content_type"], PICTURE_LINK_SECONDS)}
        for slot, picture in (question.get("images") or {}).items()
    }
    return {**question, "images": pictures}


def _errors(error: questions.QuestionErrors):
    return JSONResponse(status_code=422, content={"detail": "Please correct the marked fields.", "errors": error.errors})


@router.get("/api/admin/papers", response_model=list[PaperOut], dependencies=[Depends(require_roles(TENANT_ADMIN))])
def papers():
    """The subjects and topics a question can belong to. The same for every institute."""
    return PAPERS


@router.get(
    "/api/admin/questions", response_model=list[QuestionOut], dependencies=[Depends(require_roles(TENANT_ADMIN))]
)
def list_questions(
    paper: str | None = Query(None),
    topic: str | None = Query(None),
    status: str | None = Query(None),
    difficulty: str | None = Query(None),
    pictures: str | None = Query(None, description="yes: only questions with pictures. no: only questions without."),
    kind: str | None = Query(None, description="mcq or fill_in"),
    passage: str | None = Query(None, description="A passage id, or 'none' for questions without one"),
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
):
    return [_present(item, storage) for item in questions.list_questions(scoped, paper, topic, status, difficulty, pictures, kind, passage)]


# ---- Reading passages ----

@router.get("/api/admin/passages", response_model=list[PassageOut], dependencies=[Depends(require_roles(TENANT_ADMIN))])
def list_passages(scoped: TenantRepo = Depends(get_tenant_repo)):
    return passages.list_passages(scoped)


@router.post("/api/admin/passages", status_code=201, response_model=PassageOut)
def add_passage(
    body: PassageIn, scoped: TenantRepo = Depends(get_tenant_repo), admin: dict = Depends(require_roles(TENANT_ADMIN))
):
    try:
        return passages.create_passage(scoped, body.model_dump(), admin["email"])
    except questions.QuestionErrors as error:
        return _errors(error)


@router.patch("/api/admin/passages/{passage_id}", response_model=PassageOut)
def change_passage(
    passage_id: str,
    body: PassageIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    try:
        passages.update_passage(scoped, passage_id, body.model_dump(exclude_unset=True), admin["email"])
    except passages.PassageNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that passage.")
    except questions.QuestionErrors as error:
        return _errors(error)
    return next(item for item in passages.list_passages(scoped) if item["id"] == passage_id)


@router.delete("/api/admin/passages/{passage_id}", status_code=204, dependencies=[Depends(require_roles(TENANT_ADMIN))])
def remove_passage(passage_id: str, scoped: TenantRepo = Depends(get_tenant_repo)):
    try:
        passages.delete_passage(scoped, passage_id)
    except passages.PassageNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that passage.")
    except ValidationError as error:
        raise HTTPException(status_code=409, detail=str(error))


@router.post("/api/admin/questions", status_code=201)
def add_question(
    body: QuestionIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    try:
        question = questions.create_question(scoped, body.model_dump(), admin["email"])
    except questions.QuestionErrors as error:
        return _errors(error)
    return QuestionOut.model_validate(_present(question, storage))


@router.patch("/api/admin/questions/{question_id}")
def change_question(
    question_id: str,
    body: QuestionIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Change a question. Send only what changed (options go as a whole list)."""
    try:
        question = questions.update_question(
            scoped, storage, question_id, body.model_dump(exclude_unset=True), admin["email"]
        )
    except questions.QuestionNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that question.")
    except questions.QuestionErrors as error:
        return _errors(error)
    return QuestionOut.model_validate(_present(question, storage))


@router.post("/api/admin/questions/status")
def change_status(
    body: QuestionStatusIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Publish (or move back to draft) the chosen questions in one go."""
    try:
        return questions.set_status(scoped, body.ids, body.status, admin["email"])
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.post("/api/admin/questions/delete")
def delete_chosen(
    body: QuestionDeleteIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    _admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Delete the chosen questions for good. The body must carry confirm: "DELETE"."""
    try:
        return questions.delete_many(scoped, storage, body.ids, body.confirm)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.delete("/api/admin/questions/{question_id}", status_code=204, dependencies=[Depends(require_roles(TENANT_ADMIN))])
def remove_question(
    question_id: str, scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)
):
    try:
        questions.delete_question(scoped, storage, question_id)
    except questions.QuestionNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that question.")


@router.get("/api/admin/questions/template", dependencies=[Depends(require_roles(TENANT_ADMIN))])
def template():
    """The Excel file to fill in for uploading many questions at once."""
    return Response(
        question_import.build_template(),
        media_type=question_import.XLSX_TYPE,
        headers={"Content-Disposition": 'attachment; filename="question-bank-template.xlsx"'},
    )


@router.post("/api/admin/questions/import")
async def import_questions(
    request: Request,
    confirm: bool = Query(False),
    scoped: TenantRepo = Depends(get_tenant_repo),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Read an uploaded .xlsx (the request body). Without confirm=true, only check it and show what would happen.
    With confirm=true, save every row that passed. Rows with problems and duplicates are never saved."""
    content = await request.body()
    try:
        result = question_import.read(content, scoped.list_questions(), scoped.find_loose_image, scoped.list_passages())
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))

    imported = 0
    if confirm:
        made: dict[str, str] = {}  # a new passage is saved the first time a question uses it
        for item in list(result["ready"]):
            try:
                passage = item["passage"]
                if passage and "id" not in passage:
                    key = " ".join(passage["title"].lower().split())
                    if key not in made:
                        made[key] = passages.ensure(scoped, passage["title"], passage["text"], admin["email"])
                    passage = {"id": made[key]}
                questions.create_question(
                    scoped, {**item["question"], "images": item["images"], "passage": passage["id"] if passage else None}, admin["email"]
                )
                imported += 1
            except ValidationError as error:
                result["ready"].remove(item)
                result["problems"].append({"row": item["row"], "errors": {"Passage": str(error)}})
            except questions.QuestionErrors as error:
                # A picture was taken between the preview and now. The row is reported, not imported.
                result["ready"].remove(item)
                result["problems"].append({"row": item["row"], "errors": {"Pictures": next(iter(error.errors.values()))}})
    return {
        "confirmed": confirm,
        "ready": [
            {
                "row": item["row"],
                "paper": item["question"]["paper"],
                "topic": item["question"]["topic"],
                "text": item["question"]["text"],
                "pictures": len(item["images"]),
                "passage": item["passage"]["title"] if item["passage"] else None,
            }
            for item in result["ready"]
        ],
        "problems": result["problems"],
        "duplicates": result["duplicates"],
        "new_passages": len({" ".join(i["passage"]["title"].lower().split()) for i in result["ready"] if i["passage"] and "id" not in i["passage"]}),
        "imported": imported,
    }


# ---- Pictures ----

@router.post("/api/admin/question-images", status_code=201, response_model=QuestionImageStartOut)
def start_picture(
    body: QuestionImageStartIn,
    scoped: TenantRepo = Depends(get_tenant_repo),
    storage: ContentStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
    admin: dict = Depends(require_roles(TENANT_ADMIN)),
):
    """Get a signed form to send a PNG or JPG (up to 1 MB) straight to storage. Then call complete."""
    try:
        image, upload = questions.start_image_upload(scoped, storage, settings, body.filename, body.size, admin["email"])
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"id": image["id"], "upload": upload}


@router.post(
    "/api/admin/question-images/{image_id}/complete",
    response_model=QuestionPictureOut,
    dependencies=[Depends(require_roles(TENANT_ADMIN))],
)
def finish_picture(
    image_id: str, scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)
):
    """Check the picture that arrived. Only a real PNG or JPG is kept."""
    try:
        image = questions.finish_image_upload(scoped, storage, image_id)
    except questions.ImageNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that picture.")
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"id": image["id"], "url": storage.presigned_download(image["key"], image["content_type"], PICTURE_LINK_SECONDS)}


@router.delete("/api/admin/question-images/{image_id}", status_code=204, dependencies=[Depends(require_roles(TENANT_ADMIN))])
def discard_picture(
    image_id: str, scoped: TenantRepo = Depends(get_tenant_repo), storage: ContentStorage = Depends(get_storage)
):
    """Throw away a picture that was uploaded but isn't on any question (for example the form was cancelled)."""
    try:
        questions.discard_image(scoped, storage, image_id)
    except questions.ImageNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that picture.")
    except ValidationError as error:
        raise HTTPException(status_code=409, detail=str(error))
