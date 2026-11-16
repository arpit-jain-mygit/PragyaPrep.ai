"""Rate limits: how often codes can be asked for and tried. Time is moved with the fake clock."""
import pytest

from conftest import code_in, headers


def ask(client, tenant, email):
    return client.post("/api/auth/request-code", json={"email": email}, headers=headers(tenant))


def enter(client, tenant, email, code):
    return client.post("/api/auth/verify-code", json={"email": email, "code": code}, headers=headers(tenant))


@pytest.fixture
def school(make_tenant, add_member):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")


# ---- A short wait between codes ----

def test_a_second_code_within_thirty_seconds_is_refused_and_says_how_long_to_wait(client, mailer, school, fake_clock):
    ask(client, "aaptprep", "asha@example.com")
    fake_clock.advance(10)

    response = ask(client, "aaptprep", "asha@example.com")

    assert response.status_code == 429
    assert response.json()["detail"] == "Please wait 20 seconds before asking for another code."
    assert response.headers["Retry-After"] == "20"
    assert len(mailer.sent) == 1  # the refused request sent nothing


def test_a_new_code_is_allowed_after_the_wait(client, mailer, school, fake_clock):
    ask(client, "aaptprep", "asha@example.com")
    fake_clock.advance(30)
    assert ask(client, "aaptprep", "asha@example.com").status_code == 200
    assert len(mailer.sent) == 2


def test_a_refused_request_does_not_cancel_the_code_already_sent(client, mailer, school, fake_clock):
    ask(client, "aaptprep", "asha@example.com")
    code = code_in(mailer.sent[0])
    fake_clock.advance(5)
    assert ask(client, "aaptprep", "asha@example.com").status_code == 429

    assert enter(client, "aaptprep", "asha@example.com", code).status_code == 200


# ---- Five codes an hour for one email ----

def test_after_five_codes_in_an_hour_the_sixth_is_refused_until_the_hour_is_up(client, mailer, school, fake_clock):
    for _ in range(5):
        assert ask(client, "aaptprep", "asha@example.com").status_code == 200
        fake_clock.advance(31)

    sixth = ask(client, "aaptprep", "asha@example.com")

    assert sixth.status_code == 429
    assert sixth.json()["detail"].startswith("Too many codes asked for this email.")
    assert "Try again in" in sixth.json()["detail"]
    assert len(mailer.sent) == 5

    fake_clock.advance(3600)
    assert ask(client, "aaptprep", "asha@example.com").status_code == 200


def test_one_persons_limit_does_not_block_someone_else(client, mailer, school, add_member, fake_clock):
    add_member("aaptprep", "bina@example.com")
    for _ in range(5):
        ask(client, "aaptprep", "asha@example.com")
        fake_clock.advance(31)
    assert ask(client, "aaptprep", "asha@example.com").status_code == 429

    assert ask(client, "aaptprep", "bina@example.com").status_code == 200


def test_the_same_email_has_a_separate_limit_at_each_institute(client, mailer, school, make_tenant, add_member, fake_clock):
    make_tenant("otherinst", "Other Institute")
    add_member("otherinst", "asha@example.com")
    for _ in range(5):
        ask(client, "aaptprep", "asha@example.com")
        fake_clock.advance(31)
    assert ask(client, "aaptprep", "asha@example.com").status_code == 429

    assert ask(client, "otherinst", "asha@example.com").status_code == 200


# ---- Limits for one connection ----

def test_one_connection_can_ask_twenty_times_an_hour_then_is_slowed_down(client, mailer, school, fake_clock):
    for number in range(20):
        response = ask(client, "aaptprep", f"stranger{number}@example.com")
        assert response.status_code == 200
        assert response.json()["status"] == "not_registered"

    blocked = ask(client, "aaptprep", "stranger21@example.com")

    assert blocked.status_code == 429
    assert blocked.json()["detail"].startswith("Too many attempts from this connection.")
    assert mailer.sent == []

    fake_clock.advance(3600)
    assert ask(client, "aaptprep", "stranger21@example.com").status_code == 200


def test_checking_emails_is_slowed_down_whatever_the_answer_is(client, school, fake_clock):
    """Probing for who is registered is limited too, because 'not registered' counts the same as 'code sent'."""
    for number in range(20):
        ask(client, "aaptprep", f"guess{number}@example.com")
    assert ask(client, "aaptprep", "asha@example.com").status_code == 429


def test_one_connection_can_try_sixty_codes_an_hour_then_is_slowed_down(client, school, fake_clock):
    for _ in range(60):
        assert enter(client, "aaptprep", "asha@example.com", "123456").status_code == 400

    blocked = enter(client, "aaptprep", "asha@example.com", "123456")

    assert blocked.status_code == 429
    assert "Try again in" in blocked.json()["detail"]

    fake_clock.advance(3600)
    assert enter(client, "aaptprep", "asha@example.com", "123456").status_code == 400


def test_the_wait_is_shown_in_minutes_when_it_is_long(client, school, fake_clock):
    for number in range(20):
        ask(client, "aaptprep", f"guess{number}@example.com")
    fake_clock.advance(60)

    blocked = ask(client, "aaptprep", "asha@example.com")

    assert blocked.status_code == 429
    assert "59 minutes" in blocked.json()["detail"]


def test_counters_do_not_keep_readable_emails_or_addresses(client, repo, school):
    ask(client, "aaptprep", "asha@example.com")
    rows = [item["PK"] for item in repo.table.scan()["Items"] if item["PK"].startswith("RATE#")]

    assert rows
    assert not any("asha" in key or "testclient" in key for key in rows)
    assert all(item.get("ttl") for item in repo.table.scan()["Items"] if item["PK"].startswith("RATE#"))
