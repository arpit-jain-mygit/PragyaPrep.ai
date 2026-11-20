"""Sectionals and mocks: the same test engine, tagged by kind. Students see each kind on its own page, and the free mock is marked."""
import pytest

from conftest import headers  # noqa: F401
from test_student_tests import ADMIN_TESTS, URL, admin, asha, make_test, q, school  # noqa: F401


@pytest.fixture
def questions(client, admin):
    return [q(client, admin, f"Question {i}")["id"] for i in range(2)]


def test_an_admin_tags_a_test_as_a_sectional_or_a_mock(client, admin, school, questions):
    sectional = make_test(client, admin, school, questions, title="SA sectional", kind="sectional")
    mock = make_test(client, admin, school, questions, title="Full mock 1", kind="mock", free=True)
    plain = make_test(client, admin, school, questions, title="Chapter quiz")
    assert (sectional["kind"], mock["kind"], plain["kind"]) == ("sectional", "mock", "test")
    assert mock["free"] is True and plain["free"] is False


def test_only_a_mock_can_be_free(client, admin, school, questions):
    sectional = make_test(client, admin, school, questions, kind="sectional", free=True)
    assert sectional["free"] is False


def test_an_unknown_kind_is_refused_with_a_plain_message(client, admin, school, questions):
    body = {"title": "X", "kind": "quiz", "start_at": "2027-01-10 09:00", "end_at": "2027-01-31 23:59", "duration_minutes": 30,
            "max_attempts": 1, "pass_percentage": 50, "marks_correct": 3, "marks_incorrect": 0, "courses": [school["cat"]["id"]],
            "question_ids": questions, "status": "draft"}
    refused = client.post(ADMIN_TESTS, json=body, headers=admin)
    assert refused.status_code == 422
    assert "Choose test, sectional, mock or past paper." in str(refused.json())


def test_a_student_gets_each_kind_on_its_own(client, admin, school, asha, questions):
    make_test(client, admin, school, questions, title="SA sectional", kind="sectional")
    make_test(client, admin, school, questions, title="Full mock 1", kind="mock", free=True)
    make_test(client, admin, school, questions, title="Mock 2", kind="mock")
    make_test(client, admin, school, questions, title="Chapter quiz")
    mocks = client.get(f"{URL}?kind=mock", headers=asha).json()
    assert sorted(item["title"] for item in mocks) == ["Full mock 1", "Mock 2"]
    assert all(item["kind"] == "mock" for item in mocks)
    assert next(item for item in mocks if item["title"] == "Full mock 1")["free"] is True
    sectionals = client.get(f"{URL}?kind=sectional", headers=asha).json()
    assert [item["title"] for item in sectionals] == ["SA sectional"]
    assert len(client.get(URL, headers=asha).json()) == 4


def test_an_unpublished_mock_is_not_shown_to_students(client, admin, school, asha, questions):
    make_test(client, admin, school, questions, title="Draft mock", kind="mock", status="draft")
    assert client.get(f"{URL}?kind=mock", headers=asha).json() == []
