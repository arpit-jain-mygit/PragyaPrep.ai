"""Question bank: multiple-choice questions (a reason for every option) and fill-in questions (one typed answer
and an explanation). Private to one institute."""
from pathlib import PurePosixPath
from uuid import uuid4

from app import answers, clock, logos
from app.config import Settings
from app.papers import BY_ID
from app.repo import TenantRepo, now_iso
from app.storage import ContentStorage
from app.tenants import ValidationError

OPTION_COUNT = 4
DIFFICULTIES = ["easy", "medium", "hard"]
STATUSES = ["draft", "published"]
KINDS = ["mcq", "fill_in"]  # multiple choice, or one box the student types the answer into
# A question can carry a picture on the question itself and one on each option.
SLOTS = ["question", "A", "B", "C", "D"]
PENDING_HOURS = 24  # a picture that is never attached to a question is forgotten after this long


class QuestionNotFound(Exception):
    pass


class QuestionErrors(Exception):
    """The question has mistakes. 'errors' maps each field to a message to show next to it."""

    def __init__(self, errors: dict[str, str]):
        super().__init__("The question has mistakes")
        self.errors = errors


def _text(raw, label: str, limit: int) -> str:
    value = " ".join(str(raw or "").split())
    if not value:
        raise ValidationError(f"{label} is required.")
    if len(value) > limit:
        raise ValidationError(f"{label} can be at most {limit} characters.")
    return value


def clean(data: dict, picture_slots: frozenset | set = frozenset()) -> dict:
    """Check a whole question. Every mistake is reported together, as {field: message}.

    picture_slots are the slots that have a picture. An option with a picture may leave its text empty."""
    errors: dict[str, str] = {}
    out: dict = {}

    def attempt(field, fn):
        try:
            out[field] = fn()
        except ValidationError as error:
            errors[field] = str(error)

    paper = BY_ID.get(data.get("paper"))
    if paper is None:
        errors["paper"] = "Choose a paper from the list."
    else:
        out["paper"] = paper["id"]
        if data.get("topic") in paper["topics"]:
            out["topic"] = data["topic"]
        else:
            errors["topic"] = "Choose a topic that belongs to this paper."

    attempt("text", lambda: _text(data.get("text"), "The question", 2000))

    kind = data.get("kind") or "mcq"
    if kind not in KINDS:
        errors["kind"] = "The type must be multiple choice or fill in."
        kind = "mcq"
    out["kind"] = kind

    if kind == "fill_in":
        out["options"] = []
        out["correct"] = None
        attempt("answer", lambda: answers.clean_answer(data.get("answer")))
        attempt("explanation", lambda: _text(data.get("explanation"), "The explanation", 2000))
    else:
        options = data.get("options")
        if not isinstance(options, list) or len(options) != OPTION_COUNT:
            errors["options"] = f"Give exactly {OPTION_COUNT} options."
        else:
            cleaned = []
            for number, option in enumerate(options, start=1):
                option = option if isinstance(option, dict) else {}
                letter = SLOTS[number]
                try:
                    if letter in picture_slots and not " ".join(str(option.get("text") or "").split()):
                        option_text = ""
                    else:
                        option_text = _text(option.get("text"), f"Option {number}", 500)
                    cleaned.append({
                        "text": option_text,
                        "why": _text(option.get("why"), f"The reason for option {number}", 1000),
                    })
                except ValidationError as error:
                    errors["options"] = str(error)
                    break
            else:
                names = [item["text"].lower() for item in cleaned if item["text"]]
                if len(set(names)) != len(names):
                    errors["options"] = "Two options are the same. Each option must be different."
                else:
                    out["options"] = cleaned

        correct = data.get("correct")
        if isinstance(correct, bool) or not isinstance(correct, int) or not 0 <= correct < OPTION_COUNT:
            errors["correct"] = "Choose which option is correct."
        else:
            out["correct"] = correct


    difficulty = data.get("difficulty") or "medium"
    if difficulty in DIFFICULTIES:
        out["difficulty"] = difficulty
    else:
        errors["difficulty"] = "Difficulty must be easy, medium or hard."

    status = data.get("status") or "draft"
    if status in STATUSES:
        out["status"] = status
    else:
        errors["status"] = "Status must be draft or published."

    if errors:
        raise QuestionErrors(errors)
    return out


class ImageNotFound(Exception):
    pass


