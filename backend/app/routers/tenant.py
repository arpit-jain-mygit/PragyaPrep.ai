"""Public information about an institute, so the login and registration pages can look like it."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from app import features, institute_profile, logos
from app.deps import get_repo, get_storage, get_tenant
from app.repo import Repo
from app.schemas import TenantPublicOut
from app.storage import ContentStorage
from app.tenants import logo_url, text_color_of

router = APIRouter(prefix="/api", tags=["tenant"])


@router.get("/tenant", response_model=TenantPublicOut)
def tenant_info(tenant: dict = Depends(get_tenant)):
    return {**tenant, "branding": {**tenant["branding"], "text_color": text_color_of(tenant), "logo_url": logo_url(tenant)}, "profile": institute_profile.public_profile(tenant), "features": features.public(tenant), "menu_headings": features.headings(tenant), "menu_icon_colour": features.icon_colour(tenant)}


@router.get("/logo/{slug}", include_in_schema=True)
def logo(slug: str, repo: Repo = Depends(get_repo), storage: ContentStorage = Depends(get_storage)):
    """An institute's logo. It is public, since it shows before anyone signs in. The answer is a redirect to a signed link."""
    link = logos.public_link(repo, storage, slug)
    if link is None:
        raise HTTPException(status_code=404, detail="No logo.")
    # Browsers may keep the redirect for a few minutes. The link behind it lasts an hour.
    return RedirectResponse(link, status_code=302, headers={"Cache-Control": "public, max-age=300"})
