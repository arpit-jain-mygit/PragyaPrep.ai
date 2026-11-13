"""Login tests: sign-up with ID + password, login, password change, and Google sign-in guards."""
from conftest import ADMIN_ID, ADMIN_PASSWORD, login


def test_admin_logs_in_with_id_and_password(client):
    response = client.post("/api/auth/login", json={"login_id": ADMIN_ID, "password": ADMIN_PASSWORD})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "admin"


def test_wrong_password_and_unknown_id_give_the_same_error(client, make_student):
    make_student()
    wrong_password = client.post("/api/auth/login", json={"login_id": "STU001", "password": "nope-nope"})
    unknown_id = client.post("/api/auth/login", json={"login_id": "nobody", "password": "nope-nope"})
    assert wrong_password.status_code == unknown_id.status_code == 401
    assert wrong_password.json() == unknown_id.json()


def test_student_signs_up_and_sees_own_profile(client, make_student):
    make_student(login_id="STU042")
    headers = login(client, "STU042", "student-pass-1")
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["login_id"] == "STU042"
    assert me.json()["role"] == "student"


def test_sign_up_needs_an_email(client):
    response = client.post(
        "/api/auth/register",
        json={"login_id": "STU009", "full_name": "No Email", "password": "student-pass-1"},
    )
    assert response.status_code == 422


def test_duplicate_id_is_rejected(client, make_student):
    make_student(login_id="STU001")
    response = client.post(
        "/api/auth/register",
        json={"login_id": "STU001", "full_name": "Again", "email": "other@example.com", "password": "another-pass-1"},
    )
    assert response.status_code == 409


def test_duplicate_email_is_rejected(client, make_student):
    make_student(login_id="STU001", email="same@example.com")
    response = client.post(
        "/api/auth/register",
        json={"login_id": "STU002", "full_name": "Other", "email": "same@example.com", "password": "another-pass-1"},
    )
    assert response.status_code == 409


def test_student_cannot_call_admin_routes(client, make_student):
    make_student()
    headers = login(client, "STU001", "student-pass-1")
    response = client.post("/api/admin/courses", headers=headers, json={"title": "Sneaky"})
    assert response.status_code == 403


def test_change_password_replaces_the_old_one(client, make_student):
    make_student(login_id="STU001", password="old-pass-111")
    headers = login(client, "STU001", "old-pass-111")
    response = client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": "old-pass-111", "new_password": "new-pass-222"},
    )
    assert response.status_code == 204
    assert client.post("/api/auth/login", json={"login_id": "STU001", "password": "old-pass-111"}).status_code == 401
    login(client, "STU001", "new-pass-222")


def test_admin_reset_password_works(client, admin_headers, make_student):
    make_student(login_id="STU001", password="old-pass-111")
    reset = client.post("/api/admin/users/STU001/password", headers=admin_headers, json={"password": "new-pass-222"})
    assert reset.status_code == 200
    login(client, "STU001", "new-pass-222")


def test_google_sign_in_is_off_until_configured(client):
    response = client.get("/api/auth/google/start", follow_redirects=False)
    assert response.status_code == 503


def test_google_callback_rejects_forged_state(client):
    response = client.get("/api/auth/google/callback?code=abc&state=forged", follow_redirects=False)
    assert response.status_code in (400, 503)


def test_google_complete_rejects_bad_token(client):
    response = client.post(
        "/api/auth/google/complete",
        json={"signup_token": "not-a-token", "login_id": "GOO001", "full_name": "Google Student"},
    )
    assert response.status_code == 400
