"""Announcements: a message to students, shown inside the app and optionally emailed too.

Two sources feed the same Notices:
 - the admin writes one (to everyone, a course, or chosen students), as plain information or as "action needed" with a button;
 - the admin asks for reminders: each student who is behind in a course gets their own message with their own numbers.

Each student gets their own small record per message, so a student's list and unread count are a quick read.
The button can only go to a place inside the app (coursework, tests or results), never to an address typed by the admin.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app import clock, content, coursework, progress
from app.config import Settings
from app.mailer import Email, Mailer, send_quietly
from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

KINDS = ("info", "action")
LINKS = {"coursework": ("Open coursework", "learning"), "tests": ("Open tests", "learning/tests"), "results": ("Open results", "learning/results")}
MAX_TITLE = 120
MAX_MESSAGE = 2000
MAX_EMAILS = 500
REMIND_GAP_HOURS = 24


class NoticeNotFound(Exception):
    pass


# ---- Checking what the admin sends ----

def _text(raw, what: str, longest: int) -> str:
    value = str(raw or "").strip()
    if not 1 <= len(value) <= longest:
        raise ValidationError(f"The {what} must be 1 to {longest} characters.")
    return value


def _link(raw) -> dict | None:
    if raw in (None, ""):
        return None
    if raw not in LINKS:
        raise ValidationError("Choose where the button goes from the list.")
    label, _ = LINKS[raw]
    return {"to": raw, "label": label}


def _emails(raw) -> list[str]:
    if not isinstance(raw, list) or not all(isinstance(e, str) for e in raw):
        raise ValidationError("List the students' email addresses.")
    emails = []
    for e in raw:
        clean = e.strip().lower()
        if clean and clean not in emails:
            emails.append(clean)
    if not emails:
        raise ValidationError("List at least one student's email address.")
    if len(emails) > MAX_EMAILS:
        raise ValidationError(f"You can name up to {MAX_EMAILS} students at a time.")
    return emails


def _approved_students(scoped: TenantRepo) -> list[dict]:
    return [m for m in scoped.all_members_by_status("approved") if m.get("role") == "student"]


def recipients(scoped: TenantRepo, audience) -> tuple[list[dict], dict]:
    """The students an audience means, and the audience as it is stored. Raises ValidationError if it is unusable."""
    if not isinstance(audience, dict) or audience.get("type") not in ("all", "course", "students"):
        raise ValidationError("Choose who to send to: everyone, a course, or chosen students.")
    kind = audience["type"]
    students = _approved_students(scoped)
    if kind == "all":
        chosen, stored = students, {"type": "all"}
    elif kind == "course":
        course_id = audience.get("course_id")
        course = scoped.get_course(course_id) if isinstance(course_id, str) else None
        if course is None:
            raise ValidationError("Choose the course to send to.")

        def has(member: dict) -> bool:
            access = scoped.get_access(member["email"], course_id)
            return access is not None and content.is_active(access)

        with ThreadPoolExecutor(max_workers=16) as pool:
            chosen = [m for m, ok in zip(students, pool.map(has, students)) if ok]
        stored = {"type": "course", "course_id": course_id, "course_name": course["name"]}
    else:
        wanted = _emails(audience.get("emails"))
        by_email = {m["email"]: m for m in students}
        missing = [e for e in wanted if e not in by_email]
        if missing:
            raise ValidationError(f"These aren't approved students: {', '.join(missing[:5])}{' and more' if len(missing) > 5 else ''}.")
        chosen, stored = [by_email[e] for e in wanted], {"type": "students", "count": len(wanted)}
    if not chosen:
        raise ValidationError("There are no students to send this to.")
    return chosen, stored


# ---- Delivering ----

def _email(tenant: dict, settings: Settings, member: dict, notice: dict) -> Email:
    name = tenant["branding"]["display_name"]
    slug = tenant["slug"]
    base = settings.frontend_url.rstrip("/")
    lines = [f"Hello {member.get('first_name') or 'there'},", "", notice["message"], ""]
    if notice.get("link"):
        lines.append(f"{notice['link']['label']}: {base}/{slug}/{LINKS[notice['link']['to']][1]}")
    lines.append(f"All your notices: {base}/{slug}/notices")
    prefix = "Action needed: " if notice["kind"] == "action" else ""
    return Email(to=member["email"], from_name=name, subject=f"{prefix}{notice['title']}", body="\n".join(lines))


def _deliver(scoped: TenantRepo, tenant: dict, settings: Settings, mailer: Mailer, members: list[dict], make_notice, send_email: bool) -> dict:
    """Save each student's notice, then email it if asked. A failed email never undoes the notice."""
    notices = [(member, make_notice(member)) for member in members]
    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(lambda pair: scoped.put_notice(pair[0]["email"], pair[1]), notices))
    emailed = failed = 0
    if send_email:
        for member, notice in notices:
            if send_quietly(mailer, _email(tenant, settings, member, notice)):
                emailed += 1
                scoped.update_notice(member["email"], notice["id"], {"emailed": True})
            else:
                failed += 1
    return {"emailed": emailed, "email_failed": failed}


