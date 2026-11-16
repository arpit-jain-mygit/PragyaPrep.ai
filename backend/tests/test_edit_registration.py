"""The admin corrects a student's details, including the email, at any status."""
import pytest

from conftest import code_in, headers, valid_form


@pytest.fixture
def school(make_tenant, add_course):
    """AaptPrep with its admin Ritesh and two courses."""
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    return {"clat": add_course("aaptprep", "CLAT", 10000), "cat": add_course("aaptprep", "CAT", 12000)}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


@pytest.fixture
def student(client, school, admin):
    """Asha registers, and the admin approves her."""
    form = valid_form(school["clat"]["id"], email="asha@example.com")
    assert client.post("/api/register", json=form, headers=headers("aaptprep")).status_code == 201
    assert client.post("/api/admin/registrations/asha@example.com/approve", headers=admin).status_code == 200
    return "asha@example.com"


def edit(client, admin, who, /, **changes):
    return client.patch(f"/api/admin/registrations/{who}", json=changes, headers=admin)


def test_only_the_admin_may_edit(client, student, school, sign_in):
    pupil = sign_in("aaptprep", student)
    assert client.patch(f"/api/admin/registrations/{student}", json={"city": "Noida"}, headers=headers("aaptprep")).status_code == 401
    assert client.patch(f"/api/admin/registrations/{student}", json={"city": "Noida"}, headers=pupil).status_code == 403


def test_a_field_change_is_saved_and_recorded(client, admin, student):
    response = edit(client, admin, student, city="Noida", mobile="+91 91234 56789")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email_sent"] is False
    person = body["registration"]
    assert person["city"] == "Noida"
    assert person["mobile"] == "9123456789"
    assert person["whatsapp"] == "9123456789"  # it was the same as the mobile, so it follows
    assert person["edited_by"] == "ritesh@example.com"
    assert person["edited_at"]
    assert person["status"] == "approved"  # a correction doesn't change the decision
    assert person["first_name"] == "Asha"  # untouched fields stay


def test_whatsapp_can_be_made_different(client, admin, student):
    person = edit(client, admin, student, whatsapp="9000000001").json()["registration"]
    assert person["whatsapp"] == "9000000001"
    assert person["mobile"] == "9876543210"


def test_changing_the_course_updates_its_name(client, admin, student, school):
    person = edit(client, admin, student, course_id=school["cat"]["id"]).json()["registration"]
    assert person["course_name"] == "CAT"


def test_every_mistake_is_reported_at_once_and_nothing_is_saved(client, admin, student):
    response = edit(client, admin, student, mobile="555", pin_code="12", city="Noida")
    assert response.status_code == 422
    assert set(response.json()["errors"]) == {"mobile", "pin_code"}
    person = client.get("/api/admin/registrations?status=approved", headers=admin).json()[0]
    assert person["city"] == "Ghaziabad"


def test_an_unknown_course_is_refused(client, admin, student):
    assert edit(client, admin, student, course_id="nope").status_code == 422


def test_a_student_can_keep_a_course_the_institute_has_since_hidden(client, admin, student, school):
    client.patch(f"/api/admin/courses/{school['clat']['id']}", json={"active": False}, headers=admin)
    assert edit(client, admin, student, city="Noida").status_code == 200


def test_an_edit_with_no_real_change_does_nothing(client, admin, student):
    person = edit(client, admin, student, city="Ghaziabad").json()["registration"]
    assert person["edited_by"] == ""


def test_an_unknown_person_and_an_admin_are_not_found(client, admin, student):
    assert edit(client, admin, "nobody@example.com", city="Noida").status_code == 404
    assert edit(client, admin, "ritesh@example.com", city="Noida").status_code == 404


@pytest.mark.parametrize("path", [[], ["suspend"], ["reject"]])
def test_a_student_can_be_edited_at_any_status(client, admin, school, path):
    """Pending (no steps), suspended (approve then suspend) and rejected (reject a pending one)."""
    email = "meera@example.com"
    client.post("/api/register", json=valid_form(school["clat"]["id"], email=email), headers=headers("aaptprep"))
    if path == ["suspend"]:
        client.post(f"/api/admin/registrations/{email}/approve", headers=admin)
    if path:
        client.post(f"/api/admin/registrations/{email}/{path[0]}", headers=admin)
    before = client.get("/api/admin/registrations?status=all", headers=admin).json()[0]["status"]

    response = edit(client, admin, email, city="Noida")
    assert response.status_code == 200, response.text
    assert response.json()["registration"]["city"] == "Noida"
    assert response.json()["registration"]["status"] == before


