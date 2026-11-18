"""Login by emailed code: asking for a code, the messages for each status, and checking the code."""
import pytest

from conftest import code_in, headers


def ask(client, tenant, email):
    return client.post("/api/auth/request-code", json={"email": email}, headers=headers(tenant))


def enter(client, tenant, email, code):
    return client.post("/api/auth/verify-code", json={"email": email, "code": code}, headers=headers(tenant))


@pytest.fixture
def school(make_tenant, add_member):
    """An institute called AaptPrep with one approved student, Asha."""
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")


# ---- Asking for a code: what each person is told ----

def test_an_approved_email_gets_a_code_by_email(client, mailer, school):
    response = ask(client, "aaptprep", "asha@example.com")

    assert response.status_code == 200
    assert response.json() == {"status": "code_sent", "message": "We've emailed you a 6-digit code."}
    assert len(mailer.sent) == 1
    mail = mailer.sent[0]
    assert mail.to == "asha@example.com"
    assert mail.from_name == "AaptPrep"
    assert code_in(mail) in mail.subject
    assert "10 minutes" in mail.body


def test_the_email_is_not_case_sensitive_and_spaces_are_ignored(client, mailer, school):
    assert ask(client, "aaptprep", "  ASHA@Example.COM ").json()["status"] == "code_sent"
    assert mailer.sent[0].to == "asha@example.com"


def test_an_unregistered_email_is_told_to_register_and_gets_no_email(client, mailer, school):
    response = ask(client, "aaptprep", "stranger@example.com")

    assert response.status_code == 200
    assert response.json()["status"] == "not_registered"
    assert response.json()["message"] == "This email isn't registered with AaptPrep. Register first."
    assert mailer.sent == []


@pytest.mark.parametrize(
    "status, message",
    [
        ("pending", "Your registration is waiting for approval. We'll email you once it's approved."),
        ("rejected", "Your registration wasn't approved. Contact AaptPrep."),
        ("suspended", "Your access is paused. Contact AaptPrep."),
        ("something-unknown", "Your access is paused. Contact AaptPrep."),
    ],
)
def test_each_status_gets_its_own_message_and_no_email(client, mailer, school, add_member, status, message):
    add_member("aaptprep", "other@example.com", status=status)

    response = ask(client, "aaptprep", "other@example.com")

    assert response.status_code == 200
    assert response.json()["message"] == message
    assert mailer.sent == []


def test_a_badly_formed_email_is_refused(client, school):
    for bad in ["", "not-an-email", "a@b"]:
        response = ask(client, "aaptprep", bad)
        assert response.status_code == 422, bad
        assert "valid email" in response.json()["detail"]


def test_the_institute_decides_who_is_approved(client, mailer, school, make_tenant):
    make_tenant("otherinst", "Other Institute")
    # Asha is approved at AaptPrep only. At the other institute she is a stranger.
    assert ask(client, "otherinst", "asha@example.com").json()["status"] == "not_registered"
    assert mailer.sent == []


def test_a_suspended_institute_cannot_send_codes(client, repo, mailer, school):
    from app import tenants

    tenants.set_tenant_status(repo, "aaptprep", "suspended")
    assert ask(client, "aaptprep", "asha@example.com").status_code == 403
    assert mailer.sent == []


def test_the_institute_must_be_named(client, school):
    response = client.post("/api/auth/request-code", json={"email": "asha@example.com"})
    assert response.status_code == 400


# ---- Entering the code ----

def test_the_right_code_signs_the_person_in(client, mailer, school):
    ask(client, "aaptprep", "asha@example.com")

    response = enter(client, "aaptprep", "asha@example.com", code_in(mailer.sent[0]))

    assert response.status_code == 200
    body = response.json()
    assert body["tenant"] == "aaptprep"
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 7 * 24 * 3600
    assert body["member"] == {
        "email": "asha@example.com",
        "first_name": "Asha",
        "last_name": "Rao",
        "role": "student",
        "status": "approved",
        "avatar_url": "",
    }


def test_a_code_can_be_typed_with_spaces(client, mailer, school):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])
    assert enter(client, "aaptprep", "asha@example.com", f" {code[:3]} {code[3:]} ").status_code == 200


def test_a_code_works_only_once(client, mailer, school):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])

    assert enter(client, "aaptprep", "asha@example.com", code).status_code == 200
    again = enter(client, "aaptprep", "asha@example.com", code)
    assert again.status_code == 400
    assert "isn't right, or it has expired" in again.json()["detail"]


def test_a_wrong_code_is_refused(client, mailer, school):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])
    wrong = "000000" if code != "000000" else "000001"

    response = enter(client, "aaptprep", "asha@example.com", wrong)

    assert response.status_code == 400
    assert "isn't right, or it has expired" in response.json()["detail"]


@pytest.mark.parametrize("bad", ["", "abc123", "12345", "1234567", "12 34"])
def test_codes_that_are_not_six_digits_are_refused(client, mailer, school, bad):
    ask(client, "aaptprep", "asha@example.com")
    assert enter(client, "aaptprep", "asha@example.com", bad).status_code == 400


