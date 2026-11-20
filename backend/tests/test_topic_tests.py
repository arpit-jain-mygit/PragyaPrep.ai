"""Topic tests: the page lists each subject's topics with published questions, and starting one makes a practice test."""
import pytest

from conftest import headers  # noqa: F401
from test_student_tests import ADMIN_TESTS, URL, admin, answer, asha, q, school, start, submit  # noqa: F401

URL_TOPICS = "/api/my/topic-tests"
PRACTICE = "/api/my/practice"


@pytest.fixture
def bank(client, admin):
    for i in range(3):
        q(client, admin, f"Optics {i}")
    q(client, admin, "Draft optics", status="draft")
    q(client, admin, "Mechanics one")
    return True


def _published_optics(client, admin):
    rows = client.get("/api/admin/questions", headers=admin).json()
    return sum(1 for row in rows if row["paper"] == "physics" and row["topic"] == "Optics" and row["status"] == "published")


def _switch(client, admin, on: bool):
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": on if row["key"] == "topic_tests" else row["enabled"], "label": row["label"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200


def test_the_list_has_only_topics_with_published_questions_and_their_counts(client, admin, asha, bank):
    expected = _published_optics(client, admin)
    body = client.get(URL_TOPICS, headers=asha).json()["topic_tests"]
    physics = next(subject for subject in body["subjects"] if subject["id"] == "physics")
    optics = next(topic for topic in physics["topics"] if topic["name"] == "Optics")
    assert optics["count"] == expected  # the draft is not counted
    assert all(topic["count"] > 0 for subject in body["subjects"] for topic in subject["topics"])


def test_an_enrolled_student_is_told_they_can_start_one(client, asha, bank):
    assert client.get(URL_TOPICS, headers=asha).json()["topic_tests"]["enrolled"] is True


def test_a_student_who_is_not_enrolled_sees_the_list_but_cannot_start_one(client, admin, add_member, sign_in, bank):
    add_member("aaptprep", "newbie@example.com")
    newbie = sign_in("aaptprep", "newbie@example.com")
    body = client.get(URL_TOPICS, headers=newbie).json()["topic_tests"]
    assert body["enrolled"] is False and body["subjects"]
    refused = client.post(PRACTICE, json={"paper": "physics", "topic": "Optics", "count": 5}, headers=newbie)
    assert refused.status_code == 403


def test_starting_a_topic_from_the_list_makes_a_practice_test_on_it(client, admin, asha, bank):
    expected = _published_optics(client, admin)
    made = client.post(PRACTICE, json={"paper": "physics", "topic": "Optics", "count": 10}, headers=asha)
    assert made.status_code == 201 and made.json()["question_count"] == expected


def test_students_see_nothing_when_the_institute_switches_topic_tests_off(client, admin, asha, bank):
    _switch(client, admin, False)
    assert client.get(URL_TOPICS, headers=asha).json() == {"topic_tests": None}


def test_admins_can_not_use_the_student_list(client, admin, bank):
    assert client.get(URL_TOPICS, headers=admin).status_code == 403