# ---- The email ----

def test_correcting_the_email_moves_the_student_and_emails_the_new_address(client, admin, student, mailer):
    mailer.sent.clear()
    response = edit(client, admin, student, email=" New.Asha@Example.com ")
    assert response.status_code == 200, response.text
    body = response.json()
    person = body["registration"]
    assert person["email"] == "new.asha@example.com"
    assert person["previous_email"] == "asha@example.com"
    assert person["status"] == "approved"
    assert person["first_name"] == "Asha"
    assert body["email_sent"] is True
    assert [mail.to for mail in mailer.sent] == ["new.asha@example.com"]

    approved = [p["email"] for p in client.get("/api/admin/registrations?status=approved", headers=admin).json()]
    assert approved == ["new.asha@example.com"]  # one row, not two


def test_the_new_email_can_log_in_and_the_old_one_cannot(client, admin, student, mailer):
    edit(client, admin, student, email="new.asha@example.com")
    old = client.post("/api/auth/request-code", json={"email": student}, headers=headers("aaptprep"))
    assert old.json()["status"] == "not_registered"
    new = client.post("/api/auth/request-code", json={"email": "new.asha@example.com"}, headers=headers("aaptprep"))
    assert new.json()["status"] == "code_sent"


def test_a_session_of_the_old_email_stops_working(client, admin, student, sign_in):
    old_session = sign_in("aaptprep", student)
    assert client.get("/api/auth/me", headers=old_session).status_code == 200
    edit(client, admin, student, email="new.asha@example.com")
    assert client.get("/api/auth/me", headers=old_session).status_code == 401


def test_a_waiting_login_code_for_the_old_email_is_removed(client, admin, student, mailer, repo):
    client.post("/api/auth/request-code", json={"email": student}, headers=headers("aaptprep"))
    assert repo.scoped("aaptprep").get_otp(student) is not None
    edit(client, admin, student, email="new.asha@example.com")
    assert repo.scoped("aaptprep").get_otp(student) is None


def test_an_email_that_is_taken_is_refused_and_nothing_changes(client, admin, student, add_member):
    add_member("aaptprep", "taken@example.com")
    response = edit(client, admin, student, email="taken@example.com", city="Noida")
    assert response.status_code == 422
    assert "already registered" in response.json()["errors"]["email"]
    still = client.get("/api/admin/registrations?status=approved", headers=admin).json()
    assert sorted(p["email"] for p in still) == ["asha@example.com", "taken@example.com"]
    assert [p["city"] for p in still if p["email"] == "asha@example.com"] == ["Ghaziabad"]


def test_the_admins_own_email_cannot_be_taken(client, admin, student):
    assert edit(client, admin, student, email="ritesh@example.com").status_code == 422


def test_a_bad_email_is_refused(client, admin, student):
    response = edit(client, admin, student, email="not-an-email")
    assert response.status_code == 422
    assert "email" in response.json()["errors"]


def test_the_email_and_other_fields_can_change_together(client, admin, student):
    person = edit(client, admin, student, email="new.asha@example.com", city="Noida").json()["registration"]
    assert (person["email"], person["city"]) == ("new.asha@example.com", "Noida")


def test_an_edit_cannot_reach_another_institute(client, admin, student, make_tenant, add_member):
    make_tenant("other", "Other", "boss@example.com")
    add_member("other", "kiran@example.com")
    assert edit(client, admin, "kiran@example.com", city="Noida").status_code == 404


def test_a_taken_email_is_reported_together_with_other_mistakes(client, admin, student, add_member):
    add_member("aaptprep", "taken@example.com")
    response = edit(client, admin, student, email="taken@example.com", mobile="555")
    assert response.status_code == 422
    assert set(response.json()["errors"]) == {"email", "mobile"}
