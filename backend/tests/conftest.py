"""Test setup: a fresh fake AWS (DynamoDB and S3 via moto), a fresh app, a movable clock and a mailbox for every test."""
import os
import re

import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app import clock, courses, tenants
from app.config import Settings
from app.main import create_app

# Dummy credentials so boto3 never looks for real ones during tests.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-south-1")

BUCKET = "test-bucket"

# The fake clock starts on an exact hour, so hourly limits start a fresh window at the start of each test.
CLOCK_START = 1_800_000_000.0


class FakeClock:
    def __init__(self):
        self.time = CLOCK_START

    def __call__(self) -> float:
        return self.time

    def advance(self, seconds: float) -> None:
        self.time += seconds


@pytest.fixture(autouse=True)
def fake_clock(monkeypatch):
    """Every test runs on a clock it can move forward, so expiry and waiting can be tested without waiting."""
    fake = FakeClock()
    monkeypatch.setattr(clock, "now", fake)
    return fake


@pytest.fixture
def client():
    with mock_aws():
        settings = Settings(
            _env_file=None,
            table_name="test-table",
            bucket_name=BUCKET,
            create_resources=True,
            aws_region="ap-south-1",
            secret_key="test-secret-that-is-long-enough-for-hmac-sha256",
            email_backend="memory",
            email_sender="noreply@example.com",
        )
        with TestClient(create_app(settings)) as test_client:
            yield test_client


@pytest.fixture
def repo(client):
    return client.app.state.repo


@pytest.fixture
def mailer(client):
    """The fake mailbox: every email the app 'sends' ends up in mailer.sent."""
    return client.app.state.mailer


@pytest.fixture
def make_tenant(repo):
    """Create an institute with its one admin, the way the create-tenant script does."""

    def _make(slug: str = "aaptprep", name: str = "AAPT Prep", admin_email: str | None = None):
        if admin_email is None:
            admin_email = f"admin@{slug.strip().lower()}.example.com"
        return tenants.create_tenant(repo, slug, name, admin_email, "Test Admin")

    return _make


@pytest.fixture
def add_member(repo):
    """Add a person to an institute, in any status or role."""

    def _add(tenant: str, email: str, status: str = "approved", role: str = "student"):
        repo.scoped(tenant).create_member(
            {"email": email, "role": role, "status": status, "first_name": "Asha", "last_name": "Rao"}
        )
        return email

    return _add


def headers(tenant: str, token: str | None = None) -> dict:
    result = {"X-Tenant": tenant}
    if token:
        result["Authorization"] = f"Bearer {token}"
    return result


def code_in(email) -> str:
    """Pull the 6-digit code out of an email the app sent."""
    return re.search(r"login code is (\d{6})", email.body).group(1)


@pytest.fixture
def sign_in(client, mailer, fake_clock):
    """Sign a person in the real way (ask for a code, read the email, enter it) and return their request headers."""

    def _sign_in(tenant: str, email: str) -> dict:
        asked = client.post("/api/auth/request-code", json={"email": email}, headers=headers(tenant))
        assert asked.status_code == 200 and asked.json()["status"] == "code_sent", asked.text
        verified = client.post(
            "/api/auth/verify-code", json={"email": email, "code": code_in(mailer.sent[-1])}, headers=headers(tenant)
        )
        assert verified.status_code == 200, verified.text
        fake_clock.advance(31)  # step past the wait between codes, in case this person signs in again
        return headers(tenant, verified.json()["access_token"])

    return _sign_in


@pytest.fixture
def add_course(repo):
    """Add a course to an institute. Returns the course, so tests can use its id."""

    def _add(tenant: str, name: str = "CLAT", fee: int = 10000, access: dict | None = None, active: bool = True) -> dict:
        scoped = repo.scoped(tenant)
        course = courses.create_course(scoped, name, fee, access)
        if not active:
            courses.update_course(scoped, course["id"], active=False)
        return scoped.get_course(course["id"])

    return _add


def valid_form(course_id: str, /, **overrides) -> dict:
    """A registration form that passes every check. Tests change one field to see it fail."""
    form = {
        "email": "new.student@example.com",
        "first_name": "Asha",
        "last_name": "Rao",
        "birth_date": "2005-03-14",
        "gender": "female",
        "mobile": "9876543210",
        "whatsapp_same_as_mobile": True,
        "address": "12 MG Road, Indirapuram",
        "city": "Ghaziabad",
        "pin_code": "201014",
        "course_id": course_id,
    }
    form.update(overrides)
    return form

