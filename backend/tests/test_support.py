"""A signed-in person emails the platform admin, with an optional screenshot. The reply goes to the sender."""
import base64

import pytest

from app import tenants
from conftest import headers

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 40
JPG = b"\xff\xd8\xff\xe0" + b"0" * 40
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"0" * 40


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


@pytest.fixture
def school(make_tenant, add_member, repo):
    tenants.ensure_platform_admin(repo, "boss@platform.example", "Arpit Jain")
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")
    return None


@pytest.fixture
def asha(school, sign_in):
    return sign_in("aaptprep", "asha@example.com")


def send(client, who, **body):
    return client.post("/api/support", json=body, headers=who)


def test_a_student_message_reaches_the_platform_admin_with_the_sender_as_reply_to(client, asha, mailer):
    before = len(mailer.sent)
    response = send(client, asha, message="The video does not play.\nIt just spins.", page="/aaptprep/learning/live")
    assert response.status_code == 202
    mail = mailer.sent[before:][0]
    assert mail.to == "boss@platform.example"
    assert mail.reply_to == "asha@example.com"
    assert "AaptPrep" in mail.subject and "The video does not play." in mail.subject
    assert "asha@example.com" in mail.body and "student" in mail.body and "/aaptprep/learning/live" in mail.body
    assert "It just spins." in mail.body
    assert mail.attachments == ()


@pytest.mark.parametrize("data,name,kind", [(PNG, "screenshot.png", "image/png"), (JPG, "screenshot.jpg", "image/jpeg"), (WEBP, "screenshot.webp", "image/webp")])
def test_a_screenshot_is_attached_by_what_it_really_is(client, asha, mailer, data, name, kind):
    before = len(mailer.sent)
    assert send(client, asha, message="See this", screenshot="data:image/png;base64," + b64(data)).status_code == 202
    attachment = mailer.sent[before:][0].attachments[0]
    assert (attachment.filename, attachment.content_type, attachment.data) == (name, kind, data)


def test_an_admin_can_write_too(client, school, sign_in, mailer):
    admin = sign_in("aaptprep", "ritesh@example.com")
    before = len(mailer.sent)
    assert send(client, admin, message="Need help").status_code == 202
    assert mailer.sent[before:][0].reply_to == "ritesh@example.com"


@pytest.mark.parametrize("body,problem", [
    ({"message": ""}, "Write your message first."),
    ({"message": "   "}, "Write your message first."),
    ({"message": "x" * 2001}, "up to 2000"),
    ({"message": "hi", "screenshot": "not base64!!"}, "couldn't be read"),
    ({"message": "hi", "screenshot": 5}, "couldn't be read"),
    ({"message": "hi", "screenshot": b64(b"just text, not a picture")}, "PNG, JPG or WebP"),
    ({"message": "hi", "screenshot": b64(PNG + b"0" * (3 * 1024 * 1024))}, "3 MB"),
])
def test_bad_messages_are_refused_and_nothing_is_sent(client, asha, mailer, body, problem):
    before = len(mailer.sent)
    response = send(client, asha, **body)
    assert response.status_code == 422 and problem in response.json()["detail"]
    assert len(mailer.sent) == before


def test_signing_in_is_required(client, school):
    assert send(client, headers("aaptprep"), message="hi").status_code == 401


def test_it_says_so_when_the_email_cannot_go_out(client, asha, mailer, monkeypatch):
    def fail(email):
        raise RuntimeError("down")

    monkeypatch.setattr(mailer, "send", fail)
    response = send(client, asha, message="hi")
    assert response.status_code == 503 and "try again later" in response.json()["detail"]


def test_it_says_so_when_there_is_no_platform_admin(client, make_tenant, add_member, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")
    response = send(client, sign_in("aaptprep", "asha@example.com"), message="hi")
    assert response.status_code == 503


def test_ses_sends_the_attachment_and_reply_to():
    from app.mailer import Attachment, Email, SesMailer

    calls = []

    class Client:
        def send_email(self, **kwargs):
            calls.append(kwargs)

    SesMailer(Client(), "no-reply@x.com").send(Email(to="a@b.com", subject="s", body="b", from_name="Asha", reply_to="asha@example.com", attachments=(Attachment("screenshot.png", "image/png", PNG),)))
    request = calls[0]
    assert request["ReplyToAddresses"] == ["asha@example.com"]
    assert request["Content"]["Simple"]["Attachments"][0]["FileName"] == "screenshot.png"
    assert request["Content"]["Simple"]["Attachments"][0]["RawContent"] == PNG
    calls.clear()
    SesMailer(Client(), "no-reply@x.com").send(Email(to="a@b.com", subject="s", body="b", from_name="Asha"))
    assert "ReplyToAddresses" not in calls[0] and "Attachments" not in calls[0]["Content"]["Simple"]


def test_ensure_platform_admin_fills_in_a_missing_admin_address_on_the_platform_record(repo):
    tenants.ensure_platform_admin(repo, "boss@platform.example", "Arpit Jain")
    repo.update_tenant("platform", admin_email="")
    tenants.ensure_platform_admin(repo, "boss@platform.example", "Arpit Jain")
    assert repo.get_tenant("platform")["admin_email"] == "boss@platform.example"
