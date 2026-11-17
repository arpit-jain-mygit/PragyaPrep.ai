"""All DynamoDB access lives here. One table, two kinds of data:

Platform data, owned by no tenant:
  TENANT#<slug>              META       a tenant (institute)      GSI1: TENANTS / <slug>

Tenant data. Every key starts with T#<slug>#, so one tenant can never touch another's rows:
  T#<slug>#MEMBER#<email>    PROFILE    a person: registration details, role and status
  T#<slug>#OTP#<email>       CODE       a login code waiting to be used (hashed, expires)
  T#<slug>#COURSE#<id>       META       a course: name, fee, access length   GSI1: T#<slug>#COURSES / name
  T#<slug>#COURSENAME#<name> LOOKUP     keeps course names unique within the institute
  T#<slug>#QUESTION#<id>     META       a question bank question          GSI1: T#<slug>#QUESTIONS / created

Counters for rate limits are platform data too, and expire on their own:
  RATE#<name>#<window>       COUNT      how many times something happened in one time window

Tenant data is reached only through TenantRepo, which is built for one tenant and adds the prefix
to every key it uses. There is no way to read tenant data without naming the tenant.
"""
import re
from datetime import datetime, timezone
from decimal import Decimal

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from app import clock

# Lowercase letters, digits and hyphens, starting with a letter. No '#', so a slug can't change a key's shape.
SLUG_PATTERN = re.compile(r"[a-z][a-z0-9-]{2,29}")


class ConflictError(Exception):
    """A value that must be unique (a tenant slug, or a person's email within a tenant) is already taken."""


def now_iso() -> str:
    """The current time as text. It follows the shared clock, so tests can move it."""
    return datetime.fromtimestamp(clock.now(), tz=timezone.utc).isoformat()


def is_valid_slug(slug: str) -> bool:
    return bool(SLUG_PATTERN.fullmatch(slug))


def _plain_value(value):
    """DynamoDB returns every number as a Decimal, even inside nested records. Turn them back into plain numbers."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {key: _plain_value(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [_plain_value(inner) for inner in value]
    return value


def _plain(item: dict | None) -> dict | None:
    return None if item is None else _plain_value(item)


def _put_new(table, item: dict) -> None:
    """Write an item only if its key is free. Raises ConflictError if it's taken."""
    try:
        table.put_item(Item=item, ConditionExpression="attribute_not_exists(PK)")
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ConflictError() from error
        raise


