"""Demo student data: students for each course, and their test results.

It makes approved students (with genuine-looking Indian names, addresses and dummy phone numbers), gives each access to
their course, and has them take tests of that course so the admin's Results pages and the students' My results pages
have something real to show. Every record it writes is tagged (`demo_seed`), so it can be listed and removed again.

The attempts go through the app's own code (start, save answers, hand in, score), with the clock set to times in the
past, so the stored results are exactly what a real student's would be.

Run from the backend folder, with AWS credentials in the environment. For the dev environment:

  export AWS_PROFILE=pragyaprep-dev PRAGYA_TABLE_NAME=pragyaprep-dev PYTHONPATH=.
  .venv/bin/python scripts/student_data/seed_students.py plan   --slug aaptprep
  .venv/bin/python scripts/student_data/seed_students.py create --slug aaptprep
  .venv/bin/python scripts/student_data/seed_students.py status --slug aaptprep
  .venv/bin/python scripts/student_data/seed_students.py remove --slug aaptprep

  --per-course 10     students for each open course (default 10)
  --seed 2026         the same seed gives the same students and the same scores
  --batch demo-students-v1   the tag put on everything this run writes

Emails use example.com (reserved for examples), so nothing can reach a real inbox. These students can't log in, because
nobody can receive their login codes; they are for looking at the admin's and students' result screens.
"""
import argparse
import math
import random
import sys
import time
from datetime import date, datetime, timedelta, timezone

from boto3.dynamodb.conditions import Attr, Key

from app import attempts, clock, content
from app.aws import make_table
from app.config import Settings
from app.repo import Repo, now_iso
from scripts.student_data import names

DEFAULT_BATCH = "demo-students-v1"
EMAIL_DOMAIN = "example.com"
DAY = 86400
TWO_COURSE_STUDENTS = 4  # students who chose two courses, to show that a student can have several


# ---- The students ----

def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


def make_students(courses: list[dict], per_course: int, seed: int, batch: str, admin_email: str, now: float) -> list[dict]:
    """Registration records for `per_course` students of each course, deterministic for a seed. Nothing is saved here."""
    rng = random.Random(f"{seed}:students")
    used_emails: set[str] = set()
    used_names: set[tuple[str, str]] = set()
    students: list[dict] = []
    for course in courses:
        for _ in range(per_course):
            gender = rng.choice(["female", "male"])
            while True:
                first = rng.choice(names.FEMALE if gender == "female" else names.MALE)
                last = rng.choice(names.SURNAMES)
                if (first, last) not in used_names:
                    used_names.add((first, last))
                    break
            local = f"{first}.{last}".lower()
            email = f"{local}@{EMAIL_DOMAIN}"
            if email in used_emails:
                email = f"{local}{rng.randint(1, 99):02d}@{EMAIL_DOMAIN}"
            used_emails.add(email)
            born = date(rng.randint(1999, 2008), rng.randint(1, 12), rng.randint(1, 28))
            locality, city, pin = rng.choice(names.PLACES)
            house = rng.choice([f"B-{rng.randint(1, 450)}", f"H.No. {rng.randint(1, 900)}", f"Flat {rng.randint(101, 1204)}", f"{rng.randint(1, 250)}/{rng.randint(1, 40)}"])
            mobile = f"90000{len(students) + 10001:05d}"  # dummy, in sequence, so they are plainly not real numbers
            registered = now - rng.randint(25, 70) * DAY - rng.randint(0, DAY - 1)
            students.append({
                "email": email, "role": "student", "status": "approved", "first_name": first, "last_name": last,
                "birth_date": born.isoformat(), "gender": gender, "mobile": mobile, "whatsapp": mobile,
                "address": f"{house}, {locality}", "city": city, "pin_code": pin,
                "course_ids": [course["id"]], "course_names": [course["name"]], "course_id": course["id"], "course_name": course["name"],
                "created_at": _iso(registered), "decided_by": admin_email, "decided_at": _iso(registered + DAY),
                "demo_seed": batch,
            })
    # A few students chose two courses.
    if len(courses) > 1:
        for student in rng.sample(students, min(TWO_COURSE_STUDENTS, len(students))):
            other = rng.choice([c for c in courses if c["id"] != student["course_id"]])
            student["course_ids"].append(other["id"])
            student["course_names"].append(other["name"])
    return students


# ---- Taking tests ----

LEVEL_SHIFT = {"easy": 0.16, "medium": 0.0, "hard": -0.2}


