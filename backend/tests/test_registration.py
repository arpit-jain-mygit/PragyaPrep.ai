"""Registration: the form's checks, what gets saved, duplicates, limits, and the emails."""
import pytest

from conftest import headers, valid_form

# The fake clock's "today" is 15 January 2027 in India.


@pytest.fixture
def school(make_tenant, add_course):
    """AaptPrep with its admin Ritesh and one open course, CLAT."""
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    return add_course("aaptprep", "CLAT", 10000)


def register(client, tenant, form):
    return client.post("/api/register", json=form, headers=headers(tenant))


# ---- A good registration ----

def test_a_valid_form_is_saved_as_pending_and_the_student_gets_a_receipt(client, repo, mailer, school):
    response = register(client, "aaptprep", valid_form(school["id"]))

    assert response.status_code == 201
    assert response.json() == {
        "status": "pending",
        "message": "Thank you. Your registration is waiting for approval. We'll email you once it's approved.",
    }
    saved = repo.scoped("aaptprep").get_member("new.student@example.com")
    assert saved["status"] == "pending"
    assert saved["role"] == "student"
    assert saved["first_name"] == "Asha" and saved["last_name"] == "Rao"
    assert saved["birth_date"] == "2005-03-14"
    assert saved["mobile"] == "9876543210"
    assert saved["whatsapp"] == "9876543210"
    assert saved["pin_code"] == "201014"
    assert saved["course_id"] == school["id"]
    assert saved["course_name"] == "CLAT"

    assert len(mailer.sent) == 1
    receipt = mailer.sent[0]
    assert receipt.to == "new.student@example.com"
    assert receipt.from_name == "AaptPrep"
    assert "CLAT" in receipt.body and "waiting for approval" in receipt.body


def test_the_response_does_not_echo_personal_details(client, school):
    body = register(client, "aaptprep", valid_form(school["id"])).json()
    assert set(body) == {"status", "message"}


def test_the_email_is_stored_in_lowercase_without_spaces(client, repo, school):
    register(client, "aaptprep", valid_form(school["id"], email="  New.Student@Example.COM "))
    assert repo.scoped("aaptprep").get_member("new.student@example.com") is not None


def test_names_and_address_are_tidied(client, repo, school):
    register(client, "aaptprep", valid_form(school["id"], first_name="  Asha   Maria ", city="  New   Delhi "))
    saved = repo.scoped("aaptprep").get_member("new.student@example.com")
    assert saved["first_name"] == "Asha Maria"
    assert saved["city"] == "New Delhi"


def test_a_separate_whatsapp_number_is_kept(client, repo, school):
    form = valid_form(school["id"], whatsapp_same_as_mobile=False, whatsapp="9123456780")
    assert register(client, "aaptprep", form).status_code == 201
    saved = repo.scoped("aaptprep").get_member("new.student@example.com")
    assert saved["mobile"] == "9876543210"
    assert saved["whatsapp"] == "9123456780"


def test_the_course_name_is_saved_with_the_registration_and_does_not_change_if_the_course_is_renamed(
    client, repo, school
):
    register(client, "aaptprep", valid_form(school["id"]))
    from app import courses

    courses.update_course(repo.scoped("aaptprep"), school["id"], name="CLAT 2027")

    assert repo.scoped("aaptprep").get_member("new.student@example.com")["course_name"] == "CLAT"


def test_a_registered_person_is_told_their_registration_is_pending_when_they_try_to_log_in(client, school):
    register(client, "aaptprep", valid_form(school["id"]))
    response = client.post("/api/auth/request-code", json={"email": "new.student@example.com"}, headers=headers("aaptprep"))
    assert response.json()["status"] == "pending"


# ---- Mobile numbers ----

@pytest.mark.parametrize("typed", ["9876543210", "+91 98765 43210", "09876543210", "98765-43210", "919876543210", " (98765) 43210 "])
def test_indian_mobile_numbers_are_accepted_in_common_formats_and_saved_as_ten_digits(client, repo, school, typed):
    assert register(client, "aaptprep", valid_form(school["id"], mobile=typed)).status_code == 201
    assert repo.scoped("aaptprep").get_member("new.student@example.com")["mobile"] == "9876543210"


@pytest.mark.parametrize("typed", ["12345", "5876543210", "98765432101", "abcdefghij", "", "+1 9876543210"])
def test_bad_mobile_numbers_are_refused(client, school, typed):
    response = register(client, "aaptprep", valid_form(school["id"], mobile=typed))
    assert response.status_code == 422
    assert response.json()["errors"]["mobile"] == "Enter a 10-digit Indian mobile number."


