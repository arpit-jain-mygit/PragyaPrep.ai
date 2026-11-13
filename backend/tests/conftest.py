"""Test setup: a fresh fake AWS (DynamoDB and S3 via moto) and a fresh app for every test. No real AWS calls."""
import os

import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.config import Settings
from app.main import create_app

ADMIN_ID = "admin"
ADMIN_PASSWORD = "admin-pass-123"
BUCKET = "test-bucket"

# Dummy credentials so boto3 never looks for real ones during tests.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-south-1")


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
            admin_login_id=ADMIN_ID,
            admin_password=ADMIN_PASSWORD,
            max_upload_mb=1,
        )
        with TestClient(create_app(settings)) as test_client:
            yield test_client


def login(client, login_id: str, password: str) -> dict:
    """Log in and return the Authorization header to send with later requests."""
    response = client.post("/api/auth/login", json={"login_id": login_id, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def admin_headers(client):
    return login(client, ADMIN_ID, ADMIN_PASSWORD)


@pytest.fixture
def make_student(client):
    """Sign a student up through the public sign-up route, as a real student would."""

    def _make(login_id: str = "STU001", password: str = "student-pass-1", email: str | None = None):
        response = client.post(
            "/api/auth/register",
            json={
                "login_id": login_id,
                "full_name": "Test Student",
                "email": email or f"{login_id.lower()}@example.com",
                "password": password,
            },
        )
        assert response.status_code == 201, response.text
        return login_id, password

    return _make