class Taker:
    """How one student answers: an overall ability, a feel for each topic, and a slow improvement."""

    def __init__(self, email: str, seed: int):
        self.rng = random.Random(f"{seed}:{email}")
        self.ability = min(0.92, max(0.28, self.rng.gauss(0.62, 0.16)))
        self.topic_feel: dict[str, float] = {}
        self.taken = 0

    def _feel(self, topic: str) -> float:
        if topic not in self.topic_feel:
            self.topic_feel[topic] = self.rng.uniform(-0.14, 0.14)
        return self.topic_feel[topic]

    def answers_for(self, questions: list[dict]) -> dict:
        """An answer for most questions (some are left blank). The chance of being right depends on the question."""
        given: dict = {}
        for question in questions:
            level = question.get("difficulty") or "medium"
            blank = 0.03 + (0.1 if level == "hard" else 0.03 if level == "medium" else 0.0)
            if self.rng.random() < blank:
                continue
            chance = self.ability + LEVEL_SHIFT.get(level, 0) + self._feel(question["topic"]) + 0.03 * min(self.taken, 4)
            right = self.rng.random() < min(0.97, max(0.06, chance))
            if question.get("kind", "mcq") == "mcq":
                options = list(range(len(question["options"])))
                given[question["id"]] = question["correct"] if right else self.rng.choice([o for o in options if o != question["correct"]])
            else:
                answer = question["answer"]
                if answer["type"] == "number":
                    from decimal import Decimal
                    value = Decimal(answer["value"])
                    given[question["id"]] = str(value if right else value + Decimal(self.rng.choice([-7, -3, 5, 11])) + Decimal(answer["tolerance"]))
                else:
                    given[question["id"]] = answer["accepted"][0] if right else "not sure"
        self.taken += 1
        return given