def test_a_missing_whatsapp_number_is_refused_unless_same_as_mobile_is_ticked(client, school):
    response = register(client, "aaptprep", valid_form(school["id"], whatsapp_same_as_mobile=False, whatsapp=""))
    assert response.status_code == 422
    assert "same as mobile" in response.json()["errors"]["whatsapp"]


# ---- Every mistake at once ----

def test_an_empty_form_reports_every_field_together(client, school):
    response = register(client, "aaptprep", {})

    assert response.status_code == 422
    assert response.json()["detail"] == "Please correct the marked fields."
    assert set(response.json()["errors"]) == {
        "email", "first_name", "last_name", "birth_date", "gender", "mobile", "whatsapp",
        "address", "city", "pin_code", "course_id",
    }


def test_only_the_wrong_fields_are_reported(client, school):
    response = register(client, "aaptprep", valid_form(school["id"], pin_code="12", city=""))
    assert set(response.json()["errors"]) == {"pin_code", "city"}


# ---- Individual fields ----

@pytest.mark.parametrize("email", ["", "nope", "a@b", "a b@c.com"])
def test_bad_emails_are_refused(client, school, email):
    response = register(client, "aaptprep", valid_form(school["id"], email=email))
    assert response.json()["errors"]["email"] == "Enter a valid email address."


@pytest.mark.parametrize("born", ["2017-01-15", "1947-01-15", "2005-03-14"])
def test_the_edges_of_the_age_range_are_accepted(client, school, born):
    assert register(client, "aaptprep", valid_form(school["id"], birth_date=born)).status_code == 201


@pytest.mark.parametrize("born", ["2017-01-16", "1946-01-15", "2030-01-01", "1900-01-01"])
def test_birth_dates_outside_ten_to_eighty_years_old_are_refused(client, school, born):
    response = register(client, "aaptprep", valid_form(school["id"], birth_date=born))
    assert response.json()["errors"]["birth_date"] == "Enter a valid birth date."


@pytest.mark.parametrize("born", ["14-03-2005", "2005/03/14", "yesterday", "2005-13-45"])
def test_birth_dates_in_the_wrong_format_are_refused(client, school, born):
    response = register(client, "aaptprep", valid_form(school["id"], birth_date=born))
    assert response.json()["errors"]["birth_date"] == "Enter your birth date as YYYY-MM-DD."


@pytest.mark.parametrize("gender", ["Female", "MALE", "other", "prefer_not_to_say"])
def test_the_four_genders_are_accepted_in_any_case(client, school, gender):
    assert register(client, "aaptprep", valid_form(school["id"], gender=gender)).status_code == 201


@pytest.mark.parametrize("gender", ["", "x", "robot"])
def test_other_genders_are_refused(client, school, gender):
    response = register(client, "aaptprep", valid_form(school["id"], gender=gender))
    assert response.json()["errors"]["gender"] == "Choose a gender from the list."


@pytest.mark.parametrize("pin", ["012345", "12345", "2010141", "abcdef", ""])
def test_bad_pin_codes_are_refused(client, school, pin):
    response = register(client, "aaptprep", valid_form(school["id"], pin_code=pin))
    assert response.json()["errors"]["pin_code"] == "Enter a 6-digit PIN code."


def test_too_short_or_too_long_text_is_refused(client, school):
    response = register(
        client,
        "aaptprep",
        valid_form(school["id"], address="a" * 301, first_name="x" * 61, last_name="", city="a"),
    )
    assert set(response.json()["errors"]) == {"address", "first_name", "last_name", "city"}


# ---- The course ----

def test_an_unknown_or_missing_course_is_refused(client, school):
    for course in ["not-a-course", "", None]:
        response = register(client, "aaptprep", valid_form(school["id"], course_id=course))
        assert response.json()["errors"]["course_id"] == "Choose a course from the list."


def test_a_hidden_course_cannot_be_chosen(client, school, add_course):
    hidden = add_course("aaptprep", "CUET", active=False)
    response = register(client, "aaptprep", valid_form(school["id"], course_id=hidden["id"]))
    assert response.json()["errors"]["course_id"] == "Choose a course from the list."


def test_another_institutes_course_cannot_be_chosen(client, school, make_tenant, add_course):
    make_tenant("otherinst")
    other = add_course("otherinst", "CAT")
    response = register(client, "aaptprep", valid_form(school["id"], course_id=other["id"]))
    assert response.json()["errors"]["course_id"] == "Choose a course from the list."


