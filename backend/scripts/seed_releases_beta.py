"""Add a few Daily RC passages and one Weekly DILR set to the beta institute, so the dashboard, the Daily RC and
Weekly DILR pages, and the admin Releases page have something to show.

Everything added is marked with the word "Sample" in its title, so it is easy to find and remove later.
Only touches the BETA table, for the aaptprep institute. Each passage gets two published questions that belong to it.

Usage (dry run, writes nothing):
  .venv/bin/python scripts/seed_releases_beta.py
Add them for real:
  .venv/bin/python scripts/seed_releases_beta.py --write
"""
import argparse
from datetime import date, timedelta
from uuid import uuid4

import boto3

from app import clock, questions, releases
from app.papers import BY_ID
from app.passages import create_passage
from app.repo import Repo, now_iso

BETA_TABLE = "pragyaprep-beta"
TENANT = "aaptprep"
PROFILE = "pragyaprep-dev"
REGION = "ap-south-1"
ADMIN = "sample-data@aaptprep.example.com"

PASSAGE_TEXT = {
    "Daily RC": "Sample passage. Cities that plan their transport early tend to grow more evenly. Buses, metro lines and footpaths "
                "built before housing spreads keep travel times short. Cities that wait often pay more later to fix congestion, "
                "and the poorest residents usually bear most of that cost.",
    "Weekly DILR": "Sample set. A school runs three clubs. Every student joins at least one. Twelve students are in the music club, "
                   "fifteen in the debate club and nine in the art club. Seven students are in both music and debate, four in both "
                   "music and art, and five in both debate and art. Two students are in all three clubs.",
}
QUESTIONS = {
    "Daily RC": [
        ("Sample: what does the passage say about early planning?", ["Cities grow more evenly", "Housing is cheaper", "Roads are not needed", "Buses are banned"], 0),
        ("Sample: who pays most when congestion is fixed late?", ["The poorest residents", "The city council only", "Bus drivers", "No one"], 0),
    ],
    "Weekly DILR": [
        ("Sample: how many students are in at least one club?", ["Twenty-two", "Twenty-eight", "Thirty-four", "Thirty-six"], 0),
        ("Sample: how many students are in exactly one club?", ["Nine", "Ten", "Eleven", "Twelve"], 1),
    ],
}
# Each release: (kind, title key, start date). Daily RC: one a day, today and the two days before. Weekly DILR: the week that started on Monday 16 Nov 2026, which covers today.
RELEASES = [
    ("daily_rc", "Daily RC", date(2026, 11, 19)),
    ("daily_rc", "Daily RC", date(2026, 11, 20)),
    ("daily_rc", "Daily RC", date(2026, 11, 21)),
    ("weekly_dilr", "Weekly DILR", date(2026, 11, 16)),
]
PAPER = {"Daily RC": "verbal-ability-rc", "Weekly DILR": "logical-reasoning"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write", action="store_true", help="add the samples to beta (without this, nothing is written)")
    args = parser.parse_args()

    table = boto3.Session(profile_name=PROFILE, region_name=REGION).resource("dynamodb").Table(BETA_TABLE)
    repo = Repo(table)
    scoped = repo.scoped(TENANT)
    existing = {row["date"] for row in scoped.list_releases("daily_rc")} | {row["date"] for row in scoped.list_releases("weekly_dilr")}

    print(f"Releases to add: {len(RELEASES)}, each with its own passage and 2 published questions.")
    for kind, title, start in RELEASES:
        flag = "already set, will skip" if start.isoformat() in existing else "add"
        print(f"  {kind} {start.isoformat()} ({title}): {flag}")
    if not args.write:
        print(f"Dry run. Nothing written to {BETA_TABLE}. Run with --write to add them.")
        return

    added = 0
    for kind, title, start in RELEASES:
        if start.isoformat() in existing:
            continue
        passage = create_passage(scoped, {"title": f"Sample: {title} {start.isoformat()}", "text": PASSAGE_TEXT[title]}, ADMIN)
        for text, options, correct in QUESTIONS[title]:
            questions.create_question(scoped, {
                "paper": PAPER[title], "topic": BY_ID[PAPER[title]]["topics"][0], "text": text, "kind": "mcq",
                "options": [{"text": option, "why": "Sample reason."} for option in options],
                "correct": correct, "difficulty": "medium", "status": "published", "passage": passage["id"],
            }, ADMIN)
        scoped.create_release({"id": uuid4().hex, "kind": kind, "passage_id": passage["id"], "date": start.isoformat(), "added_by": ADMIN, "added_at": now_iso()})
        added += 1
    print(f"Added {added} releases with their passages and questions to {BETA_TABLE}.")


if __name__ == "__main__":
    main()
