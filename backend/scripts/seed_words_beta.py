"""Add a few dummy words to the beta institute's Word of the day list.

Only touches the BETA table, and only for the aaptprep institute. It does nothing if the list already has words,
so running it twice is safe.

Usage (dry run, shows what would be added, writes nothing):
  .venv/bin/python scripts/seed_words_beta.py
Add them for real:
  .venv/bin/python scripts/seed_words_beta.py --write
"""
import argparse

import boto3

from app.repo import Repo, TenantRepo
from app import word_of_day

BETA_TABLE = "pragyaprep-beta"
TENANT = "aaptprep"
PROFILE = "pragyaprep-dev"
REGION = "ap-south-1"

# Dummy sample words, only for trying the screen on beta.
SAMPLE = [
    {"word": "ephemeral", "meaning": "lasting for a very short time", "example": "The joy of the festival was ephemeral."},
    {"word": "lucid", "meaning": "expressed clearly, easy to understand", "example": "She gave a lucid explanation of the theory."},
    {"word": "candid", "meaning": "truthful and straightforward", "example": "He gave a candid answer about his mistakes."},
    {"word": "tenacious", "meaning": "holding firmly to a goal, persistent", "example": "A tenacious student keeps practising until it clicks."},
    {"word": "meticulous", "meaning": "showing great attention to detail", "example": "The meticulous editor checked every line."},
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write", action="store_true", help="add the words to beta (without this, nothing is written)")
    args = parser.parse_args()

    table = boto3.Session(profile_name=PROFILE, region_name=REGION).resource("dynamodb").Table(BETA_TABLE)
    scoped: TenantRepo = Repo(table).scoped(TENANT)
    existing = word_of_day.all_words(scoped)
    if existing:
        print(f"The beta list already has {len(existing)} word(s). Nothing added.")
        return
    for word in SAMPLE:
        print(f"  {word['word']}: {word['meaning']}")
    if not args.write:
        print(f"Dry run. {len(SAMPLE)} words would be added to {BETA_TABLE}. Run with --write to add them.")
        return
    for word in SAMPLE:
        word_of_day.add(scoped, word)
    print(f"Added {len(SAMPLE)} words to {BETA_TABLE}.")


if __name__ == "__main__":
    main()
