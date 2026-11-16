"""Manage institutes (tenants) from the command line.

Run from the backend folder, with AWS credentials in the environment. For the dev environment:

  export AWS_PROFILE=pragyaprep-dev PRAGYA_TABLE_NAME=pragyaprep-dev PYTHONPATH=.
  .venv/bin/python scripts/manage_tenants.py list
  .venv/bin/python scripts/manage_tenants.py create --slug aaptprep --name "AAPT Prep" \
      --admin-email admin@example.com --admin-name "Admin Name"
  .venv/bin/python scripts/manage_tenants.py suspend --slug aaptprep
  .venv/bin/python scripts/manage_tenants.py activate --slug aaptprep
  .venv/bin/python scripts/manage_tenants.py platform-admin --email owner@example.com --name "Owner Name"
  .venv/bin/python scripts/manage_tenants.py add-course --slug aaptprep --name CLAT --fee 10000 --access unlimited
  .venv/bin/python scripts/manage_tenants.py add-course --slug aaptprep --name CAT --fee 8000 --access days=365
  .venv/bin/python scripts/manage_tenants.py list-courses --slug aaptprep
  .venv/bin/python scripts/manage_tenants.py link-admin --slug aaptprep --email admin@example.com

The platform admin is created only here. Institutes and their admin can also be managed on the /platform-admin page.
"""
import argparse
import sys

from app import courses, tenants
from app.aws import make_table
from app.config import Settings
from app.repo import Repo


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage PragyaPrep institutes (tenants).")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("list", help="List all institutes")

    create = commands.add_parser("create", help="Create an institute with its one admin")
    create.add_argument("--slug", required=True, help="Short name, for example aaptprep")
    create.add_argument("--name", required=True, help="Display name, for example 'AAPT Prep'")
    create.add_argument("--admin-email", required=True)
    create.add_argument("--admin-name", required=True)
    create.add_argument("--primary-color", default=tenants.DEFAULT_COLOR, help="For example #2563eb")

    for name, help_text in (("suspend", "Suspend an institute"), ("activate", "Reactivate an institute")):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("--slug", required=True)

    add_course = commands.add_parser("add-course", help="Add a course to an institute")
    add_course.add_argument("--slug", required=True)
    add_course.add_argument("--name", required=True)
    add_course.add_argument("--fee", required=True, type=int, help="Whole rupees")
    add_course.add_argument("--access", default="unlimited", help="unlimited, days=N, or until=YYYY-MM-DD")

    list_courses = commands.add_parser("list-courses", help="List an institute's courses")
    list_courses.add_argument("--slug", required=True)

    link = commands.add_parser("link-admin", help="Record who an existing institute's admin is (for older institutes)")
    link.add_argument("--slug", required=True)
    link.add_argument("--email", required=True)

    platform = commands.add_parser("platform-admin", help="Create the platform tenant and its admin")
    platform.add_argument("--email", required=True)
    platform.add_argument("--name", default="Platform Admin")
    return parser


def _parse_access(text: str) -> dict:
    """Turn 'unlimited', 'days=90' or 'until=2027-06-30' into an access setting."""
    if text == "unlimited":
        return {"type": "unlimited"}
    kind, _, value = text.partition("=")
    if kind == "days" and value.isdigit():
        return {"type": "days", "days": int(value)}
    if kind == "until":
        return {"type": "until_date", "until": value}
    raise tenants.ValidationError("Access must be unlimited, days=N, or until=YYYY-MM-DD.")


def _describe(access: dict) -> str:
    if access["type"] == "days":
        return f"{access['days']} days"
    if access["type"] == "until_date":
        return f"until {access['until']}"
    return "unlimited"


def _require_tenant(repo: Repo, slug: str) -> None:
    if repo.get_tenant(slug.strip().lower()) is None:
        raise tenants.ValidationError(f"No institute called '{slug}'.")


def main(argv: list[str] | None = None, repo: Repo | None = None) -> int:
    args = build_parser().parse_args(argv)
    repo = repo or Repo(make_table(Settings()))

    try:
        if args.command == "list":
            for tenant in repo.list_tenants():
                print(f"{tenant['slug']:<20} {tenant['status']:<10} {tenant['name']:<24} {tenant.get('admin_email', '')}")
        elif args.command == "create":
            tenant = tenants.create_tenant(
                repo, args.slug, args.name, args.admin_email, args.admin_name, args.primary_color
            )
            print(f"Created '{tenant['slug']}' with admin {args.admin_email.strip().lower()}")
        elif args.command in ("suspend", "activate"):
            status = "suspended" if args.command == "suspend" else "active"
            tenants.set_tenant_status(repo, args.slug, status)
            print(f"'{args.slug}' is now {status}")
        elif args.command == "add-course":
            _require_tenant(repo, args.slug)
            course = courses.create_course(repo.scoped(args.slug), args.name, args.fee, _parse_access(args.access))
            print(f"Added '{course['name']}' to '{args.slug}': fee {course['fee']}, access {_describe(course['access'])}")
        elif args.command == "list-courses":
            _require_tenant(repo, args.slug)
            for course in repo.scoped(args.slug).list_courses():
                shown = "open" if course.get("active", True) else "hidden"
                print(f"{course['name']:<20} fee {course['fee']:<8} {_describe(course['access']):<22} {shown}")
        elif args.command == "link-admin":
            tenants.link_admin(repo, args.slug, args.email)
            print(f"'{args.slug}' admin recorded as {args.email.strip().lower()}")
        elif args.command == "platform-admin":
            tenants.ensure_platform_admin(repo, args.email, args.name)
            print(f"Platform admin ready: {args.email.strip().lower()}")
    except tenants.ValidationError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
