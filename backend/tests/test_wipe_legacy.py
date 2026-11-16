"""Tests for the old-data cleanup script: it must remove old rows and never touch institutes."""
from app import tenants
from scripts import wipe_legacy_data

OLD_ROWS = [
    {"PK": "COURSE#1", "SK": "META", "title": "SMOKE TEST"},
    {"PK": "COURSETITLE#smoke test", "SK": "LOOKUP"},
    {"PK": "USER#1", "SK": "PROFILE", "login_id": "admin", "password_hash": "x"},
    {"PK": "LOGIN#admin", "SK": "LOOKUP"},
    {"PK": "CONTENT#1", "SK": "META", "status": "pending"},
    {"PK": "USER#1", "SK": "GRANT#1"},
]


def add_old_rows(repo):
    for row in OLD_ROWS:
        repo.table.put_item(Item=row)


def all_keys(repo) -> set[tuple[str, str]]:
    return {(i["PK"], i["SK"]) for i in repo.table.scan()["Items"]}


def test_a_dry_run_lists_old_rows_and_deletes_nothing(repo, capsys):
    add_old_rows(repo)
    before = all_keys(repo)

    assert wipe_legacy_data.main([], repo.table) == 0

    out = capsys.readouterr().out
    assert f"Found {len(OLD_ROWS)} old-design rows" in out
    assert "Nothing deleted" in out
    assert all_keys(repo) == before


def test_yes_deletes_old_rows_and_keeps_every_institute_row(repo, make_tenant, capsys):
    make_tenant("aaptprep")
    tenants.ensure_platform_admin(repo, "owner@example.com")
    add_old_rows(repo)
    keep = {k for k in all_keys(repo) if k[0].startswith(("TENANT#", "T#"))}
    assert keep, "the test needs institute rows to protect"

    assert wipe_legacy_data.main(["--yes"], repo.table) == 0

    assert all_keys(repo) == keep
    assert repo.get_tenant("aaptprep") is not None
    assert repo.scoped("aaptprep").get_member("admin@aaptprep.example.com") is not None
    assert repo.scoped("platform").get_member("owner@example.com") is not None


def test_nothing_to_delete_is_fine(repo, make_tenant, capsys):
    make_tenant("aaptprep")
    assert wipe_legacy_data.main(["--yes"], repo.table) == 0
    assert "Found 0 old-design rows" in capsys.readouterr().out
    assert repo.get_tenant("aaptprep") is not None


def test_a_table_larger_than_one_scan_page_is_fully_cleaned(repo, make_tenant):
    make_tenant("aaptprep")
    for number in range(300):
        repo.table.put_item(Item={"PK": f"COURSE#{number}", "SK": "META", "padding": "x" * 5000})

    assert wipe_legacy_data.main(["--yes"], repo.table) == 0

    assert not [k for k in all_keys(repo) if k[0].startswith("COURSE#")]
    assert repo.get_tenant("aaptprep") is not None
