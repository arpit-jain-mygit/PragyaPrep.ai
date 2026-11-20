"""Past papers: past-year papers by year, the syllabus table by year, and topics to filter and practise."""
import pytest

from conftest import headers  # noqa: F401
from test_student_tests import ADMIN_TESTS, URL, admin, asha, make_test, q, school  # noqa: F401

PAPERS = "/api/my/past-papers"
SYLLABUS = "/api/my/syllabus"
TOPICS = "/api/my/filter-topics"


def _paper(client, admin, school, title, year, ids):
    return make_test(client, admin, school, ids, title=title, kind="past_paper", year=year)


@pytest.fixture
def papers(client, admin, school):
    optics_2025 = [q(client, admin, f"Optics 25 {i}", topic="Electrostatics")["id"] for i in range(2)]
    mechanics_2025 = [q(client, admin, "Mechanics 25", topic="Magnetism")["id"]]
    optics_2026 = [q(client, admin, f"Optics 26 {i}", topic="Electrostatics")["id"] for i in range(3)]
    _paper(client, admin, school, "Paper 2025", 2025, optics_2025 + mechanics_2025)
    _paper(client, admin, school, "Paper 2026", 2026, optics_2026)
    return True


def test_a_past_paper_needs_a_year(client, admin, school):
    body = {"title": "No year", "kind": "past_paper", "start_at": "2027-01-10 09:00", "end_at": "2027-01-31 23:59", "duration_minutes": 30,
            "max_attempts": 1, "pass_percentage": 50, "marks_correct": 3, "marks_incorrect": 0, "courses": [school["cat"]["id"]], "question_ids": [], "status": "draft"}
    refused = client.post(ADMIN_TESTS, json=body, headers=admin)
    assert refused.status_code == 422
    assert "year of the paper" in str(refused.json())


def test_a_student_sees_the_papers_newest_year_first(client, asha, papers):
    listed = client.get(PAPERS, headers=asha).json()
    assert [paper["year"] for paper in listed] == [2026, 2025]
    assert [paper["question_count"] for paper in listed] == [3, 3]


def test_the_syllabus_counts_each_topic_in_each_year(client, asha, papers):
    body = client.get(SYLLABUS, headers=asha).json()
    assert body["years"] == [2025, 2026]
    optics = next(row for row in body["rows"] if row["topic"] == "Electrostatics")
    assert optics["counts"] == {"2025": 2, "2026": 3} and optics["total"] == 5
    mechanics = next(row for row in body["rows"] if row["topic"] == "Magnetism")
    assert mechanics["counts"] == {"2025": 1, "2026": 0}


def test_filter_topics_lists_each_subject_with_its_topics(client, asha, papers):
    body = client.get(TOPICS, headers=asha).json()
    physics = next(group for group in body if group["paper"] == "physics")
    assert {topic["name"] for topic in physics["topics"]} == {"Electrostatics", "Magnetism"}


def test_a_switched_off_screen_is_not_available(client, admin, asha, papers):
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    off = {"syllabus", "tools_syllabus"}
    sent = [{"key": row["key"], "enabled": False if row["key"] in off else row["enabled"], "label": row["label"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200
    assert client.get(SYLLABUS, headers=asha).status_code == 404
