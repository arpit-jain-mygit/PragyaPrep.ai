"""Remove rows left over from the old single-tenant design (test users, courses and uploads).

It only ever deletes rows whose key does NOT start with TENANT# or T#, so institutes and their data are safe.
By default it only lists what it would delete. Add --yes to delete.

From the backend folder:

  export AWS_PROFILE=pragyaprep-dev PRAGYA_TABLE_NAME=pragyaprep-dev PYTHONPATH=.
  .venv/bin/python scripts/wipe_legacy_data.py          # show what would be deleted
  .venv/bin/python scripts/wipe_legacy_data.py --yes    # delete it
"""
import argparse
import sys

from app.aws import make_table
from app.config import Settings

# Rows with these key prefixes belong to the new design and are never touched.
KEEP_PREFIXES = ("TENANT#", "T#")


def find_legacy_keys(table) -> list[dict]:
    """Every row in the table whose key isn't part of the new design."""
    legacy = []
    kwargs = {"ProjectionExpression": "PK, SK"}
    while True:
        response = table.scan(**kwargs)
        legacy += [
            {"PK": item["PK"], "SK": item["SK"]}
            for item in response["Items"]
            if not item["PK"].startswith(KEEP_PREFIXES)
        ]
        if "LastEvaluatedKey" not in response:
            return legacy
        kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]


def main(argv: list[str] | None = None, table=None) -> int:
    parser = argparse.ArgumentParser(description="Remove old single-tenant test data.")
    parser.add_argument("--yes", action="store_true", help="Delete the rows. Without it, only list them.")
    args = parser.parse_args(argv)

    table = table or make_table(Settings())
    legacy = find_legacy_keys(table)

    print(f"Found {len(legacy)} old-design rows in {table.name}:")
    for key in sorted(legacy, key=lambda k: (k["PK"], k["SK"])):
        print(f"  {key['PK']}  {key['SK']}")

    if not legacy:
        return 0
    if not args.yes:
        print("Nothing deleted. Run again with --yes to delete these rows.")
        return 0

    with table.batch_writer() as batch:
        for key in legacy:
            batch.delete_item(Key=key)
    print(f"Deleted {len(legacy)} rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