def _resolve_images(scoped: TenantRepo, requested: dict, current: dict) -> tuple[dict, list[dict], str | None]:
    """Work out the question's pictures after a change.

    requested maps a position (question, A to D) to a picture id, or None to remove it. Only pictures that were uploaded
    and checked, and aren't on another question, may be attached. Returns (pictures now, pictures to let go, problem)."""
    now = dict(current)
    problem = None
    for slot, image_id in requested.items():
        if slot not in SLOTS:
            problem = "Unknown picture position."
        elif image_id is None:
            now.pop(slot, None)
        elif current.get(slot, {}).get("id") != image_id:
            row = scoped.get_image(str(image_id))
            if row is None or row.get("status") != "ready" or row.get("question_id"):
                problem = "A picture isn't ready or is already used. Upload it again."
            else:
                now[slot] = {"id": row["id"], "key": row["key"], "content_type": row["content_type"]}
    gone = [current[slot] for slot in current if now.get(slot, {}).get("id") != current[slot]["id"]]
    return now, gone, problem


def _passage(scoped: TenantRepo, raw) -> tuple[str | None, str | None]:
    """The passage id to keep, and a problem if there is one. Blank means no passage."""
    if raw is None or raw == "":
        return None, None
    if not isinstance(raw, str) or scoped.get_passage(raw) is None:
        return None, "Choose a passage from the list."
    return raw, None


def _check(data: dict, pictures: dict, problem: str | None, passage_problem: str | None = None) -> dict:
    """clean(), plus the picture and passage problems, reported together as one set of mistakes."""
    if (data.get("kind") or "mcq") == "fill_in" and any(slot != "question" for slot in pictures):
        problem = "A fill-in question has no options, so it can't have option pictures. Remove them first."
    try:
        cleaned = clean(data, set(pictures))
        errors: dict[str, str] = {}
    except QuestionErrors as error:
        cleaned, errors = {}, dict(error.errors)
    if problem:
        errors["images"] = problem
    if passage_problem:
        errors["passage"] = passage_problem
    if errors:
        raise QuestionErrors(errors)
    return cleaned


def create_question(scoped: TenantRepo, data: dict, admin_email: str) -> dict:
    pictures, _, problem = _resolve_images(scoped, data.get("images") or {}, {})
    passage, passage_problem = _passage(scoped, data.get("passage"))
    question = {
        **_check(data, pictures, problem, passage_problem),
        "passage": passage,
        "images": pictures,
        "id": uuid4().hex,
        "created_by": admin_email,
        "created_at": now_iso(),
    }
    scoped.create_question(question)
    for picture in pictures.values():
        scoped.attach_image(picture["id"], question["id"])
    return question


def update_question(scoped: TenantRepo, storage: ContentStorage, question_id: str, changes: dict, admin_email: str) -> dict:
    """Change a question. Only the fields sent are changed; the result is checked as a whole."""
    current = scoped.get_question(question_id)
    if current is None:
        raise QuestionNotFound()
    asked = changes.get("images") or {}
    pictures, gone, problem = _resolve_images(scoped, asked, current.get("images") or {})
    merged = {**current, **{key: value for key, value in changes.items() if value is not None and key != "images"}}
    passage, passage_problem = _passage(scoped, changes["passage"] if "passage" in changes else current.get("passage"))
    fields = _check(merged, pictures, problem, passage_problem)
    fields.update(passage=passage, images=pictures, edited_by=admin_email, edited_at=now_iso())
    if fields["kind"] == "mcq":
        fields.update(answer=None, explanation=None)  # nothing left over from when it was a fill-in question
    scoped.update_question(question_id, fields)
    for picture in pictures.values():
        if picture["id"] not in {item["id"] for item in (current.get("images") or {}).values()}:
            scoped.attach_image(picture["id"], question_id)
    _drop(scoped, storage, gone)
    return scoped.get_question(question_id)


MAX_BULK = 500


def set_status(scoped: TenantRepo, ids: list, status: str, admin_email: str) -> dict:
    """Publish or un-publish many questions at once. Questions already in that status are left alone."""
    if status not in STATUSES:
        raise ValidationError("Status must be draft or published.")
    if not isinstance(ids, list) or not ids or not all(isinstance(item, str) for item in ids):
        raise ValidationError("Choose at least one question.")
    ids = list(dict.fromkeys(ids))
    if len(ids) > MAX_BULK:
        raise ValidationError(f"Choose up to {MAX_BULK} questions at a time.")
    changed = unchanged = missing = 0
    for question_id in ids:
        current = scoped.get_question(question_id)
        if current is None:
            missing += 1
        elif current.get("status") == status:
            unchanged += 1
        else:
            scoped.update_question(question_id, {"status": status, "edited_by": admin_email, "edited_at": now_iso()})
            changed += 1
    return {"changed": changed, "unchanged": unchanged, "missing": missing}


