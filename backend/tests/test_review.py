"""The admin's review queue: listing registrations, approving, rejecting, suspending and reactivating."""
import pytest

from conftest import code_in, headers, valid_form


@pytest.fixture
def school(make_tenant, add_course):
    """AaptPrep with its admin Ritesh and one open course, CLAT."""
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    return add_course("aaptprep", "CLAT", 10000)


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


@pytest.fixture
def register(client, school, fake_clock):
    """Register a student through the public form, one second after the last, so the order is clear."""

    def _register(email: str, tenant: str = "aaptprep", course_id: str | None = None, **overrides) -> str:
        fake_clock.advance(1)
        response = client.post(
            "/api/register",
            json=valid_form(course_id or school["id"], email=email, **overrides),
            headers=headers(tenant),
        )
        assert response.status_code == 201, response.text
        return email

    return _register


def queue(client, admin, status=None):
    url = "/api/admin/registrations" + (f"?status={status}" if status else "")
    response = client.get(url, headers=admin)
    assert response.status_code == 200, response.text
    return [person["email"] for person in response.json()]


def decide(client, admin, action, email, **json):
    return client.post(f"/api/admin/registrations/{email}/{action}", json=json or None, headers=admin)


# ---- The queue ----

def test_the_queue_needs_a_login_and_the_admin_role(client, school, add_member, sign_in):
    add_member("aaptprep", "asha@example.com")
    student = sign_in("aaptprep", "asha@example.com")

    assert client.get("/api/admin/registrations", headers=headers("aaptprep")).status_code == 401
    assert client.get("/api/admin/registrations", headers=student).status_code == 403
    for action in ["approve", "reject", "suspend", "reactivate"]:
        url = f"/api/admin/registrations/asha@example.com/{action}"
        assert client.post(url, headers=headers("aaptprep")).status_code == 401
        assert client.post(url, headers=student).status_code == 403


def test_the_queue_shows_pending_registrations_newest_first_with_all_their_details(client, admin, register):
    register("first@example.com")
    register("second@example.com")
    register("third@example.com")

    response = client.get("/api/admin/registrations", headers=admin)

    assert [p["email"] for p in response.json()] == ["third@example.com", "second@example.com", "first@example.com"]
    person = response.json()[0]
    assert person["status"] == "pending"
    assert person["first_name"] == "Asha"
    assert person["birth_date"] == "2005-03-14"
    assert person["mobile"] == "9876543210"
    assert person["whatsapp"] == "9876543210"
    assert person["address"] == "12 MG Road, Indirapuram"
    assert person["city"] == "Ghaziabad"
    assert person["pin_code"] == "201014"
    assert person["course_name"] == "CLAT"
    assert person["created_at"]


def test_the_queue_leaves_out_the_institutes_admin(client, admin, register):
    register("asha@example.com")
    assert "ritesh@example.com" not in queue(client, admin, "all")


def test_each_status_has_its_own_list_and_all_shows_every_one(client, admin, register):
    for email in ["a@example.com", "b@example.com", "c@example.com", "d@example.com"]:
        register(email)
    decide(client, admin, "approve", "b@example.com")
    decide(client, admin, "reject", "c@example.com")
    decide(client, admin, "approve", "d@example.com")
    decide(client, admin, "suspend", "d@example.com")

    assert queue(client, admin) == ["a@example.com"]
    assert queue(client, admin, "pending") == ["a@example.com"]
    assert queue(client, admin, "approved") == ["b@example.com"]
    assert queue(client, admin, "rejected") == ["c@example.com"]
    assert queue(client, admin, "suspended") == ["d@example.com"]
    assert sorted(queue(client, admin, "all")) == ["a@example.com", "b@example.com", "c@example.com", "d@example.com"]


def test_an_unknown_status_is_refused(client, admin):
    response = client.get("/api/admin/registrations?status=maybe", headers=admin)
    assert response.status_code == 422


# ---- Approving ----

def test_approving_moves_the_student_out_of_the_queue_emails_them_and_lets_them_log_in(client, admin, register, mailer):
    register("asha@example.com")
    mailer.sent.clear()

    response = decide(client, admin, "approve", "asha@example.com")

    assert response.status_code == 200
    body = response.json()
    assert body["registration"]["status"] == "approved"
    assert body["registration"]["decided_by"] == "ritesh@example.com"
    assert body["registration"]["decided_at"]
    assert body["email_sent"] is True
    assert queue(client, admin) == []
    assert queue(client, admin, "approved") == ["asha@example.com"]

    approval = mailer.sent[0]
    assert approval.to == "asha@example.com"
    assert "approved" in approval.subject
    assert "6-digit code" in approval.body and "CLAT" in approval.body

    # The student can now log in with an emailed code.
    asked = client.post("/api/auth/request-code", json={"email": "asha@example.com"}, headers=headers("aaptprep"))
    assert asked.json()["status"] == "code_sent"


