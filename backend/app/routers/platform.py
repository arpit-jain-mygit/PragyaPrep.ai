"""The platform admin's tools: see, create and edit institutes and their admin. There is no delete.

Everything here needs a platform admin signed in at the platform tenant (X-Tenant: platform)."""
from fastapi import APIRouter, Depends, HTTPException

from app import tenants
from app.deps import PLATFORM_ADMIN, get_current_member, get_mailer, get_repo, require_roles
from app.mailer import Email, Mailer, send_quietly
from app.repo import Repo
from app.schemas import InstituteCreateIn, InstituteOut, InstituteResultOut, InstituteUpdateIn

router = APIRouter(prefix="/api/platform", tags=["platform admin"], dependencies=[Depends(require_roles(PLATFORM_ADMIN))])


def _welcome(institute: dict, admin_email: str, first_name: str) -> Email:
    name = institute["name"]
    return Email(
        to=admin_email,
        from_name=name,
        subject=f"You're now the admin of {name}",
        body=(
            f"Hello {first_name},\n\n"
            f"You have been set up as the admin of {name} on PragyaPrep.\n"
            "To log in, open your institute's page, type this email address, and we'll send you a 6-digit code.\n"
            "From there you can set up your courses and review the registrations that come in."
        ),
    )


def _notify(repo: Repo, mailer: Mailer, institute: dict, admin_email: str) -> bool:
    member = repo.scoped(institute["slug"]).get_member(admin_email) or {}
    return send_quietly(mailer, _welcome(institute, admin_email, member.get("first_name", "")))


@router.get("/institutes", response_model=list[InstituteOut])
def list_institutes(repo: Repo = Depends(get_repo)):
    return tenants.list_institutes(repo)


@router.get("/institutes/{slug}", response_model=InstituteOut)
def get_institute(slug: str, repo: Repo = Depends(get_repo)):
    try:
        return tenants.get_institute(repo, slug)
    except tenants.InstituteNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that institute.")


@router.post("/institutes", status_code=201, response_model=InstituteResultOut)
def create_institute(
    body: InstituteCreateIn,
    repo: Repo = Depends(get_repo),
    mailer: Mailer = Depends(get_mailer),
):
    """Create an institute with its one admin, and email the admin."""
    try:
        tenant = tenants.create_tenant(
            repo, body.slug, body.name, body.admin_email, body.admin_name, body.primary_color
        )
    except tenants.ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    institute = tenants.describe(repo, tenant)
    return {"institute": institute, "new_admin_notified": _notify(repo, mailer, institute, tenant["admin_email"])}


@router.patch("/institutes/{slug}", response_model=InstituteResultOut)
def change_institute(
    slug: str,
    body: InstituteUpdateIn,
    repo: Repo = Depends(get_repo),
    mailer: Mailer = Depends(get_mailer),
    acting: dict = Depends(get_current_member),
):
    """Change an institute's name, colour or status (active or suspended), or its admin's name or email."""
    try:
        institute, new_admin = tenants.update_institute(repo, slug, acting["email"], **body.model_dump())
    except tenants.InstituteNotFound:
        raise HTTPException(status_code=404, detail="We couldn't find that institute.")
    except tenants.ValidationError as error:
        raise HTTPException(status_code=422, detail=str(error))
    notified = _notify(repo, mailer, institute, new_admin) if new_admin else None
    return {"institute": institute, "new_admin_notified": notified}
