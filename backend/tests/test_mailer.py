"""The email sender: how an email is handed to Amazon SES, and how the sender is chosen."""
import pytest

from app.config import Settings
from app.mailer import ConsoleMailer, Email, MemoryMailer, SesMailer, make_mailer


class FakeSesClient:
    """Stands in for the real SES client and records what it was asked to send."""

    def __init__(self):
        self.calls = []

    def send_email(self, **kwargs):
        self.calls.append(kwargs)


def test_an_email_is_handed_to_ses_with_the_institute_as_the_sender_name():
    client = FakeSesClient()
    SesMailer(client, "sender@example.com").send(
        Email(to="asha@example.com", subject="123456 is your AaptPrep login code", body="Hello", from_name="AaptPrep")
    )

    call = client.calls[0]
    assert call["FromEmailAddress"] == '"AaptPrep" <sender@example.com>'
    assert call["Destination"] == {"ToAddresses": ["asha@example.com"]}
    assert call["Content"]["Simple"]["Subject"]["Data"] == "123456 is your AaptPrep login code"
    assert call["Content"]["Simple"]["Body"]["Text"]["Data"] == "Hello"


def test_odd_characters_in_an_institute_name_cannot_break_the_sender_address():
    client = FakeSesClient()
    SesMailer(client, "sender@example.com").send(
        Email(to="a@example.com", subject="s", body="b", from_name='Bad "Name" <evil@example.com>')
    )
    assert client.calls[0]["FromEmailAddress"] == '"Bad Name evil@example.com" <sender@example.com>'


def test_the_memory_mailer_keeps_what_it_is_given():
    mailer = MemoryMailer()
    mailer.send(Email(to="a@example.com", subject="s", body="b", from_name="X"))
    assert [mail.to for mail in mailer.sent] == ["a@example.com"]


def test_the_console_mailer_prints_the_email(capsys):
    ConsoleMailer().send(Email(to="a@example.com", subject="Your code", body="Code 123456", from_name="AaptPrep"))
    out = capsys.readouterr().out
    assert "a@example.com" in out and "Your code" in out and "Code 123456" in out


def test_the_sender_is_chosen_from_the_settings():
    assert isinstance(make_mailer(Settings(_env_file=None, email_backend="memory")), MemoryMailer)
    assert isinstance(make_mailer(Settings(_env_file=None, email_backend="console")), ConsoleMailer)
    ses = make_mailer(Settings(_env_file=None, email_backend="ses", email_sender="sender@example.com"))
    assert isinstance(ses, SesMailer)


def test_ses_needs_a_sender_address():
    with pytest.raises(ValueError, match="PRAGYA_EMAIL_SENDER"):
        make_mailer(Settings(_env_file=None, email_backend="ses", email_sender=""))


def test_an_unknown_email_backend_is_refused():
    with pytest.raises(ValueError, match="Unknown email backend"):
        make_mailer(Settings(_env_file=None, email_backend="carrier-pigeon"))
