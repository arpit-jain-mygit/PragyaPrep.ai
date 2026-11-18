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

    def all_members_by_status(self, status: str) -> list[dict]:
        """Everyone with this status, following the pages of results to the end."""
        items, start = [], None
        while True:
            args = {"IndexName": "GSI1", "KeyConditionExpression": Key("GSI1PK").eq(f"{self._prefix}MEMBERS#{status}")}
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            items += [_plain(item) for item in response["Items"]]
            start = response.get("LastEvaluatedKey")
            if not start:
                return items

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
        for notice in self.list_notices(old_email):
            self.put_notice(new_email, {k: v for k, v in notice.items() if k not in ("PK", "SK")})
            self.table.delete_item(Key=self._notice_key(old_email, notice["id"]))
        for done in self.list_done(old_email):
            self.put_done(new_email, done["course_id"], done["subtopic_id"], done["done_at"])
            self.delete_done(old_email, done["course_id"], done["subtopic_id"])
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

    # ---- Coursework: the learning plan of a course (topics, sub-topics, finish-by dates), stored under the course's own key ----

    def _work_key(self, course_id: str, node_id: str) -> dict:
        return {"PK": self._course_key(course_id)["PK"], "SK": f"WORK#{node_id}"}

    def put_work(self, course_id: str, node: dict) -> None:
        """Write a node of the plan (a subject's date, a topic or a sub-topic), replacing any with the same id."""
        self.table.put_item(Item={**self._work_key(course_id, node["id"]), **node})

    def get_work(self, course_id: str, node_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._work_key(course_id, node_id)).get("Item"))

    def list_work(self, course_id: str) -> list[dict]:
        """Every node of a course's plan, in no particular order."""
        items, start = [], None
        while True:
            args = {"KeyConditionExpression": Key("PK").eq(self._course_key(course_id)["PK"]) & Key("SK").begins_with("WORK#")}
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            items += [_plain(item) for item in response["Items"]]
            start = response.get("LastEvaluatedKey")
            if not start:
                return items

    def update_work(self, course_id: str, node_id: str, fields: dict) -> None:
        _update(self.table, self._work_key(course_id, node_id), fields)

    def delete_work(self, course_id: str, node_id: str) -> None:
        self.table.delete_item(Key=self._work_key(course_id, node_id))

    # ---- Live classes: recordings and slides of a course's live sessions, stored under the course's own key ----

    def _live_key(self, course_id: str, live_id: str) -> dict:
        return {"PK": self._course_key(course_id)["PK"], "SK": f"LIVE#{live_id}"}

    def put_live(self, course_id: str, record: dict) -> None:
        self.table.put_item(Item={**self._live_key(course_id, record["id"]), **record})

    def get_live(self, course_id: str, live_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._live_key(course_id, live_id)).get("Item"))

    def list_live(self, course_id: str) -> list[dict]:
        items, start = [], None
        while True:
            args = {"KeyConditionExpression": Key("PK").eq(self._course_key(course_id)["PK"]) & Key("SK").begins_with("LIVE#")}
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            items += [_plain(item) for item in response["Items"]]
            start = response.get("LastEvaluatedKey")
            if not start:
                return items

    def update_live(self, course_id: str, live_id: str, fields: dict) -> None:
        _update(self.table, self._live_key(course_id, live_id), fields)

    def delete_live(self, course_id: str, live_id: str) -> None:
        self.table.delete_item(Key=self._live_key(course_id, live_id))

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

    # ---- Coursework progress: the sub-topics a student has marked complete. Stored with the student ----

    def _done_key(self, email: str, course_id: str, subtopic_id: str) -> dict:
        return {"PK": self._member_key(email)["PK"], "SK": f"DONE#{course_id}#{subtopic_id}"}

    def put_done(self, email: str, course_id: str, subtopic_id: str, done_at: str, **extra) -> None:
        self.table.put_item(Item={**self._done_key(email, course_id, subtopic_id), "course_id": course_id, "subtopic_id": subtopic_id, "done_at": done_at, **extra})

    def get_done(self, email: str, course_id: str, subtopic_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._done_key(email, course_id, subtopic_id)).get("Item"))

    def list_done(self, email: str) -> list[dict]:
        """Everything this student has marked complete, across courses."""
        items, start = [], None
        while True:
            args = {"KeyConditionExpression": Key("PK").eq(self._member_key(email)["PK"]) & Key("SK").begins_with("DONE#")}
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            items += [_plain(item) for item in response["Items"]]
            start = response.get("LastEvaluatedKey")
            if not start:
                return items

    def delete_done(self, email: str, course_id: str, subtopic_id: str) -> None:
        self.table.delete_item(Key=self._done_key(email, course_id, subtopic_id))

    # ---- Notices: messages to one student (announcements and reminders). Stored with the student ----

    def _notice_key(self, email: str, notice_id: str) -> dict:
        return {"PK": self._member_key(email)["PK"], "SK": f"NOTICE#{notice_id}"}

    def put_notice(self, email: str, notice: dict) -> None:
        self.table.put_item(Item={**self._notice_key(email, notice["id"]), **notice})

    def list_notices(self, email: str) -> list[dict]:
        """Everything sent to this student, in no particular order."""
        items, start = [], None
        while True:
            args = {"KeyConditionExpression": Key("PK").eq(self._member_key(email)["PK"]) & Key("SK").begins_with("NOTICE#")}
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            items += [_plain(item) for item in response["Items"]]
            start = response.get("LastEvaluatedKey")
            if not start:
                return items

    def update_notice(self, email: str, notice_id: str, fields: dict) -> None:
        _update(self.table, self._notice_key(email, notice_id), fields)

    # ---- Announcements: what the admin sent, kept as a history ----

    def _announcement_key(self, announcement_id: str) -> dict:
        return {"PK": f"{self._prefix}ANNOUNCEMENT#{announcement_id}", "SK": "META"}

    def create_announcement(self, record: dict) -> None:
        _put_new(self.table, {**self._announcement_key(record["id"]), **record, "GSI1PK": f"{self._prefix}ANNOUNCEMENTS", "GSI1SK": f"{record['created_at']}#{record['id']}"})

    def list_announcements(self, limit: int = 100) -> list[dict]:
        """The most recent announcements, newest first."""
        response = self.table.query(
            IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(f"{self._prefix}ANNOUNCEMENTS"), ScanIndexForward=False, Limit=limit,
        )
        return [_plain(item) for item in response["Items"]]

    def delete_access(self, email: str, course_id: str) -> None:
        self.table.delete_item(Key=self._access_key(email, course_id))

    # ---- Test attempts: stored with the student, so a student can only ever reach their own ----

    def _attempt_key(self, email: str, test_id: str, number: int) -> dict:
        return {"PK": self._member_key(email)["PK"], "SK": f"ATTEMPT#{test_id}#{number:03d}"}

    def create_attempt(self, attempt: dict) -> None:
        """Save a new attempt. Raises ConflictError if that attempt number already exists (two clicks at once)."""
        _put_new(
            self.table,
            {
                **self._attempt_key(attempt["email"], attempt["test_id"], attempt["number"]),
                **attempt,
                # So the admin can list everyone's attempts at one test later.
                "GSI1PK": f"{self._prefix}ATTEMPTS#{attempt['test_id']}",
                "GSI1SK": f"{attempt['started_at']}#{attempt['email']}",
            },
        )

    def get_attempt(self, email: str, test_id: str, number: int) -> dict | None:
        return _plain(self.table.get_item(Key=self._attempt_key(email, test_id, number)).get("Item"))

    def list_attempts(self, email: str, test_id: str | None = None) -> list[dict]:
        """A student's attempts, oldest first: all of them, or those at one test."""
        prefix = f"ATTEMPT#{test_id}#" if test_id else "ATTEMPT#"
        response = self.table.query(
            KeyConditionExpression=Key("PK").eq(self._member_key(email)["PK"]) & Key("SK").begins_with(prefix),
        )
        return [_plain(item) for item in response["Items"]]

    def list_test_attempts(self, test_id: str) -> list[dict]:
        """Every student's attempts at one test, oldest first (for the admin's results)."""
        items, start = [], None
        while True:
            args = {"IndexName": "GSI1", "KeyConditionExpression": Key("GSI1PK").eq(f"{self._prefix}ATTEMPTS#{test_id}")}
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            items += [_plain(item) for item in response["Items"]]
            start = response.get("LastEvaluatedKey")
            if not start:
                return items

    def count_test_attempt(self, test_id: str, by: int = 1) -> None:
        """Attempts have been started at this test (by is negative when some are removed). Kept on the test so lists needn't count."""
        try:
            self.table.update_item(
                Key=self._test_key(test_id),
                UpdateExpression="ADD attempt_count :one",
                ConditionExpression="attribute_exists(PK)",
                ExpressionAttributeValues={":one": by},
            )
        except ClientError as error:
            if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise

    def update_attempt(self, email: str, test_id: str, number: int, fields: dict) -> None:
        _update(self.table, self._attempt_key(email, test_id, number), fields)

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

    def count_questions(self) -> dict:
        """How many questions are published and how many are drafts, reading only each question's status."""
        counts = {"published": 0, "draft": 0}
        start = None
        while True:
            args = {
                "IndexName": "GSI1",
                "KeyConditionExpression": Key("GSI1PK").eq(f"{self._prefix}QUESTIONS"),
                "ProjectionExpression": "#status",
                "ExpressionAttributeNames": {"#status": "status"},
            }
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            for item in response["Items"]:
                counts["published" if item.get("status") == "published" else "draft"] += 1
            start = response.get("LastEvaluatedKey")
            if not start:
                return counts

    def update_question(self, question_id: str, fields: dict) -> None:
        _update(self.table, self._question_key(question_id), fields)

    def set_questions_fields(self, question_ids: list[str], fields: dict) -> None:
        """Set the same text fields on many questions at once, several at a time, so thousands finish within a request.

        Uses the table's client (safe to share between threads) rather than the table object."""
        from concurrent.futures import ThreadPoolExecutor

        client = self.table.meta.client
        name = self.table.name
        names = {f"#{key}": key for key in fields}
        values = {f":{key}": str(value) for key, value in fields.items()}
        expression = "SET " + ", ".join(f"#{key} = :{key}" for key in fields)

        def one(question_id: str) -> None:
            key = self._question_key(question_id)
            try:
                client.update_item(
                    TableName=name,
                    Key=key,
                    UpdateExpression=expression,
                    ConditionExpression="attribute_exists(PK)",
                    ExpressionAttributeNames=names,
                    ExpressionAttributeValues=values,
                )
            except ClientError as error:
                if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
                    raise

        with ThreadPoolExecutor(max_workers=16) as pool:
            list(pool.map(one, question_ids))

    def delete_question(self, question_id: str) -> None:
        self.table.delete_item(Key=self._question_key(question_id))

    # ---- Reading passages ----

    def _passage_key(self, passage_id: str) -> dict:
        return {"PK": f"{self._prefix}PASSAGE#{passage_id}", "SK": "META"}

    def create_passage(self, passage: dict) -> None:
        _put_new(
            self.table,
            {
                **self._passage_key(passage["id"]),
                **passage,
                "GSI1PK": f"{self._prefix}PASSAGES",
                "GSI1SK": f"{' '.join(passage['title'].lower().split())}#{passage['id']}",
            },
        )

    def get_passage(self, passage_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._passage_key(passage_id)).get("Item"))

    def list_passages(self) -> list[dict]:
        """All of this institute's passages, by title."""
        items, start = [], None
        while True:
            args = {"IndexName": "GSI1", "KeyConditionExpression": Key("GSI1PK").eq(f"{self._prefix}PASSAGES")}
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            items += [_plain(item) for item in response["Items"]]
            start = response.get("LastEvaluatedKey")
            if not start:
                return items

    def update_passage(self, passage_id: str, fields: dict) -> None:
        if "title" in fields:
            fields = {**fields, "GSI1SK": f"{' '.join(fields['title'].lower().split())}#{passage_id}"}
        _update(self.table, self._passage_key(passage_id), fields)

    def delete_passage(self, passage_id: str) -> None:
        self.table.delete_item(Key=self._passage_key(passage_id))

    # ---- Tests (quizzes) ----

    def _test_key(self, test_id: str) -> dict:
        return {"PK": f"{self._prefix}TEST#{test_id}", "SK": "META"}

    def create_test(self, test: dict) -> None:
        _put_new(
            self.table,
            {
                **self._test_key(test["id"]),
                **test,
                "GSI1PK": f"{self._prefix}TESTS",
                "GSI1SK": f"{test['created_at']}#{test['id']}",
            },
        )

    def create_practice(self, test: dict) -> None:
        """A practice test made for one student. It is kept under that student, never in the institute's list of tests."""
        _put_new(
            self.table,
            {**self._test_key(test["id"]), **test, "GSI1PK": f"{self._prefix}PRACTICE#{test['practice_for']}", "GSI1SK": f"{test['created_at']}#{test['id']}"},
        )

    def list_practice(self, email: str) -> list[dict]:
        """A student's practice tests, newest first."""
        response = self.table.query(IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(f"{self._prefix}PRACTICE#{email}"), ScanIndexForward=False)
        return [_plain(item) for item in response["Items"]]

    def get_test(self, test_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._test_key(test_id)).get("Item"))

    def list_tests(self) -> list[dict]:
        """All of this institute's tests, newest first."""
        items, start = [], None
        while True:
            args = {"IndexName": "GSI1", "KeyConditionExpression": Key("GSI1PK").eq(f"{self._prefix}TESTS"), "ScanIndexForward": False}
            if start:
                args["ExclusiveStartKey"] = start
            response = self.table.query(**args)
            items += [_plain(item) for item in response["Items"]]
            start = response.get("LastEvaluatedKey")
            if not start:
                return items

    def update_test(self, test_id: str, fields: dict) -> None:
        _update(self.table, self._test_key(test_id), fields)

    def delete_test(self, test_id: str) -> None:
        self.table.delete_item(Key=self._test_key(test_id))

    # ---- Student photos for a bulk import: uploaded first (by file name), then attached to a student ----

    def _photo_key(self, photo_id: str) -> dict:
        return {"PK": f"{self._prefix}SPHOTO#{photo_id}", "SK": "META"}

    def create_photo(self, photo: dict) -> None:
        _put_new(self.table, {**self._photo_key(photo["id"]), **photo, "GSI1PK": f"{self._prefix}SPHOTOS", "GSI1SK": f"{photo.get('name', '')}#{photo['id']}"})

    def find_loose_photo(self, name: str) -> dict | None:
        """The newest photo with this file name that is uploaded, checked and not yet on any student."""
        response = self.table.query(
            IndexName="GSI1", KeyConditionExpression=Key("GSI1PK").eq(f"{self._prefix}SPHOTOS") & Key("GSI1SK").begins_with(f"{name}#"),
        )
        found = [_plain(i) for i in response["Items"] if i.get("name") == name and i.get("status") == "ready" and not i.get("student")]
        return max(found, key=lambda p: (p.get("created_at", ""), p["id"])) if found else None

    def get_photo(self, photo_id: str) -> dict | None:
        return _plain(self.table.get_item(Key=self._photo_key(photo_id)).get("Item"))

    def mark_photo_ready(self, photo_id: str, size: int) -> None:
        _update(self.table, self._photo_key(photo_id), {"status": "ready", "size": size})

    def attach_photo(self, photo_id: str, email: str) -> None:
        """Tie a photo to a student. A photo that was never attached has an expiry time, which this removes."""
        self.table.update_item(
            Key=self._photo_key(photo_id), UpdateExpression="SET #s = :s REMOVE #ttl",
            ExpressionAttributeNames={"#s": "student", "#ttl": "ttl"}, ExpressionAttributeValues={":s": email},
        )

    def delete_photo(self, photo_id: str) -> None:
        self.table.delete_item(Key=self._photo_key(photo_id))

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