def test_a_student_cannot_log_in_before_they_are_approved(client, admin, register, mailer):
    register("asha@example.com")
    mailer.sent.clear()  # forget the admin's own sign-in email and the receipt
    asked = client.post("/api/auth/request-code", json={"email": "asha@example.com"}, headers=headers("aaptprep"))
    assert asked.json()["status"] == "pending"
    assert mailer.sent == []  # no code was sent


def test_an_approved_student_can_complete_a_login(client, admin, register, sign_in):
    register("asha@example.com")
    decide(client, admin, "approve", "asha@example.com")
    session = sign_in("aaptprep", "asha@example.com")
    me = client.get("/api/auth/me", headers=session)
    assert me.json()["email"] == "asha@example.com"
    assert me.json()["role"] == "student"


def test_a_rejected_registration_can_be_approved_if_the_admin_changes_their_mind(client, admin, register):
    register("asha@example.com")
    decide(client, admin, "reject", "asha@example.com")
    assert decide(client, admin, "approve", "asha@example.com").status_code == 200
    assert queue(client, admin, "approved") == ["asha@example.com"]


# ---- Rejecting ----

def test_rejecting_with_a_reason_saves_it_and_puts_it_in_the_email(client, admin, register, mailer):
    register("asha@example.com")
    mailer.sent.clear()

    response = decide(client, admin, "reject", "asha@example.com", reason="  Mobile number   doesn't match our records ")

    assert response.status_code == 200
    assert response.json()["registration"]["status"] == "rejected"
    assert response.json()["registration"]["reason"] == "Mobile number doesn't match our records"
    assert response.json()["email_sent"] is True
    email = mailer.sent[0]
    assert "wasn't approved" in email.body
    assert "Reason: Mobile number doesn't match our records" in email.body


def test_rejecting_without_a_reason_works_and_the_email_has_no_reason_line(client, admin, register, mailer):
    register("asha@example.com")
    mailer.sent.clear()
    assert decide(client, admin, "reject", "asha@example.com").status_code == 200
    assert "Reason:" not in mailer.sent[0].body


def test_a_very_long_reason_is_cut_to_three_hundred_characters(client, admin, register):
    register("asha@example.com")
    response = decide(client, admin, "reject", "asha@example.com", reason="x" * 500)
    assert len(response.json()["registration"]["reason"]) == 300


def test_a_rejected_student_is_told_so_when_they_log_in_and_may_register_again(client, admin, register, school):
    register("asha@example.com")
    decide(client, admin, "reject", "asha@example.com")

    asked = client.post("/api/auth/request-code", json={"email": "asha@example.com"}, headers=headers("aaptprep"))
    assert asked.json()["status"] == "rejected"

    again = client.post("/api/register", json=valid_form(school["id"], email="asha@example.com"), headers=headers("aaptprep"))
    assert again.status_code == 201
    assert queue(client, admin) == ["asha@example.com"]
    assert queue(client, admin, "rejected") == []


# ---- Suspending and reactivating ----

def test_suspending_ends_the_students_session_and_blocks_login_until_reactivated(client, admin, register, sign_in):
    register("asha@example.com")
    decide(client, admin, "approve", "asha@example.com")
    session = sign_in("aaptprep", "asha@example.com")
    assert client.get("/api/auth/me", headers=session).status_code == 200

    assert decide(client, admin, "suspend", "asha@example.com").status_code == 200

    assert client.get("/api/auth/me", headers=session).status_code == 401
    asked = client.post("/api/auth/request-code", json={"email": "asha@example.com"}, headers=headers("aaptprep"))
    assert asked.json()["status"] == "suspended"

    assert decide(client, admin, "reactivate", "asha@example.com").status_code == 200
    assert client.get("/api/auth/me", headers=session).status_code == 200  # the old session works again
    assert queue(client, admin, "approved") == ["asha@example.com"]


