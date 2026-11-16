"""Request and response shapes. FastAPI uses these to validate input and hide internal fields."""
from pydantic import BaseModel


class BrandingOut(BaseModel):
    display_name: str
    primary_color: str
    logo_url: str | None = None


class TenantPublicOut(BaseModel):
    """What the login and registration pages need to look like the institute. Nothing private."""

    slug: str
    name: str
    branding: BrandingOut


# ---- Login by emailed code ----

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
    fee: int
    access: AccessIn = AccessIn()


class CourseUpdateIn(BaseModel):
    name: str | None = None
    fee: int | None = None
    access: AccessIn | None = None
    active: bool | None = None


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
    course_id: str | None = None


class RegistrationEditIn(RegistrationIn):
    """The same fields as the form. Only the ones sent are changed."""


class RegistrationReceivedOut(BaseModel):
    status: str
    message: str


class RegistrationOut(BaseModel):
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
    status: str
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
    created_at: str = ""
    admin: InstituteAdminOut | None = None


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


class InstituteResultOut(BaseModel):
    institute: InstituteOut
    # Whether the new admin's welcome email went out. None when no new admin was made.
    new_admin_notified: bool | None = None