def take_test(scoped, member: dict, test: dict, bank: dict[str, dict], taker: Taker, start_at: float) -> dict:
    """One attempt through the app's own code, with the clock set to when it happened. Returns the finished attempt."""
    clock.now = lambda: start_at
    attempt = attempts.start(scoped, member, test["id"])
    questions = [bank[i] for i in attempt["question_ids"] if i in bank]
    given = taker.answers_for(questions)
    rng = taker.rng
    seconds = attempt["duration_minutes"] * 60
    runs_out = rng.random() < 0.05
    saved_at = start_at + seconds * rng.uniform(0.4, 0.85)
    handed_in_at = (attempt["deadline"] + 20) if runs_out else start_at + seconds * rng.uniform(0.55, 0.97)
    # A student who runs out of time has only answered part of it.
    saved = dict(list(given.items())[: max(1, len(given) // 2)]) if runs_out else given
    if saved:
        clock.now = lambda: saved_at
        attempts.save_answers(scoped, None, member, test["id"], attempt["number"], saved)
    clock.now = lambda: handed_in_at
    fresh = scoped.get_attempt(member["email"], test["id"], attempt["number"])
    return attempts._finish(scoped, fresh, auto=runs_out)


def schedule(rng: random.Random, count: int, earliest: float, latest: float) -> list[float]:
    """`count` times between the two moments, in order."""
    return sorted(rng.uniform(earliest, latest) for _ in range(count))


# ---- Commands ----

def _scope(repo: Repo, slug: str):
    tenant = repo.get_tenant(slug)
    if tenant is None:
        raise SystemExit(f"No institute called '{slug}'.")
    return repo.scoped(slug), tenant


def open_courses(scoped) -> list[dict]:
    return sorted((c for c in scoped.list_courses() if c.get("active", True)), key=lambda c: c["name"])


def _admin_email(tenant: dict) -> str:
    return tenant.get("admin_email") or "admin@example.com"


def _tests_for(scoped, student: dict) -> list[dict]:
    mine = set(student["course_ids"])
    return [t for t in scoped.list_tests() if t.get("status") == "published" and t.get("question_ids") and mine & set(t.get("courses") or [])]


def plan(repo: Repo, slug: str, per_course: int, seed: int, batch: str) -> list[dict]:
    scoped, tenant = _scope(repo, slug)
    courses = open_courses(scoped)
    students = make_students(courses, per_course, seed, batch, _admin_email(tenant), time.time())
    for student in students:
        pool = _tests_for(scoped, student)
        print(f"{student['first_name']} {student['last_name']:<12} {student['email']:<36} {', '.join(student['course_names']):<14} {student['city']:<11} {len(pool)} tests available")
    print(f"\n{len(students)} students for {len(courses)} courses ({', '.join(c['name'] for c in courses)}). Nothing has been written.")
    return students


def create(repo: Repo, slug: str, per_course: int, seed: int, batch: str, log=print) -> dict:
    """Save the students, give them access, and have them take tests. Safe to run again: an email that exists is skipped."""
    scoped, tenant = _scope(repo, slug)
    real_now = time.time()
    courses = open_courses(scoped)
    students = make_students(courses, per_course, seed, batch, _admin_email(tenant), real_now)
    bank = {q["id"]: q for q in scoped.list_questions()}
    made = skipped = taken = 0
    original_now, original_window = clock.now, attempts._window
    attempts._window = lambda test, now: "open"  # the tests' own windows start today; these attempts happened earlier
    try:
        for student in students:
            email = student["email"]
            if scoped.get_member(email) is not None:
                skipped += 1
                continue
            scoped.create_member(student)
            made += 1
            registered = datetime.fromisoformat(student["created_at"]).timestamp()
            clock.now = lambda registered=registered: registered + DAY + 3600
            for course_id in student["course_ids"]:
                content.grant_access(scoped, email, course_id, student["decided_by"], source="seed")
            member = scoped.get_member(email)
            taker = Taker(email, seed)
            pool = _tests_for(scoped, member)
            if not pool:
                continue
            rng = taker.rng
            wanted = min(len(pool), rng.randint(3, 7))
            chosen = rng.sample(pool, wanted)
            # Some students retake a test, a little better prepared each time.
            plan_ = [(t, 1) for t in chosen] + [(t, 2) for t in rng.sample(chosen, rng.randint(0, min(2, wanted)))]
            times = schedule(rng, len(plan_), max(registered + 2 * DAY, real_now - 28 * DAY), real_now - 3 * 3600)
            for (test, _round), moment in zip(sorted(plan_, key=lambda p: p[1]), times):
                try:
                    take_test(scoped, member, test, bank, taker, moment)
                    taken += 1
                except attempts.CannotStart:
                    continue  # used up the test's attempts
            log(f"  {student['first_name']} {student['last_name']} ({', '.join(student['course_names'])}): {len(scoped.list_attempts(email))} attempts")
    finally:
        clock.now, attempts._window = original_now, original_window
    return {"students": made, "skipped": skipped, "attempts": taken}


def _tagged_members(repo: Repo, slug: str, batch: str) -> list[dict]:
    table = repo.table
    prefix = f"T#{slug}#MEMBER#"
    items, kwargs = [], {"FilterExpression": Attr("PK").begins_with(prefix) & Attr("SK").eq("PROFILE") & Attr("demo_seed").eq(batch)}
    while True:
        response = table.scan(**kwargs)
        items += response["Items"]
        if "LastEvaluatedKey" not in response:
            return items
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]


def status(repo: Repo, slug: str, batch: str) -> dict:
    scoped, _ = _scope(repo, slug)
    members = _tagged_members(repo, slug, batch)
    per_course: dict[str, int] = {}
    total = 0
    for member in members:
        for name in member.get("course_names") or [member.get("course_name", "?")]:
            per_course[name] = per_course.get(name, 0) + 1
        total += len(scoped.list_attempts(member["email"]))
    print(f"{len(members)} demo students ({batch}); attempts: {total}")
    for name, count in sorted(per_course.items()):
        print(f"  {name}: {count} students")
    return {"students": len(members), "attempts": total, "per_course": per_course}


def remove(repo: Repo, slug: str, batch: str, dry_run: bool = False) -> dict:
    """Delete every demo student of this batch with their access and attempts, and take their attempts off the tests' counts."""
    scoped, _ = _scope(repo, slug)
    table = repo.table
    members = _tagged_members(repo, slug, batch)
    removed_items = 0
    per_test: dict[str, int] = {}
    for member in members:
        items = table.query(KeyConditionExpression=Key("PK").eq(member["PK"]))["Items"]
        for item in items:
            if item["SK"].startswith("ATTEMPT#"):
                per_test[item["test_id"]] = per_test.get(item["test_id"], 0) + 1
            if not dry_run:
                table.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            removed_items += 1
    if not dry_run:
        for test_id, count in per_test.items():
            scoped.count_test_attempt(test_id, -count)
    verb = "Would remove" if dry_run else "Removed"
    print(f"{verb} {len(members)} demo students ({batch}), {removed_items} records, attempts at {len(per_test)} tests.")
    return {"students": len(members), "records": removed_items, "tests": len(per_test)}


# ---- The command line ----

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Demo students and their test results.")
    commands = parser.add_subparsers(dest="command", required=True)
    for name, help_text in (
        ("plan", "Show the students that would be made, and write nothing"),
        ("create", "Make the students, give them access, and have them take tests"),
        ("status", "Count the demo students and their attempts"),
        ("remove", "Delete every demo student of the batch, with their attempts"),
    ):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("--slug", required=True, help="The institute, for example aaptprep")
        command.add_argument("--batch", default=DEFAULT_BATCH)
        if name in ("plan", "create"):
            command.add_argument("--per-course", type=int, default=10)
            command.add_argument("--seed", type=int, default=2026)
        if name == "remove":
            command.add_argument("--dry-run", action="store_true")
    return parser


def main(argv: list[str] | None = None, repo: Repo | None = None) -> int:
    args = build_parser().parse_args(argv)
    repo = repo or Repo(make_table(Settings()))
    if args.command == "plan":
        plan(repo, args.slug, args.per_course, args.seed, args.batch)
    elif args.command == "create":
        result = create(repo, args.slug, args.per_course, args.seed, args.batch)
        print(f"Made {result['students']} students ({result['skipped']} already existed) and {result['attempts']} attempts.")
    elif args.command == "status":
        status(repo, args.slug, args.batch)
    elif args.command == "remove":
        remove(repo, args.slug, args.batch, args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
