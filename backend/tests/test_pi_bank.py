"""PI question bank: the admin's questions, and each student's own done marks."""
import pytest

from app import pi_bank

ADMIN_URL = "/api/admin/pi-questions"
URL = "/api/my/pi-questions"


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


@pytest.fixture
def student(admin, add_member, sign_in):
    add_member("aaptprep", "asha@example.com")
    return sign_in("aaptprep", "asha@example.com")


@pytest.fixture
def other(admin, add_member, sign_in):
    add_member("aaptprep", "ravi@example.com")
    return sign_in("aaptprep", "ravi@example.com")


def _add(client, admin, question, topic="Current affairs", subtopic="", hint=""):
    response = client.post(ADMIN_URL, json={"topic": topic, "subtopic": subtopic, "question": question, "hint": hint}, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


def test_the_admin_adds_questions_and_sees_them_in_the_order_added(client, admin):
    _add(client, admin, "What is the national emblem?")
    _add(client, admin, "Why is the Constitution called living?")
    assert [row["question"] for row in client.get(ADMIN_URL, headers=admin).json()] == [
        "What is the national emblem?", "Why is the Constitution called living?",
    ]


def test_a_missing_subtopic_becomes_general(client, admin):
    added = _add(client, admin, "Name a river.", topic="Geography")
    assert added["subtopic"] == "General"


def test_every_mistake_is_reported_together(client, admin):
    refused = client.post(ADMIN_URL, json={"topic": " ", "question": "", "hint": "x" * 501}, headers=admin)
    assert refused.status_code == 422
    detail = refused.json()["detail"]
    assert "Type the topic." in detail and "Type the question." in detail and "hint can be at most 500" in detail


def test_a_question_can_be_removed(client, admin):
    added = _add(client, admin, "Name a river.")
    assert client.delete(f"{ADMIN_URL}/{added['id']}", headers=admin).status_code == 204
    assert client.get(ADMIN_URL, headers=admin).json() == []


def test_students_can_not_manage_the_bank(client, student):
    assert client.post(ADMIN_URL, json={"topic": "x", "question": "y"}, headers=student).status_code == 403
    assert client.get(ADMIN_URL, headers=student).status_code == 403


def test_a_student_sees_the_counts_topics_and_subtopics(client, admin, student):
    _add(client, admin, "Q1", topic="Current affairs", subtopic="Polity")
    _add(client, admin, "Q2", topic="Current affairs", subtopic="Economy")
    _add(client, admin, "Q3", topic="Self")
    view = client.get(URL, headers=student).json()
    assert view["counts"] == {"new": 3, "done": 0, "total": 3}
    assert view["topics"] == [
        {"name": "Current affairs", "subtopics": ["Economy", "Polity"]},
        {"name": "Self", "subtopics": ["General"]},
    ]


def test_marking_a_question_done_sends_it_to_the_bottom(client, admin, student):
    first = _add(client, admin, "Q1")
    _add(client, admin, "Q2")
    assert client.put(f"{URL}/{first['id']}/done", headers=student).json() == {"id": first["id"], "done": True}
    view = client.get(URL, headers=student).json()
    assert [row["question"] for row in view["questions"]] == ["Q2", "Q1"]
    assert view["questions"][-1]["done"] is True
    assert view["counts"] == {"new": 1, "done": 1, "total": 2}


def test_undoing_a_mark_brings_the_question_back_in_its_place(client, admin, student):
    first = _add(client, admin, "Q1")
    _add(client, admin, "Q2")
    client.put(f"{URL}/{first['id']}/done", headers=student)
    client.delete(f"{URL}/{first['id']}/done", headers=student)
    assert [row["question"] for row in client.get(URL, headers=student).json()["questions"]] == ["Q1", "Q2"]


def test_one_student_marks_never_show_for_another(client, admin, student, other):
    first = _add(client, admin, "Q1")
    client.put(f"{URL}/{first['id']}/done", headers=student)
    assert client.get(URL, headers=other).json()["counts"] == {"new": 1, "done": 0, "total": 1}


def test_marking_an_unknown_question_is_refused(client, student):
    assert client.put(f"{URL}/nope/done", headers=student).status_code == 404


def test_the_bank_is_hidden_when_the_institute_switches_it_off(client, admin, student):
    features = client.get("/api/admin/features", headers=admin).json()["features"]
    rows = [{"key": row["key"], "enabled": row["enabled"] if row["key"] != "pi_bank" else False, "label": row["label"]} for row in features]
    assert client.put("/api/admin/features", json=rows, headers=admin).status_code == 200
    assert client.get(URL, headers=student).status_code == 404


def test_clean_trims_and_fills_the_subtopic():
    assert pi_bank.clean({"topic": " Polity ", "subtopic": " ", "question": " Who is the head? ", "hint": None}) == {
        "topic": "Polity", "subtopic": "General", "question": "Who is the head?", "hint": "",
    }
