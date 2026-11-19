"""Progress for the admin: for one course, how far each student is with the coursework and the tests, who is behind, and
which sub-topics students are not finishing.

Everything comes from what is already stored: sub-topics students marked complete, their test attempts, and who has access.
It is worked out when asked, reading each student's records in parallel, which suits a few hundred students per course.
(For thousands, running totals would be stored instead.)

  Behind       something is overdue: a finish-by date passed on a sub-topic not marked complete, or a test whose window
               closed without a single attempt.
  Not started  nothing marked complete and no test submitted yet.
  On track     everything else.
"""
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from statistics import mean

from app import attempts as attempts_module, avatars, clock, content, coursework, student_coursework
from app.repo import TenantRepo

STATUS_ORDER = {"behind": 0, "not_started": 1, "on_track": 2}


class StudentNotInCourse(Exception):
    pass


def _name(member: dict) -> str:
    return " ".join(p for p in (member.get("first_name"), member.get("last_name")) if p) or member["email"]


def _published(plan: dict) -> list[dict]:
    """Every published sub-topic of the plan, flat, with where it sits."""
    out = []
    for subject in plan["subjects"]:
        for topic in subject["topics"]:
            for sub in topic["subtopics"]:
                if sub["status"] == "published":
                    out.append({"id": sub["id"], "title": sub["title"], "topic": topic["title"], "subject": subject["name"], "due": sub["effective_due"]})
    return out


def approved_students(scoped: TenantRepo) -> list[dict]:
    return [m for m in scoped.all_members_by_status("approved") if m.get("role") == "student"]


def load_records(scoped: TenantRepo, members: list[dict]) -> dict:
    """Each student's course access, finished coursework and test attempts, read once (three reads a student) however many courses
    are looked at afterwards. Pass the result to _gather as `records` when several courses are worked out together."""

    def one(member: dict):
        email = member["email"]
        return email, {"access": {a["course_id"]: a for a in scoped.list_access(email)}, "done": scoped.list_done(email), "attempts": scoped.list_attempts(email)}

    with ThreadPoolExecutor(max_workers=16) as pool:
        return dict(pool.map(one, members))


def _gather(scoped: TenantRepo, course_id: str, only: list[str] | None = None, members: list[dict] | None = None, records: dict | None = None) -> dict:
    """The plan, the course's tests and each student's records. `only` limits it to some students (by email).
    `members` and `records` let a caller that looks at many courses read the students once instead of once per course."""
    plan = coursework.tree(scoped, course_id)
    subs = _published(plan)
    now, today = clock.now(), clock.today_india().isoformat()
    tests = [t for t in scoped.list_tests() if t.get("status") == "published" and course_id in (t.get("courses") or [])]
    window = {t["id"]: attempts_module._window(t, now) for t in tests}
    if members is None:
        members = approved_students(scoped)
    if only is not None:
        members = [m for m in members if m["email"] in only]

    def load(member: dict):
        if records is not None:
            have = records[member["email"]]
            access = have["access"].get(course_id)
            if access is None or not content.is_active(access):
                return None
            return member, {d["subtopic_id"]: d["done_at"] for d in have["done"] if d["course_id"] == course_id}, have["attempts"]
        access = scoped.get_access(member["email"], course_id)
        if access is None or not content.is_active(access):
            return None
        done = {d["subtopic_id"]: d["done_at"] for d in scoped.list_done(member["email"]) if d["course_id"] == course_id}
        return member, done, scoped.list_attempts(member["email"])

    if records is not None:
        loaded = [x for x in map(load, members) if x is not None]
    else:
        with ThreadPoolExecutor(max_workers=16) as pool:
            loaded = [x for x in pool.map(load, members) if x is not None]

    published_ids = {s["id"] for s in subs}
    test_ids = {t["id"] for t in tests}
    students = []
    for member, done, all_attempts in loaded:
        done_ids = set(done) & published_ids
        mine = [a for a in all_attempts if a["test_id"] in test_ids]
        submitted = [a for a in mine if a["status"] == "submitted"]
        best: dict[str, float] = {}
        for a in submitted:
            best[a["test_id"]] = max(best.get(a["test_id"], 0.0), float(a["percentage"]))
        cw_overdue = sum(1 for s in subs if s["due"] and s["due"] < today and s["id"] not in done_ids)
        attempted = {a["test_id"] for a in mine}
        tests_overdue = sum(1 for t in tests if window[t["id"]] == "ended" and t["id"] not in attempted)
        overdue = cw_overdue + tests_overdue
        stamps = [done[i] for i in done_ids] + [a["submitted_at"] for a in submitted if a.get("submitted_at")]
        status = "behind" if overdue else "not_started" if not done_ids and not best else "on_track"
        students.append({
            "email": member["email"], "name": _name(member), "status": status,
            "cw_done": len(done_ids), "cw_total": len(subs), "cw_overdue": cw_overdue,
            "tests_taken": len(best), "tests_available": sum(1 for t in tests if window[t["id"]] != "upcoming"), "tests_overdue": tests_overdue,
            "avg_percent": round(mean(best.values()), 1) if best else None,
            "overdue": overdue, "last_active": max(stamps) if stamps else None,
            "done_ids": done_ids, "avatar_key": member.get("avatar_key") or "",
        })
    return {"plan": plan, "subs": subs, "tests": tests, "students": students}


