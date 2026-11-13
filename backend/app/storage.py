"""Content files in S3. Uploads and downloads go straight between the browser and S3 through signed links,
so large videos never pass through Lambda."""
from botocore.exceptions import ClientError


class ContentStorage:
    def __init__(self, s3, bucket: str):
        self.s3 = s3
        self.bucket = bucket

    def presigned_upload(self, key: str, content_type: str, max_bytes: int, expires: int) -> dict:
        """A signed form the browser posts the file to. S3 refuses files outside the size and type rules."""
        return self.s3.generate_presigned_post(
            Bucket=self.bucket,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[
                {"Content-Type": content_type},
                ["content-length-range", 1, max_bytes],
            ],
            ExpiresIn=expires,
        )

    def presigned_download(self, key: str, content_type: str, expires: int) -> str:
        """A short-lived link to one file. S3 supports byte ranges, so video seeking works."""
        return self.s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ResponseContentType": content_type,
                "ResponseContentDisposition": "inline",
            },
            ExpiresIn=expires,
        )

    def size(self, key: str) -> int | None:
        """Size in bytes, or None if the upload never arrived."""
        try:
            return self.s3.head_object(Bucket=self.bucket, Key=key)["ContentLength"]
        except ClientError as error:
            if error.response["Error"]["Code"] in ("404", "NoSuchKey"):
                return None
            raise

    def read_head(self, key: str, count: int = 16) -> bytes:
        """The first few bytes, used to check the file really is a PDF or video."""
        response = self.s3.get_object(Bucket=self.bucket, Key=key, Range=f"bytes=0-{count - 1}")
        return response["Body"].read()

    def delete(self, key: str) -> None:
        self.s3.delete_object(Bucket=self.bucket, Key=key)