def test_suspending_and_reactivating_send_no_email(client, admin, register, mailer):
    register("asha@example.com")
    decide(client, admin, "approve", "asha@example.com")
    mailer.sent.clear()

    suspended = decide(client, admin, "suspend", "asha@example.com")
    reactivated = decide(client, admin, "reactivate", "asha@example.com")

    assert suspended.json()["email_sent"] is False and reactivated.json()["email_sent"] is False
    assert mailer.sent == []


# ---- Moves that aren't allowed ----

@pytest.mark.parametrize(
    "setup, action, current",
    [
        (["approve"], "approve", "approved"),
        (["approve"], "reject", "approved"),
        ([], "suspend", "pending"),
        ([], "reactivate", "pending"),
        (["approve"], "reactivate", "approved"),
        (["reject"], "reject", "rejected"),
        (["reject"], "suspend", "rejected"),
        (["approve", "suspend"], "approve", "suspended"),
        (["approve", "suspend"], "suspend", "suspended"),
    ],
)
def test_a_move_that_does_not_fit_the_current_status_is_refused_and_changes_nothing(
    client, admin, register, setup, action, current
):
    register("asha@example.com")
    for step in setup:
        decide(client, admin, step, "asha@example.com")

    response = decide(client, admin, action, "asha@example.com")

    assert response.status_code == 409
    assert response.json()["detail"] == f"You can't {action} a registration that is {current}."
    assert queue(client, admin, current) == ["asha@example.com"]


def test_a_failed_email_does_not_undo_a_decision(client, admin, register):
    register("asha@example.com")

    class Broken:
        def send(self, email):
            raise RuntimeError("down")

    client.app.state.mailer = Broken()

    response = decide(client, admin, "approve", "asha@example.com")

    assert response.status_code == 200
    assert response.json()["email_sent"] is False
    assert response.json()["registration"]["status"] == "approved"


# ---- Who can be decided on ----

def test_an_unknown_person_is_not_found(client, admin):
    assert decide(client, admin, "approve", "nobody@example.com").status_code == 404


def test_the_institutes_admin_cannot_be_suspended_through_the_queue(client, admin):
    assert decide(client, admin, "suspend", "ritesh@example.com").status_code == 404


def test_a_badly_formed_email_is_refused(client, admin):
    assert decide(client, admin, "approve", "not-an-email").status_code == 422


def test_an_email_with_a_plus_sign_works(client, admin, register):
    register("asha+prep@example.com")
    assert decide(client, admin, "approve", "asha+prep@example.com").status_code == 200


# ---- Institutes stay apart ----

def test_an_admin_sees_only_their_own_institutes_registrations(client, school, admin, register, make_tenant, add_course):
    make_tenant("otherinst", admin_email="admin@otherinst.example.com")
    other_course = add_course("otherinst", "CAT")
    register("asha@example.com")
    register("bina@example.com", tenant="otherinst", course_id=other_course["id"])

    assert queue(client, admin) == ["asha@example.com"]


def test_an_admin_cannot_decide_on_another_institutes_student(client, admin, register, make_tenant, add_course, repo):
    make_tenant("otherinst", admin_email="admin@otherinst.example.com")
    other_course = add_course("otherinst", "CAT")
    register("bina@example.com", tenant="otherinst", course_id=other_course["id"])

    response = decide(client, admin, "approve", "bina@example.com")

    assert response.status_code == 404
    assert repo.scoped("otherinst").get_member("bina@example.com")["status"] == "pending"


def test_the_same_email_is_decided_separately_at_each_institute(client, admin, register, make_tenant, add_course, repo):
    make_tenant("otherinst", admin_email="admin@otherinst.example.com")
    other_course = add_course("otherinst", "CAT")
    register("asha@example.com")
    register("asha@example.com", tenant="otherinst", course_id=other_course["id"])

    decide(client, admin, "approve", "asha@example.com")

    assert repo.scoped("aaptprep").get_member("asha@example.com")["status"] == "approved"
    assert repo.scoped("otherinst").get_member("asha@example.com")["status"] == "pending"


def test_an_admins_session_for_one_institute_does_not_work_at_another(client, admin, register, make_tenant, add_course):
    make_tenant("otherinst", admin_email="admin@otherinst.example.com")
    other_course = add_course("otherinst", "CAT")
    register("bina@example.com", tenant="otherinst", course_id=other_course["id"])
    token = admin["Authorization"].split()[1]

    response = client.get("/api/admin/registrations", headers=headers("otherinst", token))

    assert response.status_code == 401
