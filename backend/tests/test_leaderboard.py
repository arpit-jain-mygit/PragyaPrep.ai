"""The leaderboard: the most oranges in the last seven days, among approved students of one institute."""
from datetime import date, datetime, timedelta, timezone

import pytest

from app import clock, oranges
from app.tenants import ValidationError

URL = "/api/my/leaderboard"
INDIA = clock.INDIA


def _at(day: date) -> str:
    return datetime(day.year, day.month, day.day, 10, tzinfo=INDIA).astimezone(timezone.utc).isoformat()


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


@pytest.fixture
def people(add_member, sign_in):
    add_member("aaptprep", "asha@example.com", status="approved")
    add_member("aaptprep", "bilal@example.com", status="approved")
    add_member("aaptprep", "chandni@example.com", status="approved")
    add_member("aaptprep", "pending@example.com", status="pending")
    return {"asha": sign_in("aaptprep", "asha@example.com"), "bilal": sign_in("aaptprep", "bilal@example.com")}


def _mark(repo, email, days_and_counts):
    number = 0
    for day, count in days_and_counts:
        for _ in range(count):
            repo.scoped("aaptprep").put_done(email, "course-1", f"sub-{number}", _at(day))
            number += 1


def test_the_list_is_ranked_by_the_last_seven_days_only(client, admin, people, repo):
    today = clock.today_india()
    _mark(repo, "asha@example.com", [(today, 4), (today - timedelta(days=10), 50)])  # the old 50 does not count
    _mark(repo, "bilal@example.com", [(today - timedelta(days=2), 9)])
    board = client.get(URL, headers=people["asha"]).json()["leaderboard"]
    assert [row["oranges"] for row in board["top"]] == [9, 4, 0]  # Bilal, Asha, then Chandni with none
    assert board["days"] == 7


def test_only_approved_students_are_listed(client, admin, people, repo):
    today = clock.today_india()
    _mark(repo, "pending@example.com", [(today, 99)])
    names = [row["name"] for row in client.get(URL, headers=people["asha"]).json()["leaderboard"]["top"]]
    assert all(not name.startswith("Pending") for name in names)


def test_the_viewer_sees_their_own_rank_even_outside_the_top(client, admin, people, repo):
    today = clock.today_india()
    for index in range(oranges.LEADERBOARD_TOP + 2):
        email = f"student{index}@example.com"
        repo.scoped("aaptprep").create_member({"email": email, "status": "approved", "role": "student", "first_name": f"S{index}", "last_name": "X"})
        _mark(repo, email, [(today, 20 - index)])
    board = client.get(URL, headers=people["bilal"]).json()["leaderboard"]
    assert len(board["top"]) == oranges.LEADERBOARD_TOP
    assert board["me"] is not None and board["me"]["me"] is True


def test_students_see_nothing_when_the_institute_switches_the_leaderboard_off(client, admin, people):
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": False if row["key"] == "leaderboard" else row["enabled"], "label": row["label"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200
    assert client.get(URL, headers=people["asha"]).json() == {"leaderboard": None}


def test_a_name_shows_the_first_name_and_one_letter_of_the_last():
    assert oranges._display_name({"first_name": "Asha", "last_name": "Verma"}) == "Asha V."
    assert oranges._display_name({"first_name": "Asha", "last_name": ""}) == "Asha"