def students(scoped: TenantRepo, course_id: str, storage=None, members: list[dict] | None = None, records: dict | None = None) -> dict:
    """One row per student with access to the course, those needing attention first, with counts for the top of the page."""
    data = _gather(scoped, course_id, members=members, records=records)
    rows = sorted(data["students"], key=lambda r: (STATUS_ORDER[r["status"]], -r["overdue"], r["name"].lower()))
    rows = [{**{k: v for k, v in r.items() if k not in ("done_ids", "avatar_key")}, "avatar_url": avatars.url_for(storage, r) if storage else ""} for r in rows]
    count = lambda status: sum(1 for r in rows if r["status"] == status)
    return {
        "course": data["plan"]["course"],
        "summary": {"students": len(rows), "behind": count("behind"), "not_started": count("not_started"), "on_track": count("on_track"),
                    "subtopics": len(data["subs"]), "tests": len(data["tests"])},
        "students": rows,
    }


def stuck(scoped: TenantRepo, course_id: str) -> dict:
    """Each published sub-topic with how many of the course's students have marked it complete, the least finished first."""
    data = _gather(scoped, course_id)
    total = len(data["students"])
    items = []
    for sub in data["subs"]:
        finished = sum(1 for s in data["students"] if sub["id"] in s["done_ids"])
        items.append({**sub, "done": finished, "students": total, "percent": round(100 * finished / total) if total else 0})
    items.sort(key=lambda i: (i["percent"], i["due"] or "9999", i["subject"], i["topic"], i["title"]))
    return {"course": data["plan"]["course"], "students": total, "subtopics": items}


def student(scoped: TenantRepo, course_id: str, email: str, storage=None) -> dict:
    """One student in one course: their status, their coursework by subject and topic, what is overdue, and their tests."""
    member = scoped.get_member(email)
    data = _gather(scoped, course_id, only=[email]) if member else {"students": []}
    if not data["students"]:
        raise StudentNotInCourse()
    full = data["students"][0]
    row = {k: v for k, v in full.items() if k not in ("done_ids", "avatar_key")}
    mine = next((c for c in student_coursework.tree(scoped, member)["courses"] if c["id"] == course_id), None)
    overdue_items = []
    for subject in (mine or {}).get("subjects", []):
        for topic in subject["topics"]:
            for sub in topic["subtopics"]:
                if sub["overdue"]:
                    overdue_items.append({"title": sub["title"], "topic": topic["title"], "subject": subject["name"], "due": sub["due"], "days_late": -sub["days_left"]})
    overdue_items.sort(key=lambda i: i["due"])
    tests = []
    for test in sorted(data["tests"], key=lambda t: t["title"].lower()):
        card = attempts_module.test_card(scoped, member, test)
        tests.append({
            "id": test["id"], "title": test["title"], "state": card["state"], "overdue": card["overdue"], "attempts_used": card["attempts_used"],
            "max_attempts": card["max_attempts"], "best": card["best"],
        })
    return {
        "course": data["plan"]["course"], "student": {"email": member["email"], "name": _name(member), "avatar_url": avatars.url_for(storage, full) if storage else ""}, "row": row,
        "coursework": mine, "overdue_items": overdue_items, "tests": tests,
    }


