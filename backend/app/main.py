"""App factory: connects settings, DynamoDB, S3 and the routes. Lambda and local runs both start here."""
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.aws import ensure_bucket, ensure_table, load_secrets, make_s3, make_table
from app.config import Settings
from app.repo import ConflictError, Repo, now_iso
from app.routers import admin, auth, content, courses
from app.security import hash_password
from app.storage import ContentStorage


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = load_secrets(settings or Settings())

    table = make_table(settings)
    s3 = make_s3(settings)
    if settings.create_resources:
        ensure_table(table)
        ensure_bucket(s3, settings.bucket_name, settings.aws_region)

    repo = Repo(table)
    _seed_admin(repo, settings)

    app = FastAPI(title="PragyaPrep API")
    app.state.settings = settings
    app.state.repo = repo
    app.state.storage = ContentStorage(s3, settings.bucket_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    for module in (auth, admin, courses, content):
        app.include_router(module.router)
    return app


def _seed_admin(repo: Repo, settings: Settings) -> None:
    """Create the first admin account so someone can log in. Does nothing if it already exists."""
    if repo.find_user_id("LOGIN", settings.admin_login_id) is not None:
        return
    try:
        repo.create_user(
            {
                "id": uuid4().hex,
                "login_id": settings.admin_login_id,
                "full_name": "Administrator",
                "password_hash": hash_password(settings.admin_password),
                "role": "admin",
                "created_at": now_iso(),
            }
        )
    except ConflictError:
        pass  # another instance created it first
