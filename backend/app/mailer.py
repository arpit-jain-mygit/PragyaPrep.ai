"""Sending email. Amazon SES or an SMTP account (such as Gmail) in AWS, the terminal on your computer, and a list in memory in tests."""
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
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


class SmtpMailer(Mailer):
    """Sends through an SMTP account, such as a Gmail address with an app password. Mail is signed by that provider, so it is
    trusted far more than SES mail that claims to come from a Gmail address. Gmail allows about 500 emails a day."""

    def __init__(self, host: str, port: int, user: str, password: str, sender: str, timeout: int = 25):
        self.host, self.port, self.user, self.password, self.sender, self.timeout = host, port, user, password, sender, timeout

    def send(self, email: Email) -> None:
        message = EmailMessage()
        message["From"] = formataddr((email.from_name.replace("\n", " "), self.sender))
        message["To"] = email.to
        message["Subject"] = email.subject.replace("\n", " ")
        if email.reply_to:
            message["Reply-To"] = email.reply_to
        message.set_content(email.body)
        for item in email.attachments:
            maintype, _, subtype = item.content_type.partition("/")
            message.add_attachment(item.data, maintype=maintype or "application", subtype=subtype or "octet-stream", filename=item.filename)
        with smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout) as server:
            server.login(self.user, self.password)
            try:
                server.send_message(message)
            except (TimeoutError, smtplib.SMTPServerDisconnected):
                # Gmail can be slow to give its last reply after taking the message, and the mail has usually gone by then.
                # Failing here would make the app throw away a code that was in fact delivered, so this counts as sent.
                # If it really was lost, the person asks for another code after the short wait.
                logger.warning("SMTP gave no final reply for an email to %s; treating it as sent", email.to)


def make_mailer(settings: Settings) -> Mailer:
    if settings.email_backend == "memory":
        return MemoryMailer()
    if settings.email_backend == "console":
        return ConsoleMailer()
    if settings.email_backend == "ses":
        if not settings.email_sender:
            raise ValueError("PRAGYA_EMAIL_SENDER is required when PRAGYA_EMAIL_BACKEND is 'ses'.")
        return SesMailer(boto3.client("sesv2", region_name=settings.aws_region), settings.email_sender)
    if settings.email_backend == "smtp":
        if not (settings.email_sender and settings.smtp_user and settings.smtp_password):
            raise ValueError("PRAGYA_EMAIL_SENDER, PRAGYA_SMTP_USER and the smtp_password secret are required when PRAGYA_EMAIL_BACKEND is 'smtp'.")
        return SmtpMailer(settings.smtp_host, settings.smtp_port, settings.smtp_user, settings.smtp_password, settings.email_sender)
    raise ValueError(f"Unknown email backend: {settings.email_backend!r}")


def send_quietly(mailer: Mailer, email: Email) -> bool:
    """Send an email, but never let a failure undo whatever the person just did. Returns whether it went out."""
    try:
        mailer.send(email)
        return True
    except Exception:
        logger.exception("Could not send an email")
        return False

