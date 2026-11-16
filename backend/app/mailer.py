"""Sending email. Amazon SES in AWS, the terminal on your computer, and a list in memory in tests."""
from dataclasses import dataclass

import boto3

from app.config import Settings


@dataclass
class Email:
    to: str
    subject: str
    body: str
    from_name: str  # shown as the sender's name, for example the institute's name


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
        self.client.send_email(
            FromEmailAddress=f'"{display_name}" <{self.sender}>',
            Destination={"ToAddresses": [email.to]},
            Content={
                "Simple": {
                    "Subject": {"Data": email.subject, "Charset": "UTF-8"},
                    "Body": {"Text": {"Data": email.body, "Charset": "UTF-8"}},
                }
            },
        )


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