def delete_many(scoped: TenantRepo, storage: ContentStorage, ids: list, confirm: str) -> dict:
    """Delete many questions (and their pictures). The caller must send the word DELETE, as a guard against a slip."""
    if confirm != "DELETE":
        raise ValidationError("Type DELETE to confirm.")
    if not isinstance(ids, list) or not ids or not all(isinstance(item, str) for item in ids):
        raise ValidationError("Choose at least one question.")
    ids = list(dict.fromkeys(ids))
    if len(ids) > MAX_BULK:
        raise ValidationError(f"Choose up to {MAX_BULK} questions at a time.")
    deleted = missing = 0
    for question_id in ids:
        try:
            delete_question(scoped, storage, question_id)
            deleted += 1
        except QuestionNotFound:
            missing += 1
    return {"deleted": deleted, "missing": missing}


def _drop(scoped: TenantRepo, storage: ContentStorage, pictures: list[dict]) -> None:
    for picture in pictures:
        storage.delete(picture["key"])
        scoped.delete_image(picture["id"])


def delete_question(scoped: TenantRepo, storage: ContentStorage, question_id: str) -> None:
    question = scoped.get_question(question_id)
    if question is None:
        raise QuestionNotFound()
    scoped.delete_question(question_id)
    _drop(scoped, storage, list((question.get("images") or {}).values()))


# ---- Pictures: uploaded straight to S3 first, then attached when the question is saved ----

def start_image_upload(
    scoped: TenantRepo, storage: ContentStorage, settings: Settings, filename: str, size: int, admin_email: str
) -> tuple[dict, dict]:
    extension = PurePosixPath(str(filename or "").strip().lower()).suffix
    if extension not in logos.TYPES:
        raise ValidationError("A picture must be a PNG or JPG.")
    if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= logos.MAX_BYTES:
        raise ValidationError("A picture can be up to 1 MB.")

    image_id = uuid4().hex
    image = {
        "id": image_id,
        "name": PurePosixPath(str(filename).strip().replace("\\", "/")).name.lower(),
        "content_type": logos.TYPES[extension],
        "size": size,
        "status": "uploading",
        # Every picture lives in its institute's own folder.
        "key": f"{scoped.slug}/question-images/{image_id}{extension}",
        "created_at": now_iso(),
        "created_by": admin_email,
        "ttl": int(clock.now() + PENDING_HOURS * 3600),
    }
    scoped.create_image(image)
    return image, storage.presigned_upload(image["key"], image["content_type"], size, settings.upload_url_seconds)


def finish_image_upload(scoped: TenantRepo, storage: ContentStorage, image_id: str) -> dict:
    """The browser says the picture is sent. Only a real PNG or JPG is kept."""
    image = scoped.get_image(image_id)
    if image is None:
        raise ImageNotFound()
    if image["status"] == "ready":
        return image
    arrived = storage.size(image["key"])
    if arrived is None:
        raise ValidationError("The picture hasn't arrived. Please upload it again.")
    if arrived > image["size"] or not logos.looks_like(image["content_type"], storage.read_head(image["key"])):
        storage.delete(image["key"])
        scoped.delete_image(image_id)
        raise ValidationError("That isn't a real PNG or JPG picture, so it was removed.")
    scoped.mark_image_ready(image_id, arrived)
    return scoped.get_image(image_id)


def discard_image(scoped: TenantRepo, storage: ContentStorage, image_id: str) -> None:
    """Throw away a picture that was uploaded but never put on a question, for example when the form is cancelled."""
    image = scoped.get_image(image_id)
    if image is None:
        raise ImageNotFound()
    if image.get("question_id"):
        raise ValidationError("That picture is on a question. Remove it from the question instead.")
    _drop(scoped, storage, [image])


def list_questions(scoped: TenantRepo, paper=None, topic=None, status=None, difficulty=None, pictures=None, kind=None, passage=None) -> list[dict]:
    """Newest first, optionally filtered. pictures='yes' keeps questions with a picture on the question or any option,
    'no' keeps those with none."""
    items = scoped.list_questions()
    if kind:
        items = [item for item in items if item.get("kind", "mcq") == kind]
    if passage == "none":
        items = [item for item in items if not item.get("passage")]
    elif passage:
        items = [item for item in items if item.get("passage") == passage]
    if pictures == "yes":
        items = [item for item in items if item.get("images")]
    elif pictures == "no":
        items = [item for item in items if not item.get("images")]
    for field, wanted in (("paper", paper), ("topic", topic), ("status", status), ("difficulty", difficulty)):
        if wanted:
            items = [item for item in items if item.get(field) == wanted]
    return items
