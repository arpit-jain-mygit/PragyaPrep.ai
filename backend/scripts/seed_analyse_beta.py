"""Add sample attempts for the beta dummy students, so the Analyse screens have something to show.

It builds the data in the same order the app does, using the app's own code:
  1. a sample topic practice test for each dummy student (feeds Analyse -> Topic tests),
  2. one sample sectional and one sample mock, open to every dummy student's course (feeds Analyse -> Sectionals and Mocks),
  3. an attempt for each dummy student at each of those, answered with a mix of right, wrong and left-out questions.
Every item is titled with the word "Sample", so it is easy to find and remove later.
Only touches the BETA table, for the aaptprep institute and only the dummy students (example.com emails).
Running it again skips anything already added.

Usage (dry run, writes nothing):
  PYTHONPATH=. .venv/bin/python scripts/seed_analyse_beta.py
Add them for real:
  PYTHONPATH=. .venv/bin/python scripts/seed_analyse_beta.py --write
"""
import argparse
import hashlib
from collections import defaultdict

import boto3

from app import attempts, content, practice, quizzes
from app.repo import Repo

BETA_TABLE = "pragyaprep-beta"
TENANT = "aaptprep"
PROFILE = "pragyaprep-dev"
REGION = "ap-south-1"
ADMIN = "sample-data@aaptprep.example.com"
DUMMY_DOMAIN = "@example.com"

PRACTICE_QUESTIONS = 5
SECTIONAL_QUESTIONS = 15
MOCK_QUESTIONS = 30
SAMPLE_SECTIONAL = "Sample sectional"
SAMPLE_MOCK = "Sample mock"
PRACTICE_PREFIX = "Sample practice"


def _chance(email: str) -> float:
    """How often this student gets an answer right, between 0.35 and 0.85, fixed per student so reruns agree."""
    digest = hashlib.sha256(email.encode()).digest()
    return 0.35 + (digest[0] % 6) * 0.1


def _answer_plan(email: str, question_ids: list[str], bank: dict) -> dict:
    """Answers for the multiple-choice questions only: right for some, wrong for some. The rest are left out."""
    chance = _chance(email)
    given = {}
    for index, question_id in enumerate(question_ids):
        question = bank[question_id]
        if question.get("kind", "mcq") != "mcq" or not isinstance(question.get("correct"), int):
            continue
        digest = hashlib.sha256(f"{email}{question_id}".encode()).digest()[0] / 255
        if digest > 0.9:
            continue  # left out
        correct = question["correct"]
        given[question_id] = correct if digest < chance else (correct + 1) % 4
    return given


def _sample_question_groups(scoped) -> dict[tuple[str, str], list[str]]:
    """Published questions grouped by subject and topic, so each group can be used for practice."""
    groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    for row in scoped.list_questions():
        if row.get("status") == "published" and row.get("paper") and row.get("topic"):
            groups[(row["paper"], row["topic"])].append(row["id"])
    return {key: ids for key, ids in groups.items() if len(ids) >= PRACTICE_QUESTIONS}


def _mixed_ids(groups: dict, per_group: int, total: int) -> list[str]:
    """Questions from many subjects, round robin, so a sectional or mock covers several subjects."""
    picked: list[str] = []
    keys = sorted(groups)
    for position in range(per_group):
        for key in keys:
            if position < len(groups[key]) and len(picked) < total:
                picked.append(groups[key][position])
    return picked


def _take_attempt(scoped, member: dict, test: dict, bank: dict) -> None:
    """Start, answer and submit one attempt, using the app's own functions."""
    started = attempts.start(scoped, member, test["id"])
    given = _answer_plan(member["email"], started["question_ids"], bank)
    if given:
        attempts.save_answers(scoped, None, member, test["id"], started["number"], given)
    final = scoped.get_attempt(member["email"], test["id"], started["number"])
    attempts._finish(scoped, final, auto=False)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write", action="store_true", help="add the samples to beta (without this, nothing is written)")
    args = parser.parse_args()

    table = boto3.Session(profile_name=PROFILE, region_name=REGION).resource("dynamodb").Table(BETA_TABLE)
    repo = Repo(table)
    scoped = repo.scoped(TENANT)

    students = [m for m in scoped.all_members_by_status("approved") if m.get("role", "student") == "student" and m["email"].endswith(DUMMY_DOMAIN)]
    with_courses = {m["email"]: sorted({a["course_id"] for a in scoped.list_access(m["email"]) if content.is_active(a)}) for m in students}
    with_courses = {email: courses for email, courses in with_courses.items() if courses}
    course_ids = sorted({course for courses in with_courses.values() for course in courses})
    groups = _sample_question_groups(scoped)
    bank = {row["id"]: row for row in scoped.list_questions()}
    existing_titles = {test["title"] for test in scoped.list_tests()}
    needs_practice = [e for e in with_courses if not any(p.get("title", "").startswith(PRACTICE_PREFIX) for p in scoped.list_practice(e))]

    print(f"Dummy students with access: {len(with_courses)}; courses they can open: {len(course_ids)}; subjects with enough questions: {len(groups)}.")
    print(f"  topic practice to add: {len(needs_practice)} students")
    print(f"  sectional '{SAMPLE_SECTIONAL} 1': {'exists' if f'{SAMPLE_SECTIONAL} 1' in existing_titles else 'add'}")
    print(f"  mock '{SAMPLE_MOCK} 1': {'exists' if f'{SAMPLE_MOCK} 1' in existing_titles else 'add'}")
    if not args.write:
        print(f"Dry run. Nothing written to {BETA_TABLE}. Run with --write to add them.")
        return
    if not with_courses or not groups:
        raise SystemExit("Nothing to build from. Nothing added.")

    practice_count = 0
    for email in needs_practice:
        member = scoped.get_member(email)
        key = sorted(groups)[int(hashlib.sha256(email.encode()).hexdigest(), 16) % len(groups)]
        ids = groups[key][:PRACTICE_QUESTIONS]
        test = practice.save(scoped, member, f"{PRACTICE_PREFIX}: {key[1]}", ids, email, {"sample": True})
        _take_attempt(scoped, member, test, bank)
        practice_count += 1

    made = {}
    for title, kind, count in ((f"{SAMPLE_SECTIONAL} 1", "sectional", SECTIONAL_QUESTIONS), (f"{SAMPLE_MOCK} 1", "mock", MOCK_QUESTIONS)):
        if title in existing_titles:
            made[kind] = next(t for t in scoped.list_tests() if t["title"] == title)
            continue
        ids = _mixed_ids(groups, per_group=max(1, count // max(1, len(groups))) + 1, total=count)
        made[kind] = quizzes.create_test(scoped, {
            "title": title, "kind": kind, "description": "Sample test, added to try the Analyse screens on beta.",
            "start_at": "2026-11-01 00:00", "end_at": "2027-12-31 23:59", "duration_minutes": 60, "max_attempts": 5,
            "pass_percentage": 50, "marks_correct": 4, "marks_incorrect": -1, "show_answers": True,
            "courses": course_ids, "mode": "manual", "question_ids": ids, "status": "published",
        }, ADMIN)

    attempt_count = 0
    for email, courses in with_courses.items():
        member = scoped.get_member(email)
        for kind, test in made.items():
            if not set(test["courses"]) & set(courses):
                continue
            if any(a["test_id"] == test["id"] for a in scoped.list_attempts(email)):
                continue
            _take_attempt(scoped, member, test, bank)
            attempt_count += 1
    print(f"Added {practice_count} topic practice tests with an attempt each, and {attempt_count} sectional and mock attempts, to {BETA_TABLE}.")


if __name__ == "__main__":
    main()
