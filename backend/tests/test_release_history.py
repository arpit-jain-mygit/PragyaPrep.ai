"""The Daily RC and Weekly DILR list: past and current releases, newest first, with whether the student has attempted them."""
from datetime import timedelta

import pytest

from app import clock

URL = "/api/my/releases/{kind}/history"


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


@pytest.fixture
def student(add_member, sign_in):
    add_member("aaptprep", "asha@example.com", status="approved")
    return sign_in("aaptprep", "asha@example.com")


def test_past_and_current_releases_are_listed_newest_first_and_future_ones_are_hidden(client, admin, student, repo):
    today = clock.today_india()
    scoped = repo.scoped("aaptprep")
    scoped.create_passage({"id": "p1", "title": "Old passage", "text": "a", "created_by": "x", "created_at": "2026-01-01T00:00:00+00:00"})
    scoped.create_passage({"id": "p2", "title": "Today passage", "text": "b", "created_by": "x", "created_at": "2026-01-01T00:00:00+00:00"})
    scoped.create_passage({"id": "p3", "title": "Next passage", "text": "c", "created_by": "x", "created_at": "2026-01-01T00:00:00+00:00"})
    scoped.create_release({"id": "r1", "kind": "daily_rc", "date": (today - timedelta(days=2)).isoformat(), "passage_id": "p1", "added_by": "x", "added_at": "2026-01-01T00:00:00+00:00"})
    scoped.create_release({"id": "r2", "kind": "daily_rc", "date": today.isoformat(), "passage_id": "p2", "added_by": "x", "added_at": "2026-01-01T00:00:00+00:00"})
    scoped.create_release({"id": "r3", "kind": "daily_rc", "date": (today + timedelta(days=1)).isoformat(), "passage_id": "p3", "added_by": "x", "added_at": "2026-01-01T00:00:00+00:00"})
    rows = client.get(URL.format(kind="daily_rc"), headers=student).json()["releases"]
    assert [row["title"] for row in rows] == ["Today passage", "Old passage"]
    assert rows[0]["current"] is True and rows[1]["current"] is False
    assert all(row["attempted"] is False for row in rows)


def test_a_release_the_student_has_attempted_shows_its_practice_test(client, admin, student, repo):
    today = clock.today_india()
    scoped = repo.scoped("aaptprep")
    scoped.create_passage({"id": "p2", "title": "Today passage", "text": "b", "created_by": "x", "created_at": "2026-01-01T00:00:00+00:00"})
    scoped.create_release({"id": "r2", "kind": "daily_rc", "date": today.isoformat(), "passage_id": "p2", "added_by": "x", "added_at": "2026-01-01T00:00:00+00:00"})
    scoped.create_practice({"id": "t9", "title": "Daily RC", "release_id": "r2", "practice_for": "asha@example.com", "question_ids": [], "status": "published", "created_at": "2026-01-01T00:00:00+00:00"})
    row = client.get(URL.format(kind="daily_rc"), headers=student).json()["releases"][0]
    assert row["attempted"] is True and row["practice_id"] == "t9"


def test_an_unknown_kind_is_not_found(client, admin, student):
    assert client.get(URL.format(kind="nope"), headers=student).status_code == 404


def test_nothing_is_listed_when_the_institute_switches_the_kind_off(client, admin, student, repo):
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": False if row["key"] == "daily_rc" else row["enabled"], "label": row["label"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200
    assert client.get(URL.format(kind="daily_rc"), headers=student).json() == {"releases": []}