def _update(table, key: dict, fields: dict) -> None:
    """Change some fields of an existing item. Does nothing if the item doesn't exist."""
    try:
        table.update_item(
            Key=key,
            UpdateExpression="SET " + ", ".join(f"#{name} = :{name}" for name in fields),
            ConditionExpression="attribute_exists(PK)",
            ExpressionAttributeNames={f"#{name}": name for name in fields},
            ExpressionAttributeValues={f":{name}": value for name, value in fields.items()},
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise


class Repo:
    """Platform-level data (tenants), and the way into a tenant's own data."""

    def __init__(self, table):
        self.table = table

    # ---- Tenants ----

    def create_tenant(self, tenant: dict) -> None:
        _put_new(
            self.table,
            {
                "PK": f"TENANT#{tenant['slug']}",
                "SK": "META",
                "GSI1PK": "TENANTS",
                "GSI1SK": tenant["slug"],
                **tenant,
            },
        )

    def get_tenant(self, slug: str) -> dict | None:
        response = self.table.get_item(Key={"PK": f"TENANT#{slug}", "SK": "META"})
        return _plain(response.get("Item"))

    def list_tenants(self) -> list[dict]:
        response = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq("TENANTS"),
        )
        return [_plain(item) for item in response["Items"]]

    def update_tenant(self, slug: str, **fields) -> None:
        _update(self.table, {"PK": f"TENANT#{slug}", "SK": "META"}, fields)

    # ---- The way into one tenant's data ----

    def scoped(self, slug: str) -> "TenantRepo":
        return TenantRepo(self.table, slug)

    # ---- Rate limits ----

    def rate_hit(self, name: str, limit: int, window_seconds: int) -> int | None:
        """Count one use of 'name' in the current time window.

        Returns None if it is still within the limit, or how many seconds to wait if it is over.
        The count goes up in one step inside DynamoDB, so two requests at once can't both slip under the limit.
        """
        now = clock.now()
        window = int(now // window_seconds)
        window_end = (window + 1) * window_seconds
        response = self.table.update_item(
            Key={"PK": f"RATE#{name}#{window}", "SK": "COUNT"},
            UpdateExpression="ADD hits :one SET #ttl = :ttl",
            ExpressionAttributeNames={"#ttl": "ttl"},
            ExpressionAttributeValues={":one": 1, ":ttl": int(window_end + 3600)},
            ReturnValues="UPDATED_NEW",
        )
        if int(response["Attributes"]["hits"]) > limit:
            return max(1, int(window_end - now))
        return None


class TenantRepo:
    """Data access for one tenant. Every key it builds starts with T#<slug>#."""

    def __init__(self, table, slug: str):
        if not is_valid_slug(slug):
            raise ValueError(f"invalid tenant slug: {slug!r}")
        self.table = table
        self.slug = slug
        self._prefix = f"T#{slug}#"

    # ---- Members: people registered with this tenant ----

    def _member_key(self, email: str) -> dict:
        return {"PK": f"{self._prefix}MEMBER#{email.strip().lower()}", "SK": "PROFILE"}

    def _member_item(self, member: dict) -> dict:
        """The row for a person. GSI1 lists people by status, newest first, for the admin's review queue."""
        email = member["email"].strip().lower()
        status = member.get("status", "pending")
        return {
            **member,
            **self._member_key(email),
            "email": email,
            "GSI1PK": f"{self._prefix}MEMBERS#{status}",
            "GSI1SK": f"{member.get('created_at', '')}#{email}",
        }

    def create_member(self, member: dict) -> None:
        _put_new(self.table, self._member_item(member))

    def get_member(self, email: str) -> dict | None:
        response = self.table.get_item(Key=self._member_key(email))
        return _plain(response.get("Item"))

    def update_member(self, email: str, **fields) -> None:
        if "status" in fields:
            fields = {**fields, "GSI1PK": f"{self._prefix}MEMBERS#{fields['status']}"}
        _update(self.table, self._member_key(email), fields)

    def list_members_by_status(self, status: str, limit: int = 200) -> list[dict]:
        """People with this status, newest first."""
        response = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq(f"{self._prefix}MEMBERS#{status}"),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [_plain(item) for item in response["Items"]]

    def transition_member(self, email: str, allowed_from: list[str], to_status: str, **fields) -> bool:
        """Move a person to a new status, but only if they are in one of the allowed statuses right now.

        The check and the change happen in one step, so two admins pressing a button at once can't both win.
        Returns False if the person wasn't in an allowed status.
        """
        names = {"#status": "status"}
        values = {":to": to_status, ":gsi": f"{self._prefix}MEMBERS#{to_status}"}
        sets = ["#status = :to", "GSI1PK = :gsi"]
        for number, (name, value) in enumerate(fields.items()):
            names[f"#f{number}"] = name
            values[f":f{number}"] = value
            sets.append(f"#f{number} = :f{number}")
        placeholders = []
        for number, status in enumerate(allowed_from):
            values[f":from{number}"] = status
            placeholders.append(f":from{number}")
        try:
            self.table.update_item(
                Key=self._member_key(email),
                UpdateExpression="SET " + ", ".join(sets),
                ConditionExpression=f"attribute_exists(PK) AND #status IN ({', '.join(placeholders)})",
                ExpressionAttributeNames=names,
                ExpressionAttributeValues=values,
            )
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return False
            raise
        return True

    def move_member(self, old_email: str, member: dict) -> None:
        """Give a person a new email. The email is part of the key, so this writes the row under the new key,
        then removes the old one. Raises ConflictError if the new email is already in use."""
        _put_new(self.table, self._member_item(member))
        new_email = member["email"]
        for access in self.list_access(old_email):
            self.put_access(new_email, {k: v for k, v in access.items() if k not in ("PK", "SK")})
            self.delete_access(old_email, access["course_id"])
        self.table.delete_item(Key=self._member_key(old_email))

    def replace_rejected_member(self, member: dict) -> bool:
        """Let someone whose registration was rejected register again. Replaces the old row only if it is still rejected."""
        try:
            self.table.put_item(
                Item=self._member_item(member),
                ConditionExpression="#status = :rejected AND #role = :student",
                ExpressionAttributeNames={"#status": "status", "#role": "role"},
                ExpressionAttributeValues={":rejected": "rejected", ":student": "student"},
            )
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return False
            raise
        return True

    # ---- Course files: a course's PDFs and videos, stored under the course's own key ----

    def _file_key(self, course_id: str, file_id: str) -> dict:
        return {"PK": self._course_key(course_id)["PK"], "SK": f"FILE#{file_id}"}

    def create_file(self, file: dict) -> None:
        _put_new(self.table, {**self._file_key(file["course_id"], file["id"]), **file})

    def get_file(self, course_id: str, file_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._file_key(course_id, file_id)).get("Item"))

    def list_files(self, course_id: str) -> list[dict]:
        """A course's files, oldest first."""
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(self._course_key(course_id)["PK"]) & Key("SK").begins_with("FILE#"),
        )
        return sorted((_plain(item) for item in response["Items"]), key=lambda f: (f.get("created_at", ""), f["id"]))

    def finish_file(self, course_id: str, file_id: str, size: int) -> None:
        """Mark an upload as arrived and checked. A half-finished upload has an expiry time, which this removes."""
        self.table.update_item(
            Key=self._file_key(course_id, file_id),
            UpdateExpression="SET #status = :ready, #size = :size REMOVE #ttl",
            ExpressionAttributeNames={"#status": "status", "#size": "size", "#ttl": "ttl"},
            ExpressionAttributeValues={":ready": "ready", ":size": size},
        )

    def delete_file(self, course_id: str, file_id: str) -> None:
        self.table.delete_item(Key=self._file_key(course_id, file_id))

    # ---- Access: which courses a student may open, and until when. Stored with the student ----

    def _access_key(self, email: str, course_id: str) -> dict:
        return {"PK": self._member_key(email)["PK"], "SK": f"ACCESS#{course_id}"}

    def put_access(self, email: str, access: dict) -> None:
        """Give (or renew) access to a course. A later grant replaces the earlier one."""
        self.table.put_item(Item={**self._access_key(email, access["course_id"]), **access})

    def get_access(self, email: str, course_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._access_key(email, course_id)).get("Item"))

    def list_access(self, email: str) -> list[dict]:
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(self._member_key(email)["PK"]) & Key("SK").begins_with("ACCESS#"),
        )
        return sorted((_plain(item) for item in response["Items"]), key=lambda a: a.get("granted_at", ""))

    def delete_access(self, email: str, course_id: str) -> None:
        self.table.delete_item(Key=self._access_key(email, course_id))

    # ---- Login codes ----

    def _otp_key(self, email: str) -> dict:
        return {"PK": f"{self._prefix}OTP#{email.strip().lower()}", "SK": "CODE"}

    def save_otp(self, email: str, code_hash: str, expires_at: float, sent_at: float) -> None:
        """Store a new code for this email. It replaces any earlier code, so only the newest one works."""
        self.table.put_item(
            Item={
                **self._otp_key(email),
                "code_hash": code_hash,
                "expires_at": int(expires_at),
                "sent_at": int(sent_at),
                "attempts": 0,
                # DynamoDB removes the row by itself a while after the code expires.
                "ttl": int(expires_at) + 3600,
            }
        )

    def get_otp(self, email: str) -> dict | None:
        response = self.table.get_item(Key=self._otp_key(email))
        return _plain(response.get("Item"))

    def add_otp_attempt(self, email: str) -> int | None:
        """Count one try against the code. Returns the new count, or None if there is no code."""
        try:
            response = self.table.update_item(
                Key=self._otp_key(email),
                UpdateExpression="ADD attempts :one",
                ConditionExpression="attribute_exists(PK)",
                ExpressionAttributeValues={":one": 1},
                ReturnValues="UPDATED_NEW",
            )
        except ClientError as error:
            if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return None
            raise
        return int(response["Attributes"]["attempts"])

    def delete_otp(self, email: str) -> None:
        self.table.delete_item(Key=self._otp_key(email))

    # ---- Courses ----

    def _course_key(self, course_id: str) -> dict:
        return {"PK": f"{self._prefix}COURSE#{course_id}", "SK": "META"}

    def _course_name_key(self, name: str) -> dict:
        return {"PK": f"{self._prefix}COURSENAME#{name.strip().lower()}", "SK": "LOOKUP"}

    def create_course(self, course: dict) -> None:
        """Save a course. Names are unique within the institute, ignoring capitals."""
        lookup = {**self._course_name_key(course["name"]), "course_id": course["id"]}
        _put_new(self.table, lookup)
        try:
            _put_new(
                self.table,
                {
                    **self._course_key(course["id"]),
                    **course,
                    "GSI1PK": f"{self._prefix}COURSES",
                    "GSI1SK": course["name"].strip().lower(),
                },
            )
        except Exception:
            self.table.delete_item(Key=self._course_name_key(course["name"]))
            raise

    def get_course(self, course_id: str) -> dict | None:
        response = self.table.get_item(Key=self._course_key(course_id))
        return _plain(response.get("Item"))

    def list_courses(self) -> list[dict]:
        """All courses of this institute, in name order."""
        response = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq(f"{self._prefix}COURSES"),
        )
        return [_plain(item) for item in response["Items"]]

    def update_course(self, course_id: str, **fields) -> None:
        _update(self.table, self._course_key(course_id), fields)

    def rename_course(self, course_id: str, old_name: str, new_name: str) -> None:
        """Change a course's name. Raises ConflictError if another course already has that name."""
        if old_name.strip().lower() == new_name.strip().lower():
            _update(self.table, self._course_key(course_id), {"name": new_name})
            return
        _put_new(self.table, {**self._course_name_key(new_name), "course_id": course_id})
        _update(self.table, self._course_key(course_id), {"name": new_name, "GSI1SK": new_name.strip().lower()})
        self.table.delete_item(Key=self._course_name_key(old_name))


    # ---- Question bank ----

    def _question_key(self, question_id: str) -> dict:
        return {"PK": f"{self._prefix}QUESTION#{question_id}", "SK": "META"}

    def create_question(self, question: dict) -> None:
        _put_new(
            self.table,
            {
                **self._question_key(question["id"]),
                **question,
                "GSI1PK": f"{self._prefix}QUESTIONS",
                "GSI1SK": f"{question['created_at']}#{question['id']}",
            },
        )

    def get_question(self, question_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._question_key(question_id)).get("Item"))

    def list_questions(self) -> list[dict]:
        """All of this institute's questions, newest first."""
        items, start = [], None
        while True:
            args = {
                "IndexName": "GSI1",
                "KeyConditionExpression": Key("GSI1PK").eq(f"{self._prefix}QUESTIONS"),
                "ScanIndexForward": False,
            }
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            items += [_plain(item) for item in response["Items"]]
            start = response.get("LastEvaluatedKey")
            if not start:
                return items

    def update_question(self, question_id: str, fields: dict) -> None:
        _update(self.table, self._question_key(question_id), fields)

    def delete_question(self, question_id: str) -> None:
        self.table.delete_item(Key=self._question_key(question_id))

    # ---- Question pictures: uploaded first, then attached to a question ----

    def _image_key(self, image_id: str) -> dict:
        return {"PK": f"{self._prefix}QIMAGE#{image_id}", "SK": "META"}

    def create_image(self, image: dict) -> None:
        # Listed by file name, so an Excel upload can find "circuit1.png" among the pictures uploaded for it.
        _put_new(
            self.table,
            {
                **self._image_key(image["id"]),
                **image,
                "GSI1PK": f"{self._prefix}QIMAGES",
                "GSI1SK": f"{image.get('name', '')}#{image['id']}",
            },
        )

    def find_loose_image(self, name: str) -> dict | None:
        """The newest picture with this file name that is uploaded, checked, and not yet on any question."""
        response = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression=Key("GSI1PK").eq(f"{self._prefix}QIMAGES") & Key("GSI1SK").begins_with(f"{name}#"),
        )
        found = [
            _plain(item)
            for item in response["Items"]
            if item.get("name") == name and item.get("status") == "ready" and not item.get("question_id")
        ]
        return max(found, key=lambda image: (image.get("created_at", ""), image["id"])) if found else None

    def get_image(self, image_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._image_key(image_id)).get("Item"))

    def mark_image_ready(self, image_id: str, size: int) -> None:
        _update(self.table, self._image_key(image_id), {"status": "ready", "size": size})

    def attach_image(self, image_id: str, question_id: str) -> None:
        """Tie a picture to a question. A picture that was never attached has an expiry time, which this removes."""
        self.table.update_item(
            Key=self._image_key(image_id),
            UpdateExpression="SET #q = :q REMOVE #ttl",
            ExpressionAttributeNames={"#q": "question_id", "#ttl": "ttl"},
            ExpressionAttributeValues={":q": question_id},
        )

    def delete_image(self, image_id: str) -> None:
        self.table.delete_item(Key=self._image_key(image_id))