def announce(scoped: TenantRepo, tenant: dict, settings: Settings, mailer: Mailer, admin_email: str, body: dict) -> dict:
    """Send an announcement to an audience. Returns what was stored, with how many students it reached and how many were emailed."""
    title = _text(body.get("title"), "title", MAX_TITLE)
    message = _text(body.get("message"), "message", MAX_MESSAGE)
    kind = body.get("kind") or "info"
    if kind not in KINDS:
        raise ValidationError("Choose information or action needed.")
    link = _link(body.get("link"))
    if kind == "info" and link:
        raise ValidationError("A button goes with an action-needed message. Choose action needed, or take the button off.")
    send_email = body.get("send_email") is True
    members, audience = recipients(scoped, body.get("audience"))

    announcement_id = uuid4().hex
    created = now_iso()

    def make(member: dict) -> dict:
        return {"id": uuid4().hex, "announcement_id": announcement_id, "title": title, "message": message, "kind": kind, "link": link,
                "source": "manual", "created_at": created, "read_at": None, "emailed": False}

    result = _deliver(scoped, tenant, settings, mailer, members, make, send_email)
    record = {"id": announcement_id, "title": title, "message": message, "kind": kind, "link": link, "source": "manual", "audience": audience,
              "recipients": len(members), "email_requested": send_email, **result, "created_at": created, "created_by": admin_email}
    scoped.create_announcement(record)
    return record


def history(scoped: TenantRepo, limit: int = 100, before: str | None = None) -> tuple[list[dict], str | None]:
    """Announcements, newest first. Returns one page and the cursor for the next page (None when there are no more)."""
    rows = scoped.list_announcements(limit=limit, before=before)
    cursor = rows[-1]["GSI1SK"] if len(rows) == limit and rows else None
    return rows, cursor


def remind(
    scoped: TenantRepo, tenant: dict, settings: Settings, mailer: Mailer, admin_email: str, course_id, emails=None, send_email: bool = True,
) -> dict:
    """Remind the students who are behind in a course, each with a message of their own numbers. Someone already reminded
    about this course in the last day, and who hasn't read it, is skipped so nobody is nagged."""
    course = scoped.get_course(course_id) if isinstance(course_id, str) else None
    if course is None:
        raise coursework.CourseNotFound()
    wanted = None if emails is None else set(_emails(emails))
    rows = progress.students(scoped, course_id)["students"]
    behind = [r for r in rows if r["status"] == "behind" and (wanted is None or r["email"] in wanted)]
    not_behind = 0 if wanted is None else len(wanted - {r["email"] for r in behind})
    cutoff = clock.now() - REMIND_GAP_HOURS * 3600
    members_by_email = {m["email"]: m for m in _approved_students(scoped)}

    def recently_reminded(email: str) -> bool:
        for n in scoped.list_notices(email):
            if n.get("source") == "reminder" and n.get("course_id") == course_id and n.get("read_at") is None:
                if datetime.fromisoformat(n["created_at"]).timestamp() > cutoff:
                    return True
        return False

    with ThreadPoolExecutor(max_workers=16) as pool:
        recent = list(pool.map(lambda r: recently_reminded(r["email"]), behind))
    targets = [r for r, was in zip(behind, recent) if not was and r["email"] in members_by_email]
    skipped = len(behind) - len(targets)
    by_row = {r["email"]: r for r in targets}
    announcement_id = uuid4().hex
    created = now_iso()

    def make(member: dict) -> dict:
        row = by_row[member["email"]]
        parts = []
        if row["cw_overdue"]:
            parts.append(f"{row['cw_overdue']} overdue sub-topic{'s' if row['cw_overdue'] != 1 else ''}")
        if row["tests_overdue"]:
            parts.append(f"{row['tests_overdue']} missed test{'s' if row['tests_overdue'] != 1 else ''}")
        message = f"You have {' and '.join(parts)} in {course['name']}. Please catch up when you can."
        return {"id": uuid4().hex, "announcement_id": announcement_id, "title": f"Action needed in {course['name']}", "message": message,
                "kind": "action", "link": _link("coursework" if row["cw_overdue"] else "tests"), "source": "reminder", "course_id": course_id,
                "created_at": created, "read_at": None, "emailed": False}

    members = [members_by_email[r["email"]] for r in targets]
    result = _deliver(scoped, tenant, settings, mailer, members, make, send_email) if members else {"emailed": 0, "email_failed": 0}
    if members:
        scoped.create_announcement({
            "id": announcement_id, "title": f"Reminder: behind in {course['name']}", "message": "Each student was sent a message with their own overdue items.",
            "kind": "action", "link": None, "source": "reminder", "audience": {"type": "course", "course_id": course_id, "course_name": course["name"]},
            "recipients": len(members), "email_requested": send_email, **result, "created_at": created, "created_by": admin_email,
        })
    return {"reminded": len(members), "skipped": skipped, "not_behind": not_behind, **result}


# ---- What a student sees ----

def _shown(notice: dict) -> dict:
    return {k: notice.get(k) for k in ("id", "title", "message", "kind", "link", "source", "created_at", "read_at")}


def notices_for(scoped: TenantRepo, member: dict) -> dict:
    """The student's notices: unread action-needed first, then other unread, then read ones, newest first within each."""
    notices = [_shown(n) for n in scoped.list_notices(member["email"])]
    notices.sort(key=lambda n: n["created_at"], reverse=True)
    notices.sort(key=lambda n: (n["read_at"] is not None, n["kind"] != "action"))
    unread = [n for n in notices if n["read_at"] is None]
    return {"unread": len(unread), "action_unread": sum(1 for n in unread if n["kind"] == "action"), "notices": notices}


def mark_read(scoped: TenantRepo, member: dict, notice_id: str) -> dict:
    mine = {n["id"]: n for n in scoped.list_notices(member["email"])}
    if notice_id not in mine:
        raise NoticeNotFound()
    if mine[notice_id].get("read_at") is None:
        scoped.update_notice(member["email"], notice_id, {"read_at": now_iso()})
    return notices_for(scoped, member)


def mark_all_read(scoped: TenantRepo, member: dict) -> dict:
    stamp = now_iso()
    for n in scoped.list_notices(member["email"]):
        if n.get("read_at") is None:
            scoped.update_notice(member["email"], n["id"], {"read_at": stamp})
    return notices_for(scoped, member)
