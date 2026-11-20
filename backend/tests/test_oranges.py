"""Oranges on the dashboard: one for each coursework item a student marks done, with the institute's daily target."""
from datetime import date, datetime, timedelta, timezone

import pytest

from app import clock, oranges
from app.tenants import ValidationError

URL = "/api/my/oranges"
TARGET_URL = "/api/admin/oranges-target"
INDIA = clock.INDIA


def _at(day: date, hour: int = 10) -> str:
    """A 'done at' time on an Indian calendar day, as the app stores it (UTC)."""
    return datetime(day.year, day.month, day.day, hour, tzinfo=INDIA).astimezone(timezone.utc).isoformat()


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


@pytest.fixture
def student(add_member, sign_in):
    add_member("aaptprep", "student@example.com")
    return sign_in("aaptprep", "student@example.com")


def _mark_done(repo, times):
    for number, moment in enumerate(times):
        repo.scoped("aaptprep").put_done("student@example.com", "course-1", f"sub-{number}", moment)


def _switch(client, admin, on: bool):
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": on if row["key"] == "dashboard_points" else row["enabled"], "label": row["label"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200


def test_the_default_target_is_ten_and_oranges_count_each_item_done_today(client, admin, student, repo, fake_clock):
    today = clock.today_india()
    _mark_done(repo, [_at(today)] * 3)
    body = client.get(URL, headers=student).json()["oranges"]
    assert body == {"collected_today": 3, "collected_total": 3, "target": 10, "days_strong": 0}


def test_days_strong_counts_days_in_a_row_that_reached_the_target(client, admin, student, repo, fake_clock):
    today = clock.today_india()
    times = []
    for back in range(3):
        times += [_at(today - timedelta(days=back))] * 10
    times += [_at(today - timedelta(days=4))] * 10  # a gap on day 3 breaks the run
    _mark_done(repo, times)
    assert client.get(URL, headers=student).json()["oranges"]["days_strong"] == 3


def test_today_not_reached_yet_still_keeps_yesterdays_streak(client, admin, student, repo, fake_clock):
    today = clock.today_india()
    _mark_done(repo, [_at(today - timedelta(days=1))] * 10 + [_at(today)] * 2)
    assert client.get(URL, headers=student).json()["oranges"]["days_strong"] == 1


def test_students_see_nothing_when_the_institute_switches_oranges_off(client, admin, student, repo):
    _mark_done(repo, [_at(clock.today_india())])
    _switch(client, admin, False)
    assert client.get(URL, headers=student).json() == {"oranges": None}


def test_the_admin_sets_the_daily_target_and_students_see_it(client, admin, student, repo):
    assert client.get(TARGET_URL, headers=admin).json() == {"target": 10}
    assert client.put(TARGET_URL, json={"target": 25}, headers=admin).json() == {"target": 25}
    assert client.get(URL, headers=student).json()["oranges"]["target"] == 25


@pytest.mark.parametrize("bad", [0, 101, "ten", True, None])
def test_a_bad_target_is_refused(client, admin, bad):
    refused = client.put(TARGET_URL, json={"target": bad}, headers=admin)
    assert refused.status_code == 422


def test_students_can_not_change_the_target(client, admin, student):
    assert client.put(TARGET_URL, json={"target": 5}, headers=student).status_code == 403
    assert client.get(TARGET_URL, headers=student).status_code == 403


def test_summarise_uses_the_indian_day_not_utc():
    late_night_india = datetime(2026, 11, 20, 23, 50, tzinfo=INDIA).astimezone(timezone.utc).isoformat()
    result = oranges.summarise([late_night_india], date(2026, 11, 20), 1)
    assert result["collected_today"] == 1


def test_a_bad_target_message_is_plain():
    with pytest.raises(ValidationError, match="whole number"):
        oranges.check_target("ten")
