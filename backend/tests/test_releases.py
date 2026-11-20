"""Daily RC and Weekly DILR: the admin adds releases one at a time (self) or in a queue (bulk), and students see today's."""
from datetime import timedelta

import pytest

from app import clock, passages

URL = "/api/admin/releases"
TODAY_URL = "/api/my/releases/today"
TEXT = "Ancient trade routes carried goods, ideas and people across long distances, shaping the cultures they touched. " * 2


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


@pytest.fixture
def student(add_member, sign_in):
    add_member("aaptprep", "student@example.com")
    return sign_in("aaptprep", "student@example.com")


@pytest.fixture
def passage_ids(repo):
    scoped = repo.scoped("aaptprep")
    return [passages.create_passage(scoped, {"title": f"Passage {n}", "text": TEXT + str(n)}, "ritesh@aaptprep.example.com")["id"] for n in range(1, 6)]


def _set_mode(client, admin, kind, mode, start=None):
    body = {"mode": mode} | ({"start": start} if start else {})
    response = client.put(f"{URL}/{kind}/schedule", json=body, headers=admin)
    assert response.status_code == 200, response.text


def _add(client, admin, body):
    return client.post(URL, json=body, headers=admin)


def test_self_mode_adds_one_passage_on_a_chosen_date(client, admin, passage_ids):
    _set_mode(client, admin, "daily_rc", "self")
    day = (clock.today_india() + timedelta(days=3)).isoformat()
    assert _add(client, admin, {"kind": "daily_rc", "passage_ids": [passage_ids[0]], "date": day}).status_code == 201
    items = client.get(f"{URL}/daily_rc", headers=admin).json()["items"]
    assert [(row["date"], row["title"]) for row in items] == [(day, "Passage 1")]


def test_self_mode_refuses_two_on_one_day_and_more_than_one_passage(client, admin, passage_ids):
    _set_mode(client, admin, "daily_rc", "self")
    day = (clock.today_india() + timedelta(days=3)).isoformat()
    assert _add(client, admin, {"kind": "daily_rc", "passage_ids": [passage_ids[0]], "date": day}).status_code == 201
    clash = _add(client, admin, {"kind": "daily_rc", "passage_ids": [passage_ids[1]], "date": day})
    assert clash.status_code == 422 and "already set" in clash.json()["detail"]
    many = _add(client, admin, {"kind": "daily_rc", "passage_ids": passage_ids[1:3], "date": day})
    assert many.status_code == 422


def test_queue_mode_releases_daily_rc_one_per_day_from_today(client, admin, passage_ids):
    _set_mode(client, admin, "daily_rc", "queue")
    assert _add(client, admin, {"kind": "daily_rc", "passage_ids": passage_ids[:3]}).status_code == 201
    assert _add(client, admin, {"kind": "daily_rc", "passage_ids": passage_ids[3:4]}).status_code == 201
    dates = [row["date"] for row in client.get(f"{URL}/daily_rc", headers=admin).json()["items"]]
    today = clock.today_india()
    assert dates == [(today + timedelta(days=n)).isoformat() for n in range(4)]


def test_queue_mode_releases_weekly_dilr_one_per_week_from_the_start_date(client, admin, passage_ids):
    start = (clock.today_india() + timedelta(days=10)).isoformat()
    _set_mode(client, admin, "weekly_dilr", "queue", start)
    assert _add(client, admin, {"kind": "weekly_dilr", "passage_ids": passage_ids[:2]}).status_code == 201
    dates = [row["date"] for row in client.get(f"{URL}/weekly_dilr", headers=admin).json()["items"]]
    assert dates == [start, (clock.today_india() + timedelta(days=17)).isoformat()]


def test_a_student_sees_todays_passage_on_its_day_only(client, admin, student, passage_ids):
    _set_mode(client, admin, "daily_rc", "queue")
    _add(client, admin, {"kind": "daily_rc", "passage_ids": passage_ids[:2]})
    today_body = client.get(TODAY_URL, headers=student).json()
    assert today_body["daily_rc"]["title"] == "Passage 1"
    assert "Ancient trade routes" in today_body["daily_rc"]["text"]
    clock_forward = clock.now
    try:
        clock.now = lambda: clock_forward() + 86400
        assert client.get(TODAY_URL, headers=student).json()["daily_rc"]["title"] == "Passage 2"
        clock.now = lambda: clock_forward() + 2 * 86400
        assert client.get(TODAY_URL, headers=student).json()["daily_rc"] is None
    finally:
        clock.now = clock_forward


def test_a_weekly_set_stays_up_for_seven_days(client, admin, student, passage_ids):
    _set_mode(client, admin, "weekly_dilr", "queue")
    _add(client, admin, {"kind": "weekly_dilr", "passage_ids": passage_ids[:1]})
    assert client.get(TODAY_URL, headers=student).json()["weekly_dilr"]["title"] == "Passage 1"
    clock_forward = clock.now
    try:
        clock.now = lambda: clock_forward() + 6 * 86400
        assert client.get(TODAY_URL, headers=student).json()["weekly_dilr"] is not None
        clock.now = lambda: clock_forward() + 7 * 86400
        assert client.get(TODAY_URL, headers=student).json()["weekly_dilr"] is None
    finally:
        clock.now = clock_forward


def test_students_see_nothing_when_the_institute_switches_the_kind_off(client, admin, student, passage_ids):
    _set_mode(client, admin, "daily_rc", "queue")
    _add(client, admin, {"kind": "daily_rc", "passage_ids": passage_ids[:1]})
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": False if row["key"] == "daily_rc" else row["enabled"], "label": row["label"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200
    assert client.get(TODAY_URL, headers=student).json()["daily_rc"] is None


def test_a_release_can_be_removed(client, admin, passage_ids):
    _set_mode(client, admin, "daily_rc", "queue")
    _add(client, admin, {"kind": "daily_rc", "passage_ids": passage_ids[:1]})
    release_id = client.get(f"{URL}/daily_rc", headers=admin).json()["items"][0]["id"]
    assert client.delete(f"{URL}/{release_id}", headers=admin).status_code == 204
    assert client.get(f"{URL}/daily_rc", headers=admin).json()["items"] == []


@pytest.mark.parametrize("body", [
    {"kind": "weekly_quiz", "passage_ids": ["x"]},
    {"kind": "daily_rc", "passage_ids": []},
    {"kind": "daily_rc", "passage_ids": ["no-such-passage"]},
])
def test_bad_requests_are_refused_in_plain_words(client, admin, passage_ids, body):
    _set_mode(client, admin, "daily_rc", "queue")
    refused = _add(client, admin, body)
    assert refused.status_code == 422 and refused.json()["detail"]


def test_a_bad_schedule_mode_is_refused(client, admin):
    assert client.put(f"{URL}/daily_rc/schedule", json={"mode": "random"}, headers=admin).status_code == 422


def test_students_can_not_manage_releases(client, admin, student, passage_ids):
    assert client.post(URL, json={"kind": "daily_rc", "passage_ids": passage_ids[:1]}, headers=student).status_code == 403
    assert client.get(f"{URL}/daily_rc", headers=student).status_code == 403
