"""Request and response shapes. FastAPI uses these to validate input and hide internal fields."""
from pydantic import BaseModel, Field


# ---- Auth ----

class LoginIn(BaseModel):
    login_id: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=72)


class RegisterIn(BaseModel):
    """Student self sign-up. The student picks their own ID and gives an email."""

    login_id: str = Field(min_length=3, max_length=64)
    full_name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=72)


class GoogleCompleteIn(BaseModel):
    """Finishes a first-time Google sign-in by choosing an ID."""

    signup_token: str
    login_id: str = Field(min_length=3, max_length=64)
    full_name: str = Field(min_length=1, max_length=120)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=8, max_length=72)


class UserOut(BaseModel):
    id: str
    login_id: str
    email: str | None = None
    full_name: str
    role: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- Admin: users and grants ----

class PasswordResetIn(BaseModel):
    password: str = Field(min_length=8, max_length=72)


class GrantIn(BaseModel):
    login_id: str = Field(min_length=1, max_length=64)


# ---- Courses and content ----

class CourseIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)


class CourseOut(BaseModel):
    id: str
    title: str
    description: str


class ContentUploadIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)


class UploadTicketOut(BaseModel):
    content_id: str
    upload: dict


class ContentOut(BaseModel):
    id: str
    course_id: str
    title: str
    kind: str
    status: str
    size_bytes: int


class CourseDetailOut(CourseOut):
    content_items: list[ContentOut]


class FileUrlOut(BaseModel):
    url: str
    expires_in: int