def test_an_institute_with_no_open_courses_cannot_take_registrations(client, make_tenant):
    make_tenant("aaptprep")
    response = register(client, "aaptprep", valid_form("anything"))
    assert response.status_code == 422
    assert response.json()["errors"]["course_id"] == "No courses are open for registration yet."


# ---- Already registered ----

def test_registering_again_while_pending_is_told_it_is_already_registered(client, school):
    register(client, "aaptprep", valid_form(school["id"]))
    again = register(client, "aaptprep", valid_form(school["id"]))
    assert again.status_code == 409
    assert again.json()["detail"] == "This email is already registered. Your registration is waiting for approval."


def test_an_approved_student_is_told_to_log_in(client, school, add_member):
    add_member("aaptprep", "asha@example.com", status="approved")
    again = register(client, "aaptprep", valid_form(school["id"], email="asha@example.com"))
    assert again.status_code == 409
    assert again.json()["detail"] == "This email is already registered. Log in with the code we'll email you."


def test_a_suspended_student_is_told_their_access_is_paused(client, school, add_member):
    add_member("aaptprep", "asha@example.com", status="suspended")
    again = register(client, "aaptprep", valid_form(school["id"], email="asha@example.com"))
    assert again.status_code == 409
    assert again.json()["detail"] == "Your access is paused. Contact AaptPrep."


def test_the_institutes_admin_email_cannot_be_registered_as_a_student(client, repo, school):
    response = register(client, "aaptprep", valid_form(school["id"], email="ritesh@example.com"))
    assert response.status_code == 409
    assert repo.scoped("aaptprep").get_member("ritesh@example.com")["role"] == "tenant_admin"


def test_a_rejected_student_can_register_again_and_the_new_form_replaces_the_old(client, repo, mailer, school, add_member):
    add_member("aaptprep", "asha@example.com", status="rejected")
    repo.scoped("aaptprep").update_member("asha@example.com", decided_by="ritesh@example.com", reason="Blurry details")

    again = register(client, "aaptprep", valid_form(school["id"], email="asha@example.com", first_name="Asha", city="Noida"))

    assert again.status_code == 201
    saved = repo.scoped("aaptprep").get_member("asha@example.com")
    assert saved["status"] == "pending"
    assert saved["city"] == "Noida"
    assert "decided_by" not in saved and "reason" not in saved  # the old decision is gone
    assert len(mailer.sent) == 1


def test_the_same_email_can_register_at_two_institutes(client, school, make_tenant, add_course):
    make_tenant("otherinst")
    other = add_course("otherinst", "CAT")

    assert register(client, "aaptprep", valid_form(school["id"])).status_code == 201
    assert register(client, "otherinst", valid_form(other["id"])).status_code == 201


def test_form_mistakes_are_reported_before_saying_whether_the_email_is_known(client, school, add_member):
    add_member("aaptprep", "asha@example.com", status="approved")
    response = register(client, "aaptprep", valid_form(school["id"], email="asha@example.com", pin_code="1"))
    assert response.status_code == 422  # not 409, so a bad form can't be used to check who is registered


# ---- Limits, emails and the institute ----

def test_a_connection_can_submit_ten_forms_an_hour_then_is_slowed_down(client, school, fake_clock):
    for number in range(10):
        response = register(client, "aaptprep", valid_form(school["id"], email=f"student{number}@example.com"))
        assert response.status_code == 201

    blocked = register(client, "aaptprep", valid_form(school["id"], email="student10@example.com"))

    assert blocked.status_code == 429
    assert blocked.json()["detail"].startswith("Too many registrations from this connection.")
    assert "Retry-After" in blocked.headers

    fake_clock.advance(3600)
    assert register(client, "aaptprep", valid_form(school["id"], email="student10@example.com")).status_code == 201


def test_a_failed_receipt_email_does_not_undo_the_registration(client, repo, school):
    class Broken:
        def send(self, email):
            raise RuntimeError("down")

    client.app.state.mailer = Broken()

    response = register(client, "aaptprep", valid_form(school["id"]))

    assert response.status_code == 201
    assert repo.scoped("aaptprep").get_member("new.student@example.com")["status"] == "pending"


def test_a_suspended_institute_takes_no_registrations(client, repo, school):
    from app import tenants

    tenants.set_tenant_status(repo, "aaptprep", "suspended")
    assert register(client, "aaptprep", valid_form(school["id"])).status_code == 403


def test_the_institute_must_be_named(client, school):
    assert client.post("/api/register", json=valid_form(school["id"])).status_code == 400
