"""Word of the day: the admin's word list, and one word a day for students."""
from datetime import date

import pytest

from app import word_of_day
from app.tenants import ValidationError

URL = "/api/admin/words"
STUDENT_URL = "/api/my/word-of-day"


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


@pytest.fixture
def student(add_member, sign_in):
    add_member("aaptprep", "student@example.com")
    return sign_in("aaptprep", "student@example.com")


def _add(client, admin, word, meaning="a meaning", example=""):
    response = client.post(URL, json={"word": word, "meaning": meaning, "example": example}, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


def test_the_admin_adds_and_sees_the_list_in_the_order_it_was_added(client, admin):
    _add(client, admin, "bashful", "shy", "He was bashful at the party.")
    _add(client, admin, "candid", "honest and open")
    words = client.get(URL, headers=admin).json()
    assert [row["word"] for row in words] == ["bashful", "candid"]
    assert words[0]["example"] == "He was bashful at the party."


def test_a_word_is_checked_and_every_mistake_is_reported_together(client, admin):
    refused = client.post(URL, json={"word": "", "meaning": "   ", "example": "x" * 301}, headers=admin)
    assert refused.status_code == 422
    detail = refused.json()["detail"]
    assert "Type the word." in detail and "Type what the word means." in detail and "example can be at most 300" in detail


def test_a_word_longer_than_the_limit_is_refused(client, admin):
    too_long = "x" * (word_of_day.MAX_WORD + 1)
    assert client.post(URL, json={"word": too_long, "meaning": "m"}, headers=admin).status_code == 422


def test_a_word_can_be_removed(client, admin):
    added = _add(client, admin, "bashful")
    assert client.delete(f"{URL}/{added['id']}", headers=admin).status_code == 204
    assert client.get(URL, headers=admin).json() == []


def test_students_can_not_manage_the_list(client, admin, student):
    assert client.post(URL, json={"word": "x", "meaning": "y"}, headers=student).status_code == 403
    assert client.get(URL, headers=student).status_code == 403


def test_the_day_goes_down_the_list_and_starts_again(client, admin, student, fake_clock):
    for word in ["alpha", "beta", "gamma"]:
        _add(client, admin, word)
    seen = []
    for _ in range(4):
        seen.append(client.get(STUDENT_URL, headers=student).json()["word"]["word"])
        fake_clock.advance(24 * 3600)
    order = ["alpha", "beta", "gamma"]
    start = order.index(seen[0])
    assert seen == [order[(start + day) % 3] for day in range(4)]


def test_students_see_nothing_when_the_institute_switches_it_off(client, admin, student):
    _add(client, admin, "alpha")
    features = client.get("/api/admin/features", headers=admin).json()["features"]
    rows = [{"key": row["key"], "enabled": row["enabled"] if row["key"] != "word_of_day" else False, "label": row["label"]} for row in features]
    assert client.put("/api/admin/features", json=rows, headers=admin).status_code == 200
    assert client.get(STUDENT_URL, headers=student).json() == {"word": None}


def test_students_see_nothing_while_the_list_is_empty(client, admin, student):
    assert client.get(STUDENT_URL, headers=student).json() == {"word": None}


def test_todays_word_is_the_same_for_everyone_on_one_day():
    words = [{"word": "a"}, {"word": "b"}]
    assert word_of_day.todays(words, date(2026, 11, 20)) == word_of_day.todays(words, date(2026, 11, 20))
    assert word_of_day.todays([], date(2026, 11, 20)) is None


def test_clean_returns_the_trimmed_word():
    assert word_of_day.clean({"word": "  bashful ", "meaning": " shy ", "example": None}) == {"word": "bashful", "meaning": "shy", "example": ""}
    with pytest.raises(ValidationError):
        word_of_day.clean({"word": "", "meaning": ""})
