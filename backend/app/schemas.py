"""Request and response shapes. FastAPI uses these to validate input and hide internal fields."""
from typing import Any

from pydantic import model_validator, BaseModel


class BrandingOut(BaseModel):
    display_name: str
    primary_color: str
    logo_url: str | None = None


class TenantPublicOut(BaseModel):
    """What the login and registration pages need to look like the institute. Nothing private."""

    slug: str
    name: str
    branding: BrandingOut
    # What the institute chose to show everyone: description, city, contact email and phone, website, exam categories.
    profile: dict = {}


# ---- Login by emailed code ----

class SignupIn(BaseModel):
    """A first-time sign-up. kind is institute, student or parent; the institute fields are only for an institute."""
    kind: str
    email: str
    name: str
    institute_name: str = ""
    slug: str = ""
    primary_color: str = "#2563eb"
    code: str = ""


class RequestCodeIn(BaseModel):
    email: str


class RequestCodeOut(BaseModel):
    """'status' is one of: code_sent, not_registered, pending, rejected, suspended. 'message' is ready to show."""

    status: str
    message: str


class VerifyCodeIn(BaseModel):
    email: str
    code: str


class MemberOut(BaseModel):
    email: str
    first_name: str
    last_name: str = ""
    role: str
    status: str
    avatar_url: str = ""


class SessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    tenant: str
    member: MemberOut


# ---- Courses ----

class AccessIn(BaseModel):
    """How long a student keeps access after payment: type is 'unlimited', 'days' (with days) or 'until_date' (with until)."""

    type: str = "unlimited"
    days: int | None = None
    until: str | None = None


class CourseIn(BaseModel):
    name: str
    # Not used in Phase 1 (payments are Phase 2). The Courses page no longer sets it; it defaults to 0.
    fee: int = 0
    access: AccessIn = AccessIn()
    # Subject ids. Left out, the usual subjects for the course name are used (CUET, IPMAT, CAT, CLAT).
    papers: Any = None


class CourseUpdateIn(BaseModel):
    name: str | None = None
    fee: int | None = None
    access: AccessIn | None = None
    active: bool | None = None
    papers: Any = None


class CoursePublicOut(BaseModel):
    """What the registration dropdown needs."""

    id: str
    name: str
    fee: int


class CourseAdminOut(BaseModel):
    id: str
    name: str
    fee: int
    access: dict
    active: bool
    created_at: str = ""
    papers: list[str] = []


# ---- Registration ----

class RegistrationIn(BaseModel):
    """The registration form. Every field is checked by hand, so all mistakes come back together, field by field."""

    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    birth_date: str | None = None
    gender: str | None = None
    mobile: str | None = None
    whatsapp_same_as_mobile: bool = False
    whatsapp: str | None = None
    address: str | None = None
    city: str | None = None
    pin_code: str | None = None
    # The courses chosen (ids). course_id is still accepted from an older caller and means one course.
    course_ids: Any = None
    course_id: str | None = None
    # True when the student is about to send a photo: the answer then carries a permission to upload it.
    photo: bool = False


class RegistrationEditIn(RegistrationIn):
    """The same fields as the form. Only the ones sent are changed."""


class RegistrationReceivedOut(BaseModel):
    status: str
    message: str
    # Only when the form said photo=true: the signed form to post the photo to, and a token to finish it.
    photo_upload: dict | None = None
    photo_token: str | None = None


