"""Pages anyone can open without signing in or naming an institute."""
from fastapi import APIRouter, Depends, Response

from app import glimpse
from app.config import Settings
from app.deps import get_repo, get_settings
from app.repo import Repo

router = APIRouter(tags=["public"])


@router.get("/api/public/glimpse")
def course_glimpse(response: Response, repo: Repo = Depends(get_repo), settings: Settings = Depends(get_settings)):
    """The outline of the courses (names only) for the public home page."""
    response.headers["Cache-Control"] = "public, max-age=300"
    return {"courses": glimpse.outline(repo, settings.glimpse_tenant)}
