"""App factory: connects settings, DynamoDB, S3, email and the routes. Lambda and local runs both start here."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.aws import ensure_bucket, ensure_table, load_secrets, make_s3, make_table
from app.config import Settings
from app.mailer import make_mailer
from app.repo import Repo
from app.routers import admin_home, announcements, auth, content, courses, coursework, live_classes, platform, progress, questions, quizzes, registration, student_coursework, student_import, student_tests, tenant
from app.storage import ContentStorage


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = load_secrets(settings or Settings())

    table = make_table(settings)
    s3 = make_s3(settings)
    if settings.create_resources:
        ensure_table(table)
        ensure_bucket(s3, settings.bucket_name, settings.aws_region)

    app = FastAPI(title="PragyaPrep API")
    app.state.settings = settings
    app.state.repo = Repo(table)
    app.state.storage = ContentStorage(s3, settings.bucket_name)
    app.state.mailer = make_mailer(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    for module in (tenant, auth, courses, registration, platform, content, questions, quizzes, student_tests, coursework, student_coursework, progress, admin_home, announcements, student_import, live_classes):
        app.include_router(module.router)
    return app