class RegistrationOut(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def _one_course_becomes_a_list(cls, data):
        """A registration made before several courses were allowed holds one course; show it as a list of one."""
        if isinstance(data, dict) and not data.get("course_ids") and data.get("course_id"):
            data = {**data, "course_ids": [data["course_id"]], "course_names": [data.get("course_name") or ""]}
        return data

    email: str
    first_name: str = ""
    last_name: str = ""
    birth_date: str = ""
    gender: str = ""
    mobile: str = ""
    whatsapp: str = ""
    address: str = ""
    city: str = ""
    pin_code: str = ""
    course_id: str = ""
    course_name: str = ""
    # Every course the student chose. An older registration with one course shows it here too.
    course_ids: list[str] = []
    course_names: list[str] = []
    status: str
    avatar_url: str = ""
    created_at: str = ""
    decided_by: str = ""
    decided_at: str = ""
    reason: str = ""
    edited_by: str = ""
    edited_at: str = ""
    previous_email: str = ""


class DecisionIn(BaseModel):
    reason: str | None = None


class DecisionOut(BaseModel):
    registration: RegistrationOut
    email_sent: bool


# ---- Platform admin: institutes ----

class InstituteAdminOut(BaseModel):
    email: str
    first_name: str = ""
    last_name: str = ""
    status: str


class InstituteOut(BaseModel):
    slug: str
    name: str
    status: str
    primary_color: str
    logo_url: str | None = None
    created_at: str = ""
    plan: str = "paid"
    admin: InstituteAdminOut | None = None
    # What the institute shows everyone, and how big it is (read only for the platform admin).
    profile: dict = {}
    counts: dict = {}


class InstituteCreateIn(BaseModel):
    slug: str
    name: str
    admin_name: str
    admin_email: str
    primary_color: str = "#2563eb"


class InstituteUpdateIn(BaseModel):
    """Only the fields that are sent are changed. The short name can't be changed."""

    name: str | None = None
    primary_color: str | None = None
    status: str | None = None
    admin_name: str | None = None
    admin_email: str | None = None
    plan: str | None = None


class InstituteResultOut(BaseModel):
    institute: InstituteOut
    # Whether the new admin's welcome email went out. None when no new admin was made.
    new_admin_notified: bool | None = None


# ---- Course files and access ----

class FileOut(BaseModel):
    id: str
    course_id: str
    title: str
    kind: str
    content_type: str
    size: int | None = None
    status: str
    created_at: str = ""


class FileStartIn(BaseModel):
    filename: str
    size: int
    title: str | None = None


class UploadFormOut(BaseModel):
    url: str
    fields: dict[str, str]


class FileStartOut(BaseModel):
    file: FileOut
    upload: UploadFormOut


class AccessGrantIn(BaseModel):
    course_id: str


class GrantRequestedOut(BaseModel):
    granted: list["AccessOut"]
    # Chosen courses that no longer exist, by name.
    skipped: list[str] = []


class AccessOut(BaseModel):
    course_id: str
    course_name: str
    granted_at: str
    granted_by: str
    source: str
    expires_at: str | None = None
    active: bool


class MyCourseOut(BaseModel):
    id: str
    name: str
    expires_at: str | None = None
    files: list[FileOut]


class FileLinkOut(BaseModel):
    url: str
    expires_in: int
    content_type: str
    title: str


class LogoStartIn(BaseModel):
    filename: str
    size: int


class LogoUploadOut(BaseModel):
    upload: UploadFormOut


# ---- Question bank ----

class QuestionOptionIO(BaseModel):
    text: str | None = None
    why: str | None = None


class QuestionIn(BaseModel):
    """A question. Every field is checked by hand so all mistakes come back together."""

    paper: str | None = None
    topic: str | None = None
    text: str | None = None
    options: list[QuestionOptionIO] | None = None
    correct: Any = None
    difficulty: str | None = None
    status: str | None = None
    # Picture ids by position (question, A, B, C, D). None removes a picture.
    images: dict[str, str | None] | None = None
    # "mcq" (default) or "fill_in". A fill-in question has an answer and an explanation instead of options.
    kind: str | None = None
    answer: dict | None = None
    explanation: str | None = None
    # The reading passage this question belongs to (its id). An empty string removes it.
    passage: Any = None
    # The passage's text, pasted on the question. Questions with the same text share one passage. Empty removes it.
    passage_text: Any = None


class PassageIn(BaseModel):
    title: str | None = None
    text: str | None = None


class PassageOut(BaseModel):
    id: str
    title: str
    text: str
    questions: int = 0
    created_at: str = ""
    edited_by: str | None = None
    edited_at: str | None = None


class TestIn(BaseModel):
    """A test. Every field is checked by hand so all mistakes come back together."""

    title: Any = None
    description: Any = None
    start_at: Any = None
    end_at: Any = None
    duration_minutes: Any = None
    max_attempts: Any = None
    pass_percentage: Any = None
    marks_correct: Any = None
    marks_incorrect: Any = None
    show_answers: Any = None
    courses: Any = None
    mode: Any = None
    rules: Any = None
    question_ids: Any = None
    status: Any = None


class AnswersIn(BaseModel):
    # Question id -> the answer (an option number, or typed text). null or empty clears an answer.
    answers: Any = None


class AutoPickIn(BaseModel):
    rules: Any = None
    exclude: Any = None


class QuestionStatusIn(BaseModel):
    ids: Any = None
    status: Any = None


class QuestionDeleteIn(BaseModel):
    ids: Any = None
    confirm: Any = None


class QuestionPictureOut(BaseModel):
    id: str
    url: str


class QuestionImageStartIn(BaseModel):
    filename: str
    size: Any


class QuestionImageStartOut(BaseModel):
    id: str
    upload: UploadFormOut


class QuestionOut(BaseModel):
    id: str
    paper: str
    topic: str
    text: str
    kind: str = "mcq"
    options: list[QuestionOptionIO]
    correct: int | None = None
    answer: dict | None = None
    explanation: str | None = None
    difficulty: str
    status: str
    created_at: str = ""
    images: dict[str, QuestionPictureOut] = {}
    passage: str | None = None
    # The text of the passage, so the screen can show it once above the questions that share it.
    passage_text: str | None = None
    edited_by: str | None = None
    edited_at: str | None = None


class PaperOut(BaseModel):
    id: str
    name: str
    section: str
    stream: str
    topics: list[str]


class CourseworkIn(BaseModel):
    """A topic or sub-topic of a course's plan. Every field is checked by hand, so any of them may be left out."""

    paper_id: Any = None
    title: Any = None
    note: Any = None
    due: Any = None
    status: Any = None
    materials: Any = None
    direction: Any = None


class CourseworkCopyIn(BaseModel):
    """Which topics and sub-topics of another course to copy here. Checked by hand."""

    source_course_id: Any = None
    topic_ids: Any = None
    subtopic_ids: Any = None
    keep_dates: Any = None
    keep_status: Any = None


class AnnouncementIn(BaseModel):
    """An announcement from the admin. Checked by hand so every problem gets a clear message."""

    title: Any = None
    message: Any = None
    kind: Any = None
    link: Any = None
    audience: Any = None
    send_email: Any = None


class ReminderIn(BaseModel):
    course_id: Any = None
    emails: Any = None
    send_email: Any = None


class WelcomeIn(BaseModel):
    emails: Any = None


class PhotoDoneIn(BaseModel):
    """Finishing a registration photo (token) or an admin's photo for a student (key)."""

    email: Any = None
    token: Any = None
    key: Any = None


class StudentPhotoStartIn(BaseModel):
    filename: Any = None
    size: Any = None


class LiveClassIn(BaseModel):
    """A live class. Every field is checked by hand, so any of them may be left out."""

    paper_id: Any = None
    topic_id: Any = None
    subtopic_id: Any = None
    title: Any = None
    held_on: Any = None
    held_time: Any = None
    description: Any = None
    materials: Any = None
    status: Any = None


class SupportIn(BaseModel):
    """A message to the platform admin. Checked by hand."""

    message: Any = None
    page: Any = None
    screenshot: Any = None


class PracticeIn(BaseModel):
    """A practice test on one topic. Checked by hand."""

    paper: Any = None
    topic: Any = None
    count: Any = 10


class ParentIn(BaseModel):
    """A parent and one child. Checked by hand."""

    first_name: Any = None
    last_name: Any = None
    email: Any = None
    mobile: Any = None
    student_email: Any = None
