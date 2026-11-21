"""Application tracker: each student keeps their own list of college applications."""
import pytest

from app import applications

URL = "/api/my/applications"


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


def _add(client, student, **fields):
    body = {"college": "Delhi University", "programme": "B.Com (Hons)", **fields}
    response = client.post(URL, json=body, headers=student)
    assert response.status_code == 201, response.text
    return response.json()


def test_a_student_adds_an_application_with_the_planning_stage_by_default(client, student):
    added = _add(client, student)
    assert added["status"] == "planning"
    assert added["deadline"] is None and added["notes"] == ""
    assert client.get(URL, headers=student).json()[0]["id"] == added["id"]


def test_every_mistake_is_reported_together(client, student):
    refused = client.post(URL, json={"college": " ", "programme": "", "status": "maybe", "deadline": "31/12/2026", "notes": "x" * 301}, headers=student)
    assert refused.status_code == 422
    detail = refused.json()["detail"]
    assert "Type the college." in detail and "Type the programme" in detail and "Choose a stage" in detail
    assert "must be a real date" in detail and "notes can be at most 300" in detail


def test_the_stage_and_the_note_can_be_changed(client, student):
    added = _add(client, student)
    response = client.put(f"{URL}/{added['id']}", json={"college": "Delhi University", "programme": "B.Com (Hons)", "status": "applied", "deadline": "2026-12-15", "notes": "Form sent"}, headers=student)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "applied" and response.json()["deadline"] == "2026-12-15"
    row = client.get(URL, headers=student).json()[0]
    assert row["notes"] == "Form sent" and row["updated_at"] >= row["created_at"]


def test_a_row_can_be_removed(client, student):
    added = _add(client, student)
    assert client.delete(f"{URL}/{added['id']}", headers=student).status_code == 204
    assert client.get(URL, headers=student).json() == []


def test_the_nearest_deadline_comes_first_and_rows_without_one_last(client, student):
    _add(client, student, college="Late College", deadline="2027-01-10")
    _add(client, student, college="No Date College")
    _add(client, student, college="Soon College", deadline="2026-12-01")
    colleges = [row["college"] for row in client.get(URL, headers=student).json()]
    assert colleges == ["Soon College", "Late College", "No Date College"]


def test_a_student_can_not_see_or_change_another_students_rows(client, student, other):
    added = _add(client, student)
    assert client.get(URL, headers=other).json() == []
    assert client.put(f"{URL}/{added['id']}", json={"college": "x", "programme": "y"}, headers=other).status_code == 404
    assert client.delete(f"{URL}/{added['id']}", headers=other).status_code == 404
    assert len(client.get(URL, headers=student).json()) == 1


def test_the_admin_can_not_use_the_tracker(client, admin):
    assert client.get(URL, headers=admin).status_code == 403


def test_the_tracker_is_hidden_when_the_institute_switches_it_off(client, admin, student):
    features = client.get("/api/admin/features", headers=admin).json()["features"]
    rows = [{"key": row["key"], "enabled": row["enabled"] if row["key"] != "application_tracker" else False, "label": row["label"]} for row in features]
    assert client.put("/api/admin/features", json=rows, headers=admin).status_code == 200
    assert client.get(URL, headers=student).status_code == 404
    assert client.post(URL, json={"college": "x", "programme": "y"}, headers=student).status_code == 404


def test_clean_keeps_the_trimmed_values_and_blanks_the_empty_deadline():
    cleaned = applications.clean({"college": " IIT Delhi ", "programme": " MBA ", "status": "applied", "deadline": "", "notes": None})
    assert cleaned == {"college": "IIT Delhi", "programme": "MBA", "status": "applied", "deadline": None, "notes": ""}
