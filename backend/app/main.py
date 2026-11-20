"""App factory: connects settings, DynamoDB, S3, email and the routes. Lambda and local runs both start here."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.aws import ensure_bucket, ensure_table, load_secrets, make_s3, make_table
from app.config import Settings
from app.mailer import make_mailer
from app.repo import Repo
from app.routers import oranges, releases, topic_tests, vocab as vocab_router, past_papers as past_papers_router, analytics as analytics_router, word_of_day, admin_home, admin_study_log, batches, features, institute, announcements, parents, parent_portal, auth, content, courses, coursework, live_classes, platform, practice, profile, progress, public, free_plan, questions, quizzes, registration, student_coursework, student_live, student_import, support, student_tests, tenant
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
        expose_headers=["X-Next-Cursor"],  # the page reads this header to ask for the next page of registrations
    )

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    for module in (tenant, auth, courses, registration, platform, content, questions, quizzes, student_tests, coursework, student_coursework, student_live, progress, admin_home, admin_study_log, announcements, student_import, live_classes, support, practice, parents, parent_portal, public, free_plan, profile, institute, batches, features, word_of_day, oranges, releases, topic_tests, vocab_router, past_papers_router, analytics_router):
        app.include_router(module.router)
    return app
