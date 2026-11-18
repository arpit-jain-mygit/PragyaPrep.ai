"""A parent sees only their own children, with progress and weak areas, and can set a child a practice test."""
import pytest

from conftest import headers
from test_parents import PARENTS, add
from test_student_tests import QUESTIONS, URL, admin, answer, asha, q, school, start, submit  # noqa: F401

OPTICS = [f"Optics {i}" for i in range(6)]


@pytest.fixture
def meena(client, admin, school, asha, sign_in):
    add(client, admin, student_email="asha@example.com")
    return sign_in("aaptprep", "meena@example.com")


@pytest.fixture
def bank(client, admin):
    return [q(client, admin, text)["id"] for text in OPTICS]


def test_a_parent_sees_their_child_and_course_progress(client, meena):
    kids = client.get("/api/parent/children", headers=meena).json()
    assert [(k["email"], k["name"], k["status"]) for k in kids] == [("asha@example.com", "Asha Rao", "approved")]
    assert [c["name"] for c in kids[0]["courses"]] == ["CAT"]
    assert kids[0]["courses"][0]["row"]["status"]


def test_the_detail_has_courses_tests_and_weak_areas(client, admin, school, bank, asha, meena):
    from test_student_tests import make_test
    test = make_test(client, admin, school, bank)
    start(client, asha, test["id"])
    answer(client, asha, test["id"], 1, {i: 0 for i in bank})
    assert submit(client, asha, test["id"], 1).status_code == 200
    data = client.get("/api/parent/children/asha@example.com", headers=meena).json()
    assert data["student"]["name"] == "Asha Rao"
    assert data["courses"][0]["course"]["name"] == "CAT" and data["courses"][0]["tests"][0]["title"] == "Mock 1"
    assert data["results"]["summary"]["attempts"] == 1
    assert data["results"]["subjects"][0]["id"] == "physics" and data["results"]["subjects"][0]["topics"][0]["topic"] == "Optics"
    assert "attempts" not in data["results"]


def test_a_parent_cannot_see_a_student_who_is_not_their_child(client, admin, school, meena):
    assert client.get("/api/parent/children/ravi@example.com", headers=meena).status_code == 404
    assert client.get("/api/parent/children/nobody@example.com", headers=meena).status_code == 404
    assert client.get("/api/parent/children/not-an-email", headers=meena).status_code == 404
    assert client.post("/api/parent/children/ravi@example.com/practice", json={"paper": "physics", "topic": "Optics"}, headers=meena).status_code == 404


def test_a_parent_sets_a_practice_test_the_child_finds_in_their_tests(client, bank, asha, meena):
    made = client.post("/api/parent/children/asha@example.com/practice", json={"paper": "physics", "topic": "Optics", "count": 5}, headers=meena)
    assert made.status_code == 201 and made.json()["question_count"] == 5
    card = next(t for t in client.get(URL, headers=asha).json() if t["id"] == made.json()["id"])
    assert card["practice"] is True and card["set_by"] == "meena@example.com"
    assert start(client, asha, made.json()["id"]).status_code == 201


def test_a_child_who_is_not_enrolled_cannot_be_set_a_practice_test(client, admin, school, bank, sign_in):
    add(client, admin, email="rita@example.com", student_email="ravi@example.com")
    rita = sign_in("aaptprep", "rita@example.com")
    response = client.post("/api/parent/children/ravi@example.com/practice", json={"paper": "physics", "topic": "Optics"}, headers=rita)
    assert response.status_code == 403 and "enrolled" in response.json()["detail"]


def test_two_parents_can_share_a_child_and_a_parent_can_have_two_children(client, admin, school, asha, meena, sign_in):
    add(client, admin, email="vikram@example.com", first_name="Vikram", student_email="asha@example.com")
    add(client, admin, student_email="ravi@example.com")
    vikram = sign_in("aaptprep", "vikram@example.com")
    assert [k["email"] for k in client.get("/api/parent/children", headers=vikram).json()] == ["asha@example.com"]
    assert sorted(k["email"] for k in client.get("/api/parent/children", headers=meena).json()) == ["asha@example.com", "ravi@example.com"]


def test_an_unlinked_child_disappears_from_the_parent(client, admin, meena):
    client.delete(f"{PARENTS}/meena@example.com/children/asha@example.com", headers=admin)
    assert client.get("/api/parent/children", headers=meena).json() == []
    assert client.get("/api/parent/children/asha@example.com", headers=meena).status_code == 404


def test_only_parents_can_use_it_and_parents_cannot_use_student_pages(client, admin, asha, meena):
    for call in (lambda h: client.get("/api/parent/children", headers=h), lambda h: client.get("/api/parent/children/asha@example.com", headers=h)):
        assert call(headers("aaptprep")).status_code == 401
        assert call(asha).status_code == 403
        assert call(admin).status_code == 403
    for path in ("/api/my/coursework", "/api/my/tests", "/api/my/results", "/api/my/live-classes"):
        assert client.get(path, headers=meena).status_code == 403
    assert client.post("/api/my/practice", json={"paper": "physics", "topic": "Optics"}, headers=meena).status_code == 403


def test_the_detail_lists_practice_tests_with_who_set_them(client, bank, asha, meena):
    own = client.post("/api/my/practice", json={"paper": "physics", "topic": "Optics", "count": 5}, headers=asha).json()
    set_by = client.post("/api/parent/children/asha@example.com/practice", json={"paper": "physics", "topic": "Optics", "count": 5}, headers=meena).json()
    start(client, asha, own["id"])
    data = client.get("/api/parent/children/asha@example.com", headers=meena).json()
    by_id = {p["id"]: p for p in data["practice"]}
    assert by_id[own["id"]]["set_by_parent"] is False and by_id[own["id"]]["attempts_used"] == 1
    assert by_id[set_by["id"]]["set_by_parent"] is True and by_id[set_by["id"]]["best"] is None
    assert {"title", "question_count", "created_at"} <= set(by_id[set_by["id"]])
