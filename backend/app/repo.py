"""All DynamoDB access lives here. The app uses one table with these key patterns:

  USER#<id>             PROFILE           a user: login ID, email, password hash, Google ID, role
  LOGIN#<login_id>      LOOKUP            finds a user by login ID (kept unique)
  EMAIL#<email>         LOOKUP            finds a user by email (kept unique)
  GOOGLE#<sub>          LOOKUP            finds a user by Google account (kept unique)
  COURSE#<id>           META              a course                    GSI1: COURSES / title
  COURSETITLE#<title>   LOOKUP            keeps course titles unique
  CONTENT#<id>          META              a video or PDF              GSI1: COURSE#<id> / CONTENT#<id>
  USER#<id>             GRANT#<course>    a student's access          GSI1: COURSE#<course> / GRANT#<user>
"""
from datetime import datetime, timezone
from decimal import Decimal

from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError


class ConflictError(Exception):
    """A value that must be unique (ID, email, Google account or course title) is already taken."""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _plain(item: dict | None) -> dict | None:
    """DynamoDB returns numbers as Decimal. Turn them back into int so the API returns plain numbers."""
    if item is None:
        return None
    return {key: int(value) if isinstance(value, Decimal) else value for key, value in item.items()}


def _lookup(kind: str, value: str, user_id: str) -> dict:
    return {"PK": f"{kind}#{value}", "SK": "LOOKUP", "user_id": user_id}


class Repo:
    def __init__(self, table):
        self.table = table
        self.name = table.name

    def _claim(self, items: list[dict]) -> None:
        """Write each item only if its key is free. If one is already taken, remove the ones written so far.

        This keeps unique values (login ID, email, Google account, course title) unique.
        """
        written = []
        try:
            for item in items:
                self.table.put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
                written.append(item)
        except ClientError as error:
            for item in written:
                self.table.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise ConflictError() from error
            raise

    # ---- Users ----

    def create_user(self, user: dict) -> None:
        """Save a user. The unique lookups are claimed first, so a clash leaves nothing behind."""
        lookups = [_lookup("LOGIN", user["login_id"], user["id"])]
        if user.get("email"):
            lookups.append(_lookup("EMAIL", user["email"], user["id"]))
        if user.get("google_sub"):
            lookups.append(_lookup("GOOGLE", user["google_sub"], user["id"]))
        self._claim([*lookups, {"PK": f"USER#{user['id']}", "SK": "PROFILE", **user}])

    def get_user(self, user_id: str) -> dict | None:
        response = self.table.get_item(Key={"PK": f"USER#{user_id}", "SK": "PROFILE"})
        return _plain(response.get("Item"))

    def find_user_id(self, kind: str, value: str) -> str | None:
        response = self.table.get_item(Key={"PK": f"{kind}#{value}", "SK": "LOOKUP"})
        item = response.get("Item")
        return item["user_id"] if item else None

    def user_by_login(self, login_id: str) -> dict | None:
        user_id = self.find_user_id("LOGIN", login_id)
        return self.get_user(user_id) if user_id else None

    def user_by_email(self, email: str) -> dict | None:
        user_id = self.find_user_id("EMAIL", email)
        return self.get_user(user_id) if user_id else None

    def link_google(self, user_id: str, google_sub: str) -> None:
        """Attach a Google account to an existing user, if that Google account isn't used yet."""
        self._claim([_lookup("GOOGLE", google_sub, user_id)])
        self.update_user(user_id, google_sub=google_sub)

    def update_user(self, user_id: str, **fields) -> None:
        self.table.update_item(
            Key={"PK": f"USER#{user_id}", "SK": "PROFILE"},
            UpdateExpression="SET " + ", ".join(f"#{name} = :{name}" for name in fields),
            ExpressionAttributeNames={f"#{name}": name for name in fields},
            ExpressionAttributeValues={f":{name}": value for name, value in fields.items()},
        )

    # ---- Courses ----

    def create_course(self, course: dict) -> None:
        title_key = course["title"].lower()
        self._claim(
            [
                {"PK": f"COURSETITLE#{title_key}", "SK": "LOOKUP", "course_id": course["id"]},
                {
                    "PK": f"COURSE#{course['id']}",
                    "SK": "META",
                    "GSI1PK": "COURSES",
                    "GSI1SK": title_key,
                    **course,
                },
            ]
        )

    def get_course(self, course_id: str) -> dict | None:
        response = self.table.get_item(Key={"PK": f"COURSE#{course_id}", "SK": "META"})
        return _plain(response.get("Item"))

    def list_courses(self) -> list[dict]:
        response = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq("COURSES"),
        )
        return [_plain(item) for item in response["Items"]]

    # ---- Content (videos and PDFs) ----

    def create_content(self, content: dict) -> None:
        self.table.put_item(
            Item={
                "PK": f"CONTENT#{content['id']}",
                "SK": "META",
                "GSI1PK": f"COURSE#{content['course_id']}",
                "GSI1SK": f"CONTENT#{content['id']}",
                **content,
            },
            ConditionExpression="attribute_not_exists(PK)",
        )

    def get_content(self, content_id: str) -> dict | None:
        response = self.table.get_item(Key={"PK": f"CONTENT#{content_id}", "SK": "META"})
        return _plain(response.get("Item"))

    def mark_content_ready(self, content_id: str, size_bytes: int) -> None:
        self.table.update_item(
            Key={"PK": f"CONTENT#{content_id}", "SK": "META"},
            UpdateExpression="SET #status = :ready, size_bytes = :size",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":ready": "ready", ":size": size_bytes},
        )

    def delete_content(self, content_id: str) -> None:
        self.table.delete_item(Key={"PK": f"CONTENT#{content_id}", "SK": "META"})

    def list_course_content(self, course_id: str) -> list[dict]:
        """Only ready items. Uploads that haven't been checked yet stay hidden from students."""
        response = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq(f"COURSE#{course_id}") & Key("GSI1SK").begins_with("CONTENT#"),
            FilterExpression=Attr("status").eq("ready"),
        )
        return [_plain(item) for item in response["Items"]]

    # ---- Access grants ----

    def grant(self, user_id: str, course_id: str) -> None:
        """Give a student access to a course. Granting twice does nothing."""
        try:
            self.table.put_item(
                Item={
                    "PK": f"USER#{user_id}",
                    "SK": f"GRANT#{course_id}",
                    "GSI1PK": f"COURSE#{course_id}",
                    "GSI1SK": f"GRANT#{user_id}",
                    "user_id": user_id,
                    "course_id": course_id,
                },
                ConditionExpression="attribute_not_exists(PK)",
            )
        except ClientError as error:
            if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise

    def revoke(self, user_id: str, course_id: str) -> None:
        self.table.delete_item(Key={"PK": f"USER#{user_id}", "SK": f"GRANT#{course_id}"})

    def has_grant(self, user_id: str, course_id: str) -> bool:
        response = self.table.get_item(Key={"PK": f"USER#{user_id}", "SK": f"GRANT#{course_id}"})
        return "Item" in response

    def granted_course_ids(self, user_id: str) -> list[str]:
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("GRANT#"),
        )
        return [item["course_id"] for item in response["Items"]]
