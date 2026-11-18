"""Settings, read from PRAGYA_* environment variables. In AWS, Terraform sets them on the Lambda."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PRAGYA_", env_file=".env", extra="ignore")

    # AWS resources. Terraform creates them in AWS. create_resources creates them for local runs and tests.
    aws_region: str = "ap-south-1"
    table_name: str = "pragyaprep"
    bucket_name: str = "pragyaprep-content-dev"
    create_resources: bool = False

    # When set (for example /pragyaprep/dev), secrets are read from SSM Parameter Store at startup.
    ssm_prefix: str = ""

    # Local development only: point boto3 at DynamoDB Local or an S3 emulator.
    dynamodb_endpoint: str | None = None
    s3_endpoint: str | None = None

    # Signs session tokens. Must be overridden in production.
    secret_key: str = "dev-only-change-me"
    # How long a signed-in session lasts before a new emailed code is needed (7 days).
    session_minutes: int = 60 * 24 * 7

    # The institute whose coursework outlines (titles only) the public home page shows, until the platform has courses of its own.
    glimpse_tenant: str = "aaptprep"

    # How long a download link and an upload form stay valid.
    file_url_seconds: int = 300
    upload_url_seconds: int = 900
    # S3 accepts a single presigned POST of up to 5 GB.
    max_upload_mb: int = 5120

    # Email. 'console' prints in the terminal, 'memory' keeps a list (tests), 'ses' sends with Amazon SES.
    email_backend: str = "console"
    email_sender: str = ""

    # Login codes and their limits.
    otp_ttl_seconds: int = 600  # a code works for 10 minutes
    otp_max_attempts: int = 5  # wrong tries allowed per code
    otp_resend_seconds: int = 30  # wait before asking for another code
    otp_requests_per_hour: int = 5  # codes per email, per institute, per hour
    ip_requests_per_hour: int = 20  # code requests from one connection per hour
    ip_verifies_per_hour: int = 60  # code tries from one connection per hour
    registrations_per_hour_per_ip: int = 10  # registration forms from one connection per hour

    frontend_url: str = "http://localhost:4200"
    cors_origins: list[str] = ["http://localhost:4200"]
