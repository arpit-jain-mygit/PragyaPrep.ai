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

    # Signs login tokens. Must be overridden in production.
    secret_key: str = "dev-only-change-me"
    access_token_minutes: int = 60 * 12

    # How long a download link and an upload form stay valid.
    file_url_seconds: int = 300
    upload_url_seconds: int = 900
    # S3 accepts a single presigned POST of up to 5 GB.
    max_upload_mb: int = 5120

    admin_login_id: str = "admin"
    admin_password: str = "change-me-now"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    frontend_url: str = "http://localhost:4200"
    cors_origins: list[str] = ["http://localhost:4200"]
