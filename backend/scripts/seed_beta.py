"""Copy a small, linked sample from the dev table into the beta table.

Beta starts with a few questions, two tests, two courses and five students, instead of the full
dev data. The script only READS from the dev table and only WRITES to the beta table.

Usage (run from the backend folder, with the backend venv):
  .venv/bin/python scripts/seed_beta.py            # show what would be copied (writes nothing)
  .venv/bin/python scripts/seed_beta.py --write    # copy it

What is copied, and why:
  - The institute record (TENANT#aaptprep META).
  - Two published tests, and every question they use, plus the passages those questions use.
    Images are left out, because the image files live in the dev S3 bucket and are not copied.
  - Two courses (their name lookup and their own record). Their video and file items are left out,
    for the same reason.
  - Five students (their profile and course access). Their attempts and progress are left out,
    so beta testers start fresh.
"""

import argparse

import boto3
from boto3.dynamodb.conditions import Attr, Key

DEV_TABLE = "pragyaprep-dev"
BETA_TABLE = "pragyaprep-beta"
REGION = "ap-south-1"
PROFILE = "pragyaprep-dev"
TENANT = "aaptprep"

TEST_COUNT = 2
COURSE_COUNT = 2
STUDENT_COUNT = 5


def scan_all(table, **kwargs):
    """Read every item that matches, following DynamoDB's pages."""
    items = []
    while True:
        page = table.scan(**kwargs)
        items.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            return items
        kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def get_one(table, pk, sk="META"):
    """Read one item by its key, or None when it is missing."""
    return table.get_item(Key={"PK": pk, "SK": sk}).get("Item")


def without_images(item):
    """Drop image references, because the image files are not copied to beta."""
    return {key: value for key, value in item.items() if key != "images"}


def without_avatar(item):
    """Drop the profile photo fields, because the photo file is not copied to beta."""
    return {key: value for key, value in item.items() if not key.startswith("avatar_")}


def choose(dev):
    """Pick the small set of items to copy. Returns a list of (table key, item) pairs."""
    chosen = []

    tenant = get_one(dev, f"TENANT#{TENANT}")
    chosen.append(tenant)

    # Tests: the first published ones, with the questions they use.
    tests = [
        t for t in scan_all(dev, FilterExpression=Attr("PK").begins_with(f"T#{TENANT}#TEST#") & Attr("SK").eq("META"))
        if t.get("status") == "published" and t.get("question_ids")
    ]
    # The smallest tests first, so the beta sample stays small.
    tests = sorted(tests, key=lambda t: len(t["question_ids"]))[:TEST_COUNT]
    question_ids = []
    for test in tests:
        chosen.append(test)
        for question_id in test["question_ids"]:
            if question_id not in question_ids:
                question_ids.append(question_id)

    passage_ids = []
    for question_id in question_ids:
        question = get_one(dev, f"T#{TENANT}#QUESTION#{question_id}")
        if question is None:
            print(f"  note: question {question_id} used by a test is missing in dev, skipped")
            continue
        chosen.append(without_images(question))
        passage_id = question.get("passage")
        if passage_id and passage_id not in passage_ids:
            passage_ids.append(passage_id)
    for passage_id in passage_ids:
        passage = get_one(dev, f"T#{TENANT}#PASSAGE#{passage_id}")
        if passage is not None:
            chosen.append(without_images(passage))

    # Courses: their own record and the name lookup that points at them.
    courses = scan_all(dev, FilterExpression=Attr("PK").begins_with(f"T#{TENANT}#COURSE#") & Attr("SK").eq("META"))
    courses = sorted(courses, key=lambda c: c.get("created_at", ""))[:COURSE_COUNT]
    for course in courses:
        chosen.append(course)
        lookups = scan_all(dev, FilterExpression=Attr("PK").begins_with(f"T#{TENANT}#COURSENAME#") & Attr("SK").eq("LOOKUP") & Attr("course_id").eq(course["id"]))
        chosen.extend(lookups)

    # Students: their profile and course access (not attempts or progress).
    profiles = scan_all(
        dev,
        FilterExpression=Attr("PK").begins_with(f"T#{TENANT}#MEMBER#")
        & Attr("SK").eq("PROFILE")
        & Attr("role").eq("student")
        & Attr("status").eq("approved"),
    )
    profiles = sorted(profiles, key=lambda p: p["PK"])[:STUDENT_COUNT]
    for profile in profiles:
        chosen.append(without_avatar(profile))
        access = dev.query(KeyConditionExpression=Key("PK").eq(profile["PK"]) & Key("SK").begins_with("ACCESS#"))["Items"]
        chosen.extend(access)

    return chosen


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write", action="store_true", help="copy into the beta table (default: only show the plan)")
    args = parser.parse_args()

    session = boto3.Session(profile_name=PROFILE, region_name=REGION)
    dev = session.resource("dynamodb").Table(DEV_TABLE)
    items = [item for item in choose(dev) if item is not None]

    counts = {}
    for item in items:
        kind = item["PK"].split("#")[2] if item["PK"].count("#") >= 2 else item["PK"]
        counts[kind] = counts.get(kind, 0) + 1
    print("Would copy", len(items), "items from", DEV_TABLE, "to", BETA_TABLE)
    for kind in sorted(counts):
        print(f"  {counts[kind]:4d}  {kind}")

    if not args.write:
        print("Nothing written. Run with --write to copy.")
        return

    beta = session.resource("dynamodb").Table(BETA_TABLE)
    with beta.batch_writer() as writer:
        for item in items:
            writer.put_item(Item=item)
    print("Copied", len(items), "items to", BETA_TABLE)


if __name__ == "__main__":
    main()
