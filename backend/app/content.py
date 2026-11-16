"""Course content (PDF and MP4 files) and who may open it.

Files go straight from the browser to S3 through a signed form, so a large video never passes through Lambda.
The API only records the file, then checks that what arrived really is a PDF or an MP4."""
from datetime import datetime, time, timedelta
from pathlib import PurePosixPath
from uuid import uuid4

from app import clock
from app.config import Settings
from app.repo import TenantRepo, now_iso
from app.storage import ContentStorage
from app.tenants import ValidationError

# What is accepted: the file's ending decides the type, and the first bytes must agree.
TYPES = {
    ".pdf": {"kind": "pdf", "content_type": "application/pdf"},
    ".mp4": {"kind": "mp4", "content_type": "video/mp4"},
}

PENDING_HOURS = 24  # an upload that is never finished is forgotten after this long


class CourseNotFound(Exception):
    pass


class FileNotFound(Exception):
    pass


class StudentNotFound(Exception):
    pass


class NoAccess(Exception):
    """The student can't open this. The caller shows 'not found', so nobody learns what exists."""


class AccessRefused(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def looks_like(kind: str, head: bytes) -> bool:
    """Do the file's first bytes match its kind? A PDF starts with %PDF-, an MP4 has 'ftyp' at byte 4."""
    if kind == "pdf":
        return head.startswith(b"%PDF-")
    return len(head) >= 8 and head[4:8] == b"ftyp"


# ---- Files, for the admin ----

def public_file(file: dict) -> dict:
    return {key: file.get(key) for key in ("id", "course_id", "title", "kind", "content_type", "size", "status", "created_at")}


def start_upload(
    scoped: TenantRepo, storage: ContentStorage, settings: Settings, course_id: str,
    filename: str, size: int, title: str, admin_email: str,
) -> tuple[dict, dict]:
    """Record a file as 'uploading' and return a signed form for the browser to post it to."""
    if scoped.get_course(course_id) is None:
        raise CourseNotFound()

    extension = PurePosixPath(str(filename or "").strip().lower()).suffix
    if extension not in TYPES:
        raise ValidationError("Only PDF and MP4 files can be added.")
    limit = settings.max_upload_mb * 1024 * 1024
    if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= limit:
        raise ValidationError(f"The file must be between 1 byte and {settings.max_upload_mb} MB.")

    clean_title = " ".join(str(title or PurePosixPath(filename).stem).split())
    if not 1 <= len(clean_title) <= 120:
        raise ValidationError("The title must be 1 to 120 characters.")

    file_id = uuid4().hex
    kind = TYPES[extension]
    file = {
        "id": file_id,
        "course_id": course_id,
        "title": clean_title,
        "kind": kind["kind"],
        "content_type": kind["content_type"],
        "size": size,
        "status": "uploading",
        # Every file lives in its institute's own folder.
        "key": f"{scoped.slug}/courses/{course_id}/{file_id}{extension}",
        "created_at": now_iso(),
        "created_by": admin_email,
        "ttl": int(clock.now() + PENDING_HOURS * 3600),
    }
    scoped.create_file(file)
    upload = storage.presigned_upload(file["key"], file["content_type"], size, settings.upload_url_seconds)
    return file, upload


def finish_upload(scoped: TenantRepo, storage: ContentStorage, course_id: str, file_id: str) -> dict:
    """The browser says it is done. Check that the file arrived, and is what its ending says, before anyone can open it."""
    file = scoped.get_file(course_id, file_id)
    if file is None:
        raise FileNotFound()
    if file["status"] == "ready":
        return file

    arrived = storage.size(file["key"])
    if arrived is None:
        raise ValidationError("The file hasn't arrived. Please upload it again.")
    if arrived > file["size"] or not looks_like(file["kind"], storage.read_head(file["key"])):
        storage.delete(file["key"])
        scoped.delete_file(course_id, file_id)
        raise ValidationError(f"That isn't a real {file['kind'].upper()} file, so it was removed.")

    scoped.finish_file(course_id, file_id, arrived)
    return scoped.get_file(course_id, file_id)


def list_files(scoped: TenantRepo, course_id: str) -> list[dict]:
    if scoped.get_course(course_id) is None:
        raise CourseNotFound()
    return scoped.list_files(course_id)


def delete_file(scoped: TenantRepo, storage: ContentStorage, course_id: str, file_id: str) -> None:
    file = scoped.get_file(course_id, file_id)
    if file is None:
        raise FileNotFound()
    scoped.delete_file(course_id, file_id)
    storage.delete(file["key"])


# ---- Access ----

def _expiry(course: dict) -> str | None:
    """When access granted now would end. None means it never ends."""
    rule = course.get("access") or {"type": "unlimited"}
    if rule["type"] == "days":
        return datetime.fromtimestamp(clock.now() + rule["days"] * 86400, tz=clock.INDIA).isoformat()
    if rule["type"] == "until_date":
        end = datetime.combine(datetime.fromisoformat(rule["until"]).date(), time(23, 59, 59), tzinfo=clock.INDIA)
        if end.timestamp() <= clock.now():
            raise AccessRefused("This course's end date has passed. Change its access length first.")
        return end.isoformat()
    return None


def is_active(access: dict) -> bool:
    expires = access.get("expires_at")
    return expires is None or datetime.fromisoformat(expires).timestamp() > clock.now()


def with_state(access: dict) -> dict:
    return {**access, "active": is_active(access)}


def grant_access(scoped: TenantRepo, email: str, course_id: str, admin_email: str, source: str = "manual") -> dict:
    """Let an approved student open a course, for as long as the course's access length says. Granting again renews it."""
    person = scoped.get_member(email)
    if person is None or person.get("role") != "student":
        raise StudentNotFound()
    if person["status"] != "approved":
        raise AccessRefused(f"You can only give access to an approved student, and this one is {person['status']}.")
    course = scoped.get_course(course_id)
    if course is None:
        raise CourseNotFound()

    access = {
        "course_id": course_id,
        "course_name": course["name"],
        "granted_at": now_iso(),
        "granted_by": admin_email,
        "source": source,
        "expires_at": _expiry(course),
    }
    scoped.put_access(person["email"], access)
    return with_state(access)


def revoke_access(scoped: TenantRepo, email: str, course_id: str) -> None:
    person = scoped.get_member(email)
    if person is None or person.get("role") != "student":
        raise StudentNotFound()
    if scoped.get_access(person["email"], course_id) is None:
        raise CourseNotFound()
    scoped.delete_access(person["email"], course_id)


def list_access(scoped: TenantRepo, email: str) -> list[dict]:
    person = scoped.get_member(email)
    if person is None or person.get("role") != "student":
        raise StudentNotFound()
    return [with_state(access) for access in scoped.list_access(person["email"])]


# ---- What a student sees ----

def my_courses(scoped: TenantRepo, member: dict) -> list[dict]:
    """The courses this student may open right now, each with its ready files."""
    courses = []
    for access in scoped.list_access(member["email"]):
        if not is_active(access):
            continue
        files = [public_file(f) for f in scoped.list_files(access["course_id"]) if f["status"] == "ready"]
        courses.append({"id": access["course_id"], "name": access["course_name"], "expires_at": access["expires_at"], "files": files})
    return courses


def file_link(
    scoped: TenantRepo, storage: ContentStorage, settings: Settings, member: dict, course_id: str, file_id: str
) -> dict:
    """A short-lived link to one file. Raises NoAccess unless this student has current access to the file's course."""
    access = scoped.get_access(member["email"], course_id)
    if access is None or not is_active(access):
        raise NoAccess()
    file = scoped.get_file(course_id, file_id)
    if file is None or file["status"] != "ready":
        raise NoAccess()
    url = storage.presigned_download(file["key"], file["content_type"], settings.file_url_seconds)
    return {"url": url, "expires_in": settings.file_url_seconds, "content_type": file["content_type"], "title": file["title"]}
