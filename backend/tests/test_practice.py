"""Practice tests: made from a weak topic, private to the student, repeatable, and only for enrolled students."""
import pytest

from conftest import headers
from test_student_tests import ADMIN_TESTS, URL, admin, answer, asha, q, school, start, submit  # noqa: F401

PRACTICE = "/api/my/practice"


@pytest.fixture
def bank(client, admin):
    return [q(client, admin, f"Optics {i}")["id"] for i in range(8)] + [q(client, admin, "Draft one", status="draft")["id"]]


def make(client, token, **body):
    return client.post(PRACTICE, json={"paper": "physics", "topic": "Optics", **body}, headers=token)


def test_an_enrolled_student_makes_a_practice_test_from_published_questions(client, asha, bank):
    made = make(client, asha, count=5)
    assert made.status_code == 201
    assert made.json()["title"] == "Practice: Optics" and made.json()["question_count"] == 5
    card = next(t for t in client.get(URL, headers=asha).json() if t["id"] == made.json()["id"])
    assert card["practice"] is True and card["set_by"] is None and card["state"] == "open"
    assert card["question_count"] == 5 and card["max_attempts"] == 100


def test_it_uses_what_exists_when_there_are_fewer_questions_than_asked(client, asha, bank):
    assert make(client, asha, count=30).json()["question_count"] == 8


def test_a_practice_test_can_be_taken_and_retaken_and_shows_answers(client, asha, bank):
    test_id = make(client, asha).json()["id"]
    first = start(client, asha, test_id).json()
    answer(client, asha, test_id, 1, {})
    assert submit(client, asha, test_id, 1).status_code == 200
    assert start(client, asha, test_id).json()["number"] == 2
    assert client.get("/api/my/results", headers=asha).json()["summary"]["attempts"] == 1
    assert first["number"] == 1


def test_it_is_private_to_the_student_and_not_in_the_admins_tests(client, admin, school, asha, bank, sign_in):
    test_id = make(client, asha).json()["id"]
    assert test_id not in [t["id"] for t in client.get(ADMIN_TESTS, headers=admin).json()]
    ravi = sign_in("aaptprep", "ravi@example.com")
    client.post("/api/admin/registrations/ravi@example.com/access", json={"course_id": school["cat"]["id"]}, headers=admin)
    assert test_id not in [t["id"] for t in client.get(URL, headers=ravi).json()]
    assert start(client, ravi, test_id).status_code == 404


@pytest.mark.parametrize("body,problem", [
    ({"count": 4}, "from 5 to 30"), ({"count": 31}, "from 5 to 30"), ({"count": "ten"}, "from 5 to 30"), ({"count": True}, "from 5 to 30"),
    ({"paper": "nope"}, "choose a subject"), ({"topic": "Not a topic"}, "isn't in"), ({"topic": "Optics", "paper": "english"}, "isn't in"),
])
def test_bad_requests_are_refused(client, asha, bank, body, problem):
    response = make(client, asha, **body)
    assert response.status_code == 422 and problem.lower() in response.json()["detail"].lower()


def test_a_topic_with_no_published_questions_says_so(client, asha, bank):
    response = make(client, asha, topic="Electrostatics")
    assert response.status_code == 422 and "no questions for that topic" in response.json()["detail"]


def test_a_student_who_is_not_enrolled_cannot_make_one(client, school, bank, sign_in):
    ravi = sign_in("aaptprep", "ravi@example.com")
    response = make(client, ravi)
    assert response.status_code == 403 and "enrolled" in response.json()["detail"]


def test_only_students_can_make_them(client, admin, bank):
    assert make(client, admin).status_code == 403
    assert make(client, headers("aaptprep")).status_code == 401


def test_there_is_a_limit_per_student(client, asha, bank, monkeypatch):
    from app import practice
    monkeypatch.setattr(practice, "MAX_PER_STUDENT", 2)
    assert make(client, asha).status_code == 201 and make(client, asha).status_code == 201
    response = make(client, asha)
    assert response.status_code == 422 and "practise those first" in response.json()["detail"]
