"""Sending email. Amazon SES in AWS, the terminal on your computer, and a list in memory in tests."""
import logging
from dataclasses import dataclass

import boto3

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class Attachment:
    filename: str
    content_type: str
    data: bytes


@dataclass
class Email:
    to: str
    subject: str
    body: str
    from_name: str  # shown as the sender's name, for example the institute's name
    reply_to: str | None = None  # where a reply goes, when it should not be the sending address
    attachments: tuple = ()  # Attachment items


class Mailer:
    def send(self, email: Email) -> None:
        raise NotImplementedError


class ConsoleMailer(Mailer):
    """Prints the email in the terminal. Used when you run the app on your own computer."""

    def send(self, email: Email) -> None:
        print()
        print(f"[email] From: {email.from_name}")
        print(f"[email] To: {email.to}")
        print(f"[email] Subject: {email.subject}")
        for item in email.attachments:
            print(f"[email] Attachment: {item.filename} ({len(item.data)} bytes)")
        print("\n".join(f"[email]   {line}" for line in email.body.splitlines()))
        print()


class MemoryMailer(Mailer):
    """Keeps emails in a list. Used by the automated tests."""

    def __init__(self):
        self.sent: list[Email] = []

    def send(self, email: Email) -> None:
        self.sent.append(email)


class SesMailer(Mailer):
    """Sends real email through Amazon SES."""

    def __init__(self, client, sender: str):
        self.client = client
        self.sender = sender

    def send(self, email: Email) -> None:
        display_name = email.from_name.replace('"', "").replace("<", "").replace(">", "")
        simple = {
            "Subject": {"Data": email.subject, "Charset": "UTF-8"},
            "Body": {"Text": {"Data": email.body, "Charset": "UTF-8"}},
        }
        if email.attachments:
            simple["Attachments"] = [
                {"RawContent": a.data, "FileName": a.filename, "ContentType": a.content_type, "ContentDisposition": "ATTACHMENT", "ContentTransferEncoding": "BASE64"}
                for a in email.attachments
            ]
        request = {"FromEmailAddress": f'"{display_name}" <{self.sender}>', "Destination": {"ToAddresses": [email.to]}, "Content": {"Simple": simple}}
        if email.reply_to:
            request["ReplyToAddresses"] = [email.reply_to]
        self.client.send_email(**request)


def make_mailer(settings: Settings) -> Mailer:
    if settings.email_backend == "memory":
        return MemoryMailer()
    if settings.email_backend == "console":
        return ConsoleMailer()
    if settings.email_backend == "ses":
        if not settings.email_sender:
            raise ValueError("PRAGYA_EMAIL_SENDER is required when PRAGYA_EMAIL_BACKEND is 'ses'.")
        return SesMailer(boto3.client("sesv2", region_name=settings.aws_region), settings.email_sender)
    raise ValueError(f"Unknown email backend: {settings.email_backend!r}")


def send_quietly(mailer: Mailer, email: Email) -> bool:
    """Send an email, but never let a failure undo whatever the person just did. Returns whether it went out."""
    try:
        mailer.send(email)
        return True
    except Exception:
        logger.exception("Could not send an email")
        return False