# ---- The admin's Progress page: worked out once, saved, shown instantly ----

CACHE_SECONDS = 15 * 60  # a saved page counts as fresh for this long
THROTTLE_SECONDS = 60  # a refresh asked for within this time returns what is saved
MAX_SAVED_CHARS = 330_000  # one saved item may be up to 400 KB; a bigger course is simply worked out each time


def _build(scoped: TenantRepo, course_id: str) -> dict:
    """Both views of the page, from ONE pass over the records: the student list and where students get stuck."""
    data = _gather(scoped, course_id)
    rows = sorted(data["students"], key=lambda r: (STATUS_ORDER[r["status"]], -r["overdue"], r["name"].lower()))
    rows = [{k: v for k, v in r.items() if k != "done_ids"} for r in rows]
    count = lambda status: sum(1 for r in rows if r["status"] == status)
    total = len(data["students"])
    items = []
    for sub in data["subs"]:
        finished = sum(1 for s in data["students"] if sub["id"] in s["done_ids"])
        items.append({**sub, "done": finished, "students": total, "percent": round(100 * finished / total) if total else 0})
    items.sort(key=lambda i: (i["percent"], i["due"] or "9999", i["subject"], i["topic"], i["title"]))
    return {
        "course": data["plan"]["course"],
        "summary": {"students": len(rows), "behind": count("behind"), "not_started": count("not_started"), "on_track": count("on_track"),
                    "subtopics": len(data["subs"]), "tests": len(data["tests"])},
        "rows": rows,
        "stuck": items,
    }


def _saved_or_build(scoped: TenantRepo, course_id: str, refresh: bool = False) -> tuple[dict, int]:
    """The saved page and when it was worked out. Worked out (and saved) when nothing is saved, or when a refresh was asked for
    and the saved one is over a minute old. Raises coursework.CourseNotFound."""
    if scoped.get_course(course_id) is None:
        raise coursework.CourseNotFound()
    saved = scoped.get_progress_cache(course_id)
    now = clock.now()
    if saved and not (refresh and now - saved["at"] >= THROTTLE_SECONDS):
        return json.loads(saved["json"]), saved["at"]
    built = _build(scoped, course_id)
    text = json.dumps(built)
    at = int(now)
    if len(text) <= MAX_SAVED_CHARS:
        scoped.put_progress_cache(course_id, {"at": at, "json": text})
    return built, at


def _stamp(at: int) -> dict:
    return {"as_of": datetime.fromtimestamp(at, tz=timezone.utc).isoformat(), "fresh": clock.now() - at < CACHE_SECONDS}


def overview(scoped: TenantRepo, course_id: str, storage=None, refresh: bool = False) -> dict:
    """The student list for the Progress page, from the saved page (with when it was worked out and whether it is still fresh)."""
    built, at = _saved_or_build(scoped, course_id, refresh)
    students = [{**{k: v for k, v in r.items() if k != "avatar_key"}, "avatar_url": avatars.url_for(storage, r) if storage else ""} for r in built["rows"]]
    return {"course": built["course"], "summary": built["summary"], "students": students, **_stamp(at)}


def stuck_overview(scoped: TenantRepo, course_id: str, refresh: bool = False) -> dict:
    """Where students get stuck, from the same saved page."""
    built, at = _saved_or_build(scoped, course_id, refresh)
    return {"course": built["course"], "students": built["summary"]["students"], "subtopics": built["stuck"], **_stamp(at)}
