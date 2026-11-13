"""Shared FastAPI dependencies: settings, data access, storage, current user and access checks."""
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings
from app.repo import Repo
from app.security import decode_token
from app.storage import ContentStorage

bearer_scheme = HTTPBearer(auto_error=False)


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_repo(request: Request) -> Repo:
    return request.app.state.repo


def get_storage(request: Request) -> ContentStorage:
    return request.app.state.storage


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    repo: Repo = Depends(get_repo),
    settings: Settings = Depends(get_settings),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Log in first")
    try:
        payload = decode_token(settings.secret_key, credentials.credentials, "access")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Session expired, log in again")
    user = repo.get_user(payload["sub"])
    if user is None:
        raise HTTPException(status_code=401, detail="Log in first")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return user


def can_access_course(repo: Repo, user: dict, course_id: str) -> bool:
    """Admins see everything. Students see a course only when they hold a grant for it."""
    if user["role"] == "admin":
        return True
    return repo.has_grant(user["id"], course_id)
