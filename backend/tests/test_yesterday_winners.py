"""Yesterday's winners: the top three students by oranges on yesterday's day, among approved students of one institute."""
from datetime import datetime, timedelta, timezone

import pytest

from app import clock

URL = "/api/my/yesterday-winners"


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


@pytest.fixture
def people(repo, add_member, sign_in):
    names = {"asha": ("Asha", "Rao"), "bilal": ("Bilal", "Khan"), "chandni": ("Chandni", "Verma"), "dev": ("Dev", "Shah")}
    for key, (first, last) in names.items():
        add_member("aaptprep", f"{key}@example.com", status="approved")
        repo.scoped("aaptprep").update_member(f"{key}@example.com", first_name=first, last_name=last)
    add_member("aaptprep", "pending@example.com", status="pending")
    return {"asha": sign_in("aaptprep", "asha@example.com"), "dev": sign_in("aaptprep", "dev@example.com")}


def _mark(repo, email, day, count, tag):
    scoped = repo.scoped("aaptprep")
    for number in range(count):
        scoped.put_done(email, "course-1", f"{tag}-{number}", _at(day))


def _at(day):
    return datetime(day.year, day.month, day.day, 10, tzinfo=clock.INDIA).astimezone(timezone.utc).isoformat()


def test_the_top_three_from_yesterday_are_listed_in_order(client, admin, people, repo):
    yesterday = clock.today_india() - timedelta(days=1)
    _mark(repo, "bilal@example.com", yesterday, 9, "b")
    _mark(repo, "asha@example.com", yesterday, 7, "a")
    _mark(repo, "chandni@example.com", yesterday, 5, "c")
    _mark(repo, "dev@example.com", yesterday, 2, "d")
    board = client.get(URL, headers=people["asha"]).json()["yesterday_winners"]
    assert board["day"] == yesterday.isoformat()
    assert [(row["name"], row["oranges"]) for row in board["top"]] == [("Bilal K.", 9), ("Asha R.", 7), ("Chandni V.", 5)]
    assert board["me_in_top"] is True


def test_today_and_older_days_do_not_count_and_pending_students_are_left_out(client, admin, people, repo):
    today = clock.today_india()
    _mark(repo, "bilal@example.com", today, 50, "t")
    _mark(repo, "chandni@example.com", today - timedelta(days=2), 40, "o")
    _mark(repo, "pending@example.com", today - timedelta(days=1), 99, "p")
    _mark(repo, "dev@example.com", today - timedelta(days=1), 1, "d")
    board = client.get(URL, headers=people["dev"]).json()["yesterday_winners"]
    assert [(row["name"], row["oranges"]) for row in board["top"]] == [("Dev S.", 1)]
    assert board["me_in_top"] is True


def test_no_winners_when_nobody_collected_yesterday(client, admin, people):
    board = client.get(URL, headers=people["asha"]).json()["yesterday_winners"]
    assert board["top"] == [] and board["me_in_top"] is False


def test_students_see_nothing_when_the_institute_switches_it_off(client, admin, people):
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": False if row["key"] == "yesterday_winners" else row["enabled"], "label": row["label"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200
    assert client.get(URL, headers=people["asha"]).json() == {"yesterday_winners": None}
