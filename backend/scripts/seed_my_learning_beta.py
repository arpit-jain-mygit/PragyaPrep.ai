"""Add sample notices and live classes to the beta institute, so My Learning has something to show.

Only touches the BETA table, for the aaptprep institute, and only for the dummy students (example.com emails).
Live classes go into the course that already has the sample live class, using its subject and topic. Notices go
out through the app's own announcement code, with email off, so no one is emailed.

Usage (dry run, writes nothing):
  .venv/bin/python scripts/seed_my_learning_beta.py
Add them for real:
  .venv/bin/python scripts/seed_my_learning_beta.py --write
"""
import argparse

import boto3

from app import announcements, live_classes
from app.repo import Repo

BETA_TABLE = "pragyaprep-beta"
TENANT = "aaptprep"
PROFILE = "pragyaprep-dev"
REGION = "ap-south-1"
DUMMY_DOMAIN = "@example.com"
ADMIN = "sample-data@aaptprep.example.com"

# Dates after today (21 Nov 2026), so the classes are upcoming.
CLASSES = [
    ("Sample: Percentages and ratios", "2026-11-25", "18:00"),
    ("Sample: Time, speed and distance", "2026-11-28", "18:00"),
    ("Sample: Data interpretation walkthrough", "2026-12-02", "19:00"),
]
NOTICES = [
    ("Sample: class schedule", "Sample notice: upcoming live classes are listed in My Learning under Live classes."),
    ("Sample: welcome to My Learning", "Sample notice: your notices will appear here whenever your institute writes to you."),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write", action="store_true", help="add the samples to beta (without this, nothing is written)")
    args = parser.parse_args()

    table = boto3.Session(profile_name=PROFILE, region_name=REGION).resource("dynamodb").Table(BETA_TABLE)
    repo = Repo(table)
    scoped = repo.scoped(TENANT)
    tenant = repo.get_tenant(TENANT)

    # The course and its subject and topic come from the sample live class that is already on beta.
    sample = None
    for course in scoped.list_courses() if hasattr(scoped, "list_courses") else []:
        found = scoped.list_live(course["id"])
        if found:
            sample, course_id = found[0], course["id"]
            break
    if sample is None:
        raise SystemExit("No sample live class found on beta. Nothing added.")

    students = [m for m in scoped.list_members_by_status("approved") if m.get("role") == "student" and m["email"].endswith(DUMMY_DOMAIN)]
    with_access = [m for m in students if (access := scoped.get_access(m["email"], course_id)) is not None]
    emails = sorted(m["email"] for m in with_access)
    print(f"Course {course_id} (sample class '{sample['title']}'). {len(emails)} dummy students have access.")
    for title, held_on, held_time in CLASSES:
        print(f"  live class: {title} on {held_on} at {held_time}")
    for title, message in NOTICES:
        print(f"  notice: {title}")
    if not args.write:
        print(f"Dry run. Nothing written to {BETA_TABLE}. Run with --write to add them.")
        return
    if not emails:
        raise SystemExit("No dummy students have access to that course. Nothing added.")

    for title, held_on, held_time in CLASSES:
        live_classes.create(
            scoped, course_id,
            {
                "title": title, "held_on": held_on, "held_time": held_time, "status": "published",
                "description": "Sample class, added to try the My Learning screen on beta.",
                "paper_id": sample["paper_id"], "topic_id": sample["topic_id"], "subtopic_id": sample["subtopic_id"],
            },
            ADMIN,
        )
    for title, message in NOTICES:
        announcements.announce(
            scoped, tenant, None, None, ADMIN,
            {"title": title, "message": message, "kind": "info", "audience": {"type": "students", "emails": emails}, "send_email": False},
        )
    print(f"Added {len(CLASSES)} live classes and {len(NOTICES)} notices to {BETA_TABLE}.")


if __name__ == "__main__":
    main()
