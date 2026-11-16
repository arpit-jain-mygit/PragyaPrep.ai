"""Sessions and roles: who is signed in, which institute the session belongs to, and who may do what."""
import pytest
from fastapi import Depends

from app.deps import PLATFORM_ADMIN, TENANT_ADMIN, require_roles
from app.security import create_token
from app import tenants
from conftest import headers

SECRET = "test-secret-that-is-long-enough-for-hmac-sha256"


@pytest.fixture
def school(make_tenant, add_member):
    """AaptPrep with its admin Ritesh and a student Asha."""
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")


@pytest.fixture
def protected_routes(client):
    """Two small routes that only certain roles may open, so the role checks can be tested."""

    @client.app.get("/_test/tenant-admin")
    def tenant_admin_only(member: dict = Depends(require_roles(TENANT_ADMIN))):
        return {"email": member["email"]}

    @client.app.get("/_test/platform-admin")
    def platform_admin_only(member: dict = Depends(require_roles(PLATFORM_ADMIN))):
        return {"email": member["email"]}


def test_a_signed_in_student_sees_who_they_are(client, school, sign_in):
    response = client.get("/api/auth/me", headers=sign_in("aaptprep", "asha@example.com"))

    assert response.status_code == 200
    assert response.json() == {
        "email": "asha@example.com",
        "first_name": "Asha",
        "last_name": "Rao",
        "role": "student",
        "status": "approved",
    }


def test_the_institute_admin_signs_in_the_same_way_as_everyone(client, school, sign_in):
    response = client.get("/api/auth/me", headers=sign_in("aaptprep", "ritesh@example.com"))
    assert response.json()["role"] == "tenant_admin"


def test_the_platform_admin_signs_in_at_the_platform_institute(client, repo, sign_in):
    tenants.ensure_platform_admin(repo, "owner@example.com", "Platform Owner")
    response = client.get("/api/auth/me", headers=sign_in("platform", "owner@example.com"))
    assert response.json()["role"] == "platform_admin"


def test_no_session_means_sign_in_first(client, school):
    response = client.get("/api/auth/me", headers=headers("aaptprep"))
    assert response.status_code == 401
    assert response.json()["detail"] == "Sign in first."


def test_a_made_up_token_is_refused(client, school):
    response = client.get("/api/auth/me", headers=headers("aaptprep", "not-a-real-token"))
    assert response.status_code == 401


def test_a_token_signed_with_another_secret_is_refused(client, school):
    forged = create_token("some-other-secret-that-is-also-long-enough-123", "asha@example.com", "session", 3600, tenant="aaptprep")
    assert client.get("/api/auth/me", headers=headers("aaptprep", forged)).status_code == 401


def test_an_expired_session_is_refused(client, school):
    expired = create_token(SECRET, "asha@example.com", "session", -10, tenant="aaptprep")
    response = client.get("/api/auth/me", headers=headers("aaptprep", expired))
    assert response.status_code == 401
    assert "ended" in response.json()["detail"]


def test_a_token_made_for_another_purpose_is_refused(client, school):
    other = create_token(SECRET, "asha@example.com", "file", 3600, tenant="aaptprep")
    assert client.get("/api/auth/me", headers=headers("aaptprep", other)).status_code == 401


def test_a_session_for_one_institute_does_not_work_at_another(client, school, make_tenant, add_member, sign_in):
    make_tenant("otherinst", "Other Institute")
    add_member("otherinst", "asha@example.com")  # the same person, approved at both
    token = sign_in("aaptprep", "asha@example.com")["Authorization"].split()[1]

    response = client.get("/api/auth/me", headers=headers("otherinst", token))

    assert response.status_code == 401
    assert "different institute" in response.json()["detail"]


def test_a_session_ends_when_the_person_is_suspended(client, repo, school, sign_in):
    session = sign_in("aaptprep", "asha@example.com")
    assert client.get("/api/auth/me", headers=session).status_code == 200

    repo.scoped("aaptprep").update_member("asha@example.com", status="suspended")

    assert client.get("/api/auth/me", headers=session).status_code == 401


def test_a_session_ends_when_the_person_is_removed(client, repo, school, sign_in):
    session = sign_in("aaptprep", "asha@example.com")
    repo.table.delete_item(Key={"PK": "T#aaptprep#MEMBER#asha@example.com", "SK": "PROFILE"})
    assert client.get("/api/auth/me", headers=session).status_code == 401


def test_a_session_stops_working_when_the_institute_is_suspended(client, repo, school, sign_in):
    session = sign_in("aaptprep", "asha@example.com")
    tenants.set_tenant_status(repo, "aaptprep", "suspended")
    assert client.get("/api/auth/me", headers=session).status_code == 403


# ---- Roles ----

def test_only_the_right_role_may_open_a_protected_route(client, school, sign_in, protected_routes):
    student = sign_in("aaptprep", "asha@example.com")
    admin = sign_in("aaptprep", "ritesh@example.com")

    assert client.get("/_test/tenant-admin", headers=admin).status_code == 200
    refused = client.get("/_test/tenant-admin", headers=student)
    assert refused.status_code == 403
    assert refused.json()["detail"] == "You don't have access to this."


def test_a_protected_route_needs_a_session_first(client, school, protected_routes):
    assert client.get("/_test/tenant-admin", headers=headers("aaptprep")).status_code == 401


def test_an_institute_admin_cannot_use_platform_admin_routes(client, repo, school, sign_in, protected_routes):
    tenants.ensure_platform_admin(repo, "owner@example.com")
    institute_admin = sign_in("aaptprep", "ritesh@example.com")
    platform_admin = sign_in("platform", "owner@example.com")

    assert client.get("/_test/platform-admin", headers=institute_admin).status_code == 403
    assert client.get("/_test/platform-admin", headers=platform_admin).status_code == 200
