"""AWS clients for DynamoDB and S3, plus helpers that create the resources for local runs and tests."""
import boto3
from botocore.exceptions import ClientError

from app.config import Settings


def make_table(settings: Settings):
    dynamodb = boto3.resource(
        "dynamodb", region_name=settings.aws_region, endpoint_url=settings.dynamodb_endpoint
    )
    return dynamodb.Table(settings.table_name)


def make_s3(settings: Settings):
    # Use the regional endpoint, so signed links point at the region the bucket lives in.
    # The global endpoint redirects in newer regions, and browsers can't follow a redirect on a POST.
    endpoint = settings.s3_endpoint or f"https://s3.{settings.aws_region}.amazonaws.com"
    return boto3.client("s3", region_name=settings.aws_region, endpoint_url=endpoint)


# Secret settings and the SSM parameter name that holds each one under the prefix.
SECRET_SETTINGS = ("secret_key", "admin_password", "google_client_secret")


def load_secrets(settings: Settings) -> Settings:
    """Read secrets from SSM Parameter Store, so they never sit in Lambda environment variables."""
    if not settings.ssm_prefix:
        return settings
    ssm = boto3.client("ssm", region_name=settings.aws_region)
    values = {}
    for name in SECRET_SETTINGS:
        response = ssm.get_parameter(Name=f"{settings.ssm_prefix}/{name}", WithDecryption=True)
        values[name] = response["Parameter"]["Value"]
    return settings.model_copy(update=values)


def ensure_table(table) -> None:
    """Create the single table if it's missing. Terraform does this in AWS."""
    client = table.meta.client
    try:
        client.describe_table(TableName=table.name)
        return
    except ClientError as error:
        if error.response["Error"]["Code"] != "ResourceNotFoundException":
            raise

    client.create_table(
        TableName=table.name,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
            {"AttributeName": "GSI1PK", "AttributeType": "S"},
            {"AttributeName": "GSI1SK", "AttributeType": "S"},
        ],
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "GSI1",
                "KeySchema": [
                    {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                    {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    )
    client.get_waiter("table_exists").wait(TableName=table.name)


def ensure_bucket(s3, bucket: str, region: str) -> None:
    """Create the content bucket if it's missing. Terraform does this in AWS."""
    try:
        s3.head_bucket(Bucket=bucket)
        return
    except ClientError:
        pass

    if region == "us-east-1":
        s3.create_bucket(Bucket=bucket)
    else:
        s3.create_bucket(Bucket=bucket, CreateBucketConfiguration={"LocationConstraint": region})
