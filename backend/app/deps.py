"""Shared FastAPI dependencies: settings, data access, mail, the tenant for a request, and the signed-in person."""
import jwt
from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings
from app.mailer import Mailer
from app.repo import Repo, TenantRepo, is_valid_slug
from app.security import decode_token
from app.storage import ContentStorage

TENANT_HEADER = "X-Tenant"

# The three kinds of people.
STUDENT = "student"
PARENT = "parent"
TENANT_ADMIN = "tenant_admin"
PLATFORM_ADMIN = "platform_admin"

bearer_scheme = HTTPBearer(auto_error=False)


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_repo(request: Request) -> Repo:
    return request.app.state.repo


def get_storage(request: Request) -> ContentStorage:
    return request.app.state.storage


def get_mailer(request: Request) -> Mailer:
    return request.app.state.mailer


def get_tenant(
    x_tenant: str | None = Header(
        default=None,
        alias=TENANT_HEADER,
        description="Short name of the institute, for example aaptprep.",
    ),
    repo: Repo = Depends(get_repo),
) -> dict:
    """Find the institute a request is for, from the X-Tenant header. A missing tenant is an error, never a default."""
    slug = (x_tenant or "").strip().lower()
    if not slug:
        raise HTTPException(status_code=400, detail="Missing X-Tenant header.")
    if not is_valid_slug(slug):
        raise HTTPException(status_code=400, detail="That institute name isn't valid.")

    tenant = repo.get_tenant(slug)
    if tenant is None:
        raise HTTPException(status_code=404, detail="We couldn't find that institute.")
    if tenant["status"] != "active":
        raise HTTPException(status_code=403, detail="This institute isn't active right now. Please contact the institute.")
    return tenant


def get_tenant_repo(tenant: dict = Depends(get_tenant), repo: Repo = Depends(get_repo)) -> TenantRepo:
    """The data access for the request's tenant. Routes use this, so they can only see their own tenant's data."""
    return repo.scoped(tenant["slug"])


def get_client_ip(request: Request) -> str:
    """The connection's address. We don't trust headers like X-Forwarded-For, because anyone can fake them."""
    return request.client.host if request.client else "unknown"


def get_current_member(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    tenant: dict = Depends(get_tenant),
    repo: Repo = Depends(get_repo),
    settings: Settings = Depends(get_settings),
) -> dict:
    """The signed-in person. Their session must belong to this institute and their email must still be approved."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in first.")
    try:
        claims = decode_token(settings.secret_key, credentials.credentials, "session")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Your session has ended. Sign in again.")

    if claims.get("tenant") != tenant["slug"]:
        raise HTTPException(status_code=401, detail="This session is for a different institute. Sign in again.")

    member = repo.scoped(tenant["slug"]).get_member(claims["sub"])
    if member is None or member["status"] != "approved":
        raise HTTPException(status_code=401, detail="Sign in first.")
    return member


def require_roles(*roles: str):
    """A dependency that lets only the given roles through, for example require_roles(TENANT_ADMIN)."""

    def check(member: dict = Depends(get_current_member)) -> dict:
        if member["role"] not in roles:
            raise HTTPException(status_code=403, detail="You don't have access to this.")
        return member

    return check
