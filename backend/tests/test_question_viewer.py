"""Filter topics viewer: published questions for a topic, filtered by year and difficulty, with the answer and reasons."""
import pytest

from conftest import headers  # noqa: F401
from test_student_tests import admin, asha, make_test, q, school  # noqa: F401
from test_past_papers import _paper  # noqa: F401

VIEWER = "/api/my/filter-topics/questions"


@pytest.fixture
def bank(client, admin, school):
    easy = q(client, admin, "Optics easy question", topic="Electrostatics", difficulty="easy")
    hard = q(client, admin, "Optics hard question", topic="Electrostatics", difficulty="hard")
    other = q(client, admin, "Magnet question", topic="Magnetism")
    _paper(client, admin, school, "Paper 2025", 2025, [easy["id"], other["id"]])
    _paper(client, admin, school, "Paper 2026", 2026, [hard["id"]])
    return {"easy": easy, "hard": hard, "other": other}


def test_a_topic_lists_its_questions_with_their_options_and_answer(client, asha, bank):
    body = client.get(VIEWER, params={"paper": "physics", "topic": "Electrostatics"}, headers=asha).json()
    assert body["total"] == 2
    first = next(item for item in body["questions"] if item["id"] == bank["easy"]["id"])
    assert first["text"] == "Optics easy question"
    assert [option["letter"] for option in first["options"]] == ["A", "B", "C", "D"]
    assert first["correct_letter"] in ["A", "B", "C", "D"]
    assert first["years"] == [2025]


def test_the_year_filter_keeps_only_that_years_questions(client, asha, bank):
    body = client.get(VIEWER, params={"paper": "physics", "topic": "Electrostatics", "year": 2026}, headers=asha).json()
    assert [item["id"] for item in body["questions"]] == [bank["hard"]["id"]]


def test_the_difficulty_filter_is_checked_and_applied(client, asha, bank):
    body = client.get(VIEWER, params={"topic": "Electrostatics", "difficulty": "hard"}, headers=asha).json()
    assert [item["id"] for item in body["questions"]] == [bank["hard"]["id"]]
    assert client.get(VIEWER, params={"difficulty": "extreme"}, headers=asha).status_code == 422


def test_the_viewer_offers_the_years_and_difficulty_levels(client, asha, bank):
    body = client.get(VIEWER, headers=asha).json()
    assert body["years"] == [2026, 2025]
    assert body["difficulties"] == ["easy", "medium", "hard"]
