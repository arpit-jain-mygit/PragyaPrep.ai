"""Video and PDF routes. Admins upload straight to S3 with a signed form, then confirm the upload here.
Students get a short-lived signed link to one file and play it straight from S3."""
from pathlib import PurePosixPath
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings
from app.deps import can_access_course, get_current_user, get_repo, get_settings, get_storage, require_admin
from app.repo import Repo, now_iso
from app.schemas import ContentOut, ContentUploadIn, FileUrlOut, UploadTicketOut
from app.storage import ContentStorage

router = APIRouter(tags=["content"])

# Extension -> (kind, content type). Only these two kinds are accepted for now.
ALLOWED_TYPES = {
    ".pdf": ("pdf", "application/pdf"),
    ".mp4": ("video", "video/mp4"),
}


def _contents_match_extension(head: bytes, extension: str) -> bool:
    """Check the file's first bytes, because a renamed file is not a real PDF or MP4."""
    if extension == ".pdf":
        return head.startswith(b"%PDF-")
    return head[4:8] == b"ftyp"  # MP4 files store 'ftyp' after the first four bytes


# ---- Admin: upload, confirm, delete ----

@router.post(
    "/api/admin/courses/{course_id}/content/upload-url",
    status_code=201,
    response_model=UploadTicketOut,
    dependencies=[Depends(require_admin)],
)
def create_upload(
    course_id: str,
    body: ContentUploadIn,
    repo: Repo = Depends(get_repo),
    storage: ContentStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
):
    if repo.get_course(course_id) is None:
        raise HTTPException(status_code=404, detail="Course not found")

    extension = PurePosixPath(body.filename).suffix.lower()
    if extension not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only PDF and MP4 files are allowed")
    kind, content_type = ALLOWED_TYPES[extension]

    max_bytes = settings.max_upload_mb * 1024 * 1024
    if body.size_bytes > max_bytes:
        raise HTTPException(status_code=413, detail=f"File is larger than {settings.max_upload_mb} MB")

    content_id = uuid4().hex
    storage_key = f"content/{content_id}{extension}"
    # Saved as 'pending', so students can't see it until the upload is confirmed.
    repo.create_content(
        {
            "id": content_id,
            "course_id": course_id,
            "title": body.title.strip(),
            "kind": kind,
            "storage_key": storage_key,
            "content_type": content_type,
            "size_bytes": body.size_bytes,
            "status": "pending",
            "created_at": now_iso(),
        }
    )
    upload = storage.presigned_upload(storage_key, content_type, max_bytes, settings.upload_url_seconds)
    return {"content_id": content_id, "upload": upload}


@router.post(
    "/api/admin/content/{content_id}/complete",
    response_model=ContentOut,
    dependencies=[Depends(require_admin)],
)
def complete_upload(
    content_id: str,
    repo: Repo = Depends(get_repo),
    storage: ContentStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
):
    """Run after the browser has posted the file to S3. Checks it and marks it ready."""
    item = repo.get_content(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content not found")
    if item["status"] == "ready":
        return item

    size = storage.size(item["storage_key"])
    if size is None:
        raise HTTPException(status_code=400, detail="The file hasn't finished uploading")

    head = storage.read_head(item["storage_key"]) if size else b""
    extension = PurePosixPath(item["storage_key"]).suffix
    if size > settings.max_upload_mb * 1024 * 1024 or not _contents_match_extension(head, extension):
        # Reject and clean up, so bad files never reach students.
        storage.delete(item["storage_key"])
        repo.delete_content(content_id)
        raise HTTPException(status_code=400, detail="The file is too large or doesn't match its extension")

    repo.mark_content_ready(content_id, size)
    return {**item, "status": "ready", "size_bytes": size}


@router.delete("/api/admin/content/{content_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_content(
    content_id: str,
    repo: Repo = Depends(get_repo),
    storage: ContentStorage = Depends(get_storage),
) -> None:
    item = repo.get_content(content_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Content not found")
    storage.delete(item["storage_key"])
    repo.delete_content(content_id)


# ---- Students and admins: get a signed link to one file ----

@router.get("/api/content/{content_id}/url", response_model=FileUrlOut)
def get_file_url(
    content_id: str,
    user: dict = Depends(get_current_user),
    repo: Repo = Depends(get_repo),
    storage: ContentStorage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
):
    item = repo.get_content(content_id)
    if item is None or item["status"] != "ready" or not can_access_course(repo, user, item["course_id"]):
        raise HTTPException(status_code=404, detail="Content not found")
    url = storage.presigned_download(item["storage_key"], item["content_type"], settings.file_url_seconds)
    return FileUrlOut(url=url, expires_in=settings.file_url_seconds)