def test_a_code_cannot_be_used_without_asking_for_one(client, school):
    assert enter(client, "aaptprep", "asha@example.com", "123456").status_code == 400


def test_a_code_expires_after_ten_minutes(client, mailer, school, fake_clock):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])

    fake_clock.advance(10 * 60 + 1)

    assert enter(client, "aaptprep", "asha@example.com", code).status_code == 400


def test_a_code_still_works_just_before_it_expires(client, mailer, school, fake_clock):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])

    fake_clock.advance(10 * 60 - 1)

    assert enter(client, "aaptprep", "asha@example.com", code).status_code == 200


def test_asking_again_cancels_the_earlier_code(client, mailer, school, fake_clock):
    ask(client, "aaptprep", "asha@example.com")
    fake_clock.advance(31)
    ask(client, "aaptprep", "asha@example.com")
    first, second = code_in(mailer.sent[0]), code_in(mailer.sent[1])
    if first == second:  # one chance in a million
        pytest.skip("both codes happened to be the same")

    assert enter(client, "aaptprep", "asha@example.com", first).status_code == 400
    assert enter(client, "aaptprep", "asha@example.com", second).status_code == 200


# ---- Wrong tries ----

def wrong_code(real: str) -> str:
    return "000000" if real != "000000" else "000001"


def test_five_wrong_tries_are_allowed_and_the_right_code_still_works_on_the_fifth(client, mailer, school):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])
    for _ in range(4):
        assert enter(client, "aaptprep", "asha@example.com", wrong_code(code)).status_code == 400

    assert enter(client, "aaptprep", "asha@example.com", code).status_code == 200


def test_after_five_wrong_tries_even_the_right_code_is_refused(client, mailer, school, fake_clock):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])
    for _ in range(5):
        enter(client, "aaptprep", "asha@example.com", wrong_code(code))

    refused = enter(client, "aaptprep", "asha@example.com", code)
    assert refused.status_code == 400
    assert "Too many wrong tries" in refused.json()["detail"]

    # The code is gone for good. A fresh one is needed.
    assert enter(client, "aaptprep", "asha@example.com", code).status_code == 400
    fake_clock.advance(31)
    ask(client, "aaptprep", "asha@example.com")
    assert enter(client, "aaptprep", "asha@example.com", code_in(mailer.sent[1])).status_code == 200


# ---- A code belongs to one email at one institute ----

def test_one_persons_code_does_not_work_for_another_person(client, mailer, school, add_member):
    add_member("aaptprep", "bina@example.com")
    ask(client, "aaptprep", "asha@example.com")
    ashas_code = code_in(mailer.sent[0])

    assert enter(client, "aaptprep", "bina@example.com", ashas_code).status_code == 400


def test_a_code_does_not_work_at_another_institute_even_for_the_same_email(client, mailer, school, make_tenant, add_member):
    make_tenant("otherinst", "Other Institute")
    add_member("otherinst", "asha@example.com")
    ask(client, "aaptprep", "asha@example.com")
    ask(client, "otherinst", "asha@example.com")
    code_at_aaptprep = code_in(mailer.sent[0])
    code_at_other = code_in(mailer.sent[1])
    if code_at_aaptprep == code_at_other:  # one chance in a million
        pytest.skip("both codes happened to be the same")

    assert enter(client, "otherinst", "asha@example.com", code_at_aaptprep).status_code == 400
    assert enter(client, "aaptprep", "asha@example.com", code_at_aaptprep).status_code == 200
    assert enter(client, "otherinst", "asha@example.com", code_at_other).status_code == 200


def test_the_code_is_stored_only_as_a_hash(client, repo, mailer, school):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])

    stored = repo.scoped("aaptprep").get_otp("asha@example.com")

    assert code not in str(stored)
    assert len(stored["code_hash"]) == 64
    assert "ttl" in stored  # DynamoDB can clear the row by itself after it expires


def test_a_person_suspended_after_asking_for_a_code_cannot_sign_in(client, repo, mailer, school):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])
    repo.scoped("aaptprep").update_member("asha@example.com", status="suspended")

    response = enter(client, "aaptprep", "asha@example.com", code)

    assert response.status_code == 403
    assert response.json()["detail"] == "Your access is paused. Contact AaptPrep."


# ---- When the email can't be sent ----

class BrokenMailer:
    def send(self, email):
        raise RuntimeError("the email service is down")


def test_if_the_email_cannot_be_sent_the_person_is_told_and_can_try_again_at_once(client, repo, mailer, school):
    working = client.app.state.mailer
    client.app.state.mailer = BrokenMailer()

    failed = ask(client, "aaptprep", "asha@example.com")

    assert failed.status_code == 503
    assert failed.json()["detail"] == "We couldn't send the email right now. Please try again in a few minutes."
    assert repo.scoped("aaptprep").get_otp("asha@example.com") is None  # no useless code left behind

    # No waiting period is left over, so as soon as email works again, a code goes out straight away.
    client.app.state.mailer = working
    assert ask(client, "aaptprep", "asha@example.com").json()["status"] == "code_sent"
    assert len(working.sent) == 1
