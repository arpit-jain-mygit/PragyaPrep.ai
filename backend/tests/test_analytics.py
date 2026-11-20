"""Analyse: topic test, sectional and mock analytics, and SWOT, worked out from the student's submitted attempts."""
import pytest

from conftest import headers  # noqa: F401
from test_student_tests import ADMIN_TESTS, admin, answer, asha, fill_in, make_test, q, school, start, submit  # noqa: F401

PRACTICE = "/api/my/practice"


@pytest.fixture
def six(client, admin):
    ids = [q(client, admin, f"Optics {i}", topic="Electrostatics")["id"] for i in range(5)]
    ids.append(fill_in(client, admin, "Capital of France?", {"type": "text", "accepted": ["Paris"]})["id"])
    return ids


def _right_attempt(client, token, test, ids):
    """Submit an attempt with every answer right: option 1 for the multiple-choice questions, Paris for the fill-in."""
    assert start(client, token, test["id"]).status_code == 201
    given = {question_id: 1 for question_id in ids[:-1]}
    given[ids[-1]] = "paris"
    answer(client, token, test["id"], 1, given)
    assert submit(client, token, test["id"], 1).status_code == 200


def _view(client, token, name):
    return client.get(f"/api/my/analyse/{name}", headers=token)


def test_mock_analytics_count_only_mock_attempts(client, admin, school, asha, six):
    mock = make_test(client, admin, school, six, title="Full mock", kind="mock")
    _right_attempt(client, asha, mock, six)
    body = _view(client, asha, "mock").json()
    assert body["summary"]["attempts"] == 1
    assert body["summary"]["average"] == "100"
    assert any(subject["id"] == "physics" for subject in body["subjects"])
    assert _view(client, asha, "sectional").json()["summary"]["attempts"] == 0


def test_topic_test_analytics_count_practice_tests_on_a_topic(client, admin, school, asha, six):
    made = client.post(PRACTICE, json={"paper": "physics", "topic": "Electrostatics", "count": 5}, headers=asha).json()
    start(client, asha, made["id"])
    answer(client, asha, made["id"], 1, {question_id: 1 for question_id in six[:5]})
    submit(client, asha, made["id"], 1)
    body = _view(client, asha, "topic").json()
    assert body["summary"]["attempts"] == 1
    assert _view(client, asha, "mock").json()["summary"]["attempts"] == 0


def test_swot_waits_for_a_few_sectional_or_mock_attempts(client, admin, school, asha, six):
    mock = make_test(client, admin, school, six, title="Full mock", kind="mock")
    _right_attempt(client, asha, mock, six)
    body = client.get("/api/my/swot", headers=asha).json()
    assert body["enough"] is False and body["attempts"] == 1
    assert body["strengths"] == [] and body["weaknesses"] == []


def test_swot_lists_strong_topics_from_the_last_attempts(client, admin, school, asha, six):
    for _ in range(3):
        mock = make_test(client, admin, school, six, title="Full mock", kind="mock")
        _right_attempt(client, asha, mock, six)
    body = client.get("/api/my/swot", headers=asha).json()
    assert body["enough"] is True and body["attempts"] == 3
    assert {row["topic"] for row in body["strengths"]} == {"Electrostatics", "Optics"}
    assert body["weaknesses"] == []


def test_a_switched_off_analyse_screen_is_not_available(client, admin, asha):
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": False if row["key"] == "analyse_mocks" else row["enabled"], "label": row["label"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200
    assert _view(client, asha, "mock").status_code == 404
