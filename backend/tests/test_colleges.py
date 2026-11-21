"""Colleges: the admin's eligibility rules and cutoffs, and the student's views of them."""
import pytest

from app import colleges

ADMIN = "/api/admin/colleges"
MY_ELIGIBILITY = "/api/my/eligibility"
MY_CUTOFFS = "/api/my/cutoffs"


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


@pytest.fixture
def student(admin, add_member, sign_in):
    add_member("aaptprep", "asha@example.com")
    return sign_in("aaptprep", "asha@example.com")


def _college(client, admin, name="IIM Indore", rules=None):
    response = client.post(ADMIN, json={"name": name, "rules": rules or []}, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


def _cutoff(client, admin, college_id, **fields):
    body = {"year": 2026, "category": "General", "section": "SA", "cutoff": 28, **fields}
    response = client.put(f"{ADMIN}/{college_id}/cutoffs", json=body, headers=admin)
    assert response.status_code == 200, response.text
    return response.json()


def test_the_admin_adds_a_college_with_its_rules(client, admin):
    college = _college(client, admin, rules=[
        {"type": "dob_on_or_after", "value": "2007-08-01"},
        {"type": "min_tenth_percent", "value": "60"},
        {"type": "twelfth_maths", "value": None},
    ])
    assert college["rules"] == [
        {"type": "dob_on_or_after", "value": "2007-08-01"},
        {"type": "min_tenth_percent", "value": 60},
        {"type": "twelfth_maths", "value": True},
    ]
    assert client.get(ADMIN, headers=admin).json()[0]["name"] == "IIM Indore"


def test_every_mistake_in_a_college_is_reported_together(client, admin):
    refused = client.post(ADMIN, json={"name": " ", "rules": [{"type": "min_tenth_percent", "value": 140}, {"type": "nope"}]}, headers=admin)
    assert refused.status_code == 422
    detail = refused.json()["detail"]
    assert "Type the college name." in detail and "from 0 to 100" in detail and "Choose a rule" in detail


def test_the_admin_can_change_and_remove_a_college(client, admin):
    college = _college(client, admin)
    changed = client.put(f"{ADMIN}/{college['id']}", json={"name": "IIM Indore (new)", "rules": []}, headers=admin)
    assert changed.status_code == 200 and changed.json()["name"] == "IIM Indore (new)"
    assert client.delete(f"{ADMIN}/{college['id']}", headers=admin).status_code == 204
    assert client.get(ADMIN, headers=admin).json() == []


def test_removing_a_college_removes_its_cutoffs(client, admin, student):
    college = _college(client, admin)
    _cutoff(client, admin, college["id"])
    client.delete(f"{ADMIN}/{college['id']}", headers=admin)
    assert client.get(f"{MY_CUTOFFS}?college={college['id']}", headers=student).status_code == 404


def test_a_cutoff_for_the_same_year_category_and_section_replaces_the_old_one(client, admin, student):
    college = _college(client, admin)
    _cutoff(client, admin, college["id"], cutoff=28)
    _cutoff(client, admin, college["id"], cutoff=30, seats=150)
    view = client.get(f"{MY_CUTOFFS}?college={college['id']}", headers=student).json()
    assert len(view["rows"]) == 1 and view["rows"][0]["cutoff"] == 30 and view["rows"][0]["seats"] == 150


def test_the_student_sees_the_latest_year_unless_another_is_chosen(client, admin, student):
    college = _college(client, admin)
    _cutoff(client, admin, college["id"], year=2025, cutoff=20)
    _cutoff(client, admin, college["id"], year=2026, cutoff=28)
    latest = client.get(f"{MY_CUTOFFS}?college={college['id']}", headers=student).json()
    assert latest["years"] == [2026, 2025] and latest["year"] == 2026 and latest["rows"][0]["cutoff"] == 28
    older = client.get(f"{MY_CUTOFFS}?college={college['id']}&year=2025", headers=student).json()
    assert older["rows"][0]["cutoff"] == 20


def test_a_bad_cutoff_is_reported_together(client, admin):
    college = _college(client, admin)
    refused = client.put(f"{ADMIN}/{college['id']}/cutoffs", json={"year": 1999, "category": "X", "section": "Y", "cutoff": "abc"}, headers=admin)
    assert refused.status_code == 422
    detail = refused.json()["detail"]
    assert "year must be" in detail and "category" in detail and "section" in detail and "cutoff must be" in detail


def test_the_student_sees_the_rules_but_no_cutoffs_on_eligibility(client, admin, student):
    _college(client, admin, rules=[{"type": "twelfth_year_or_later", "value": 2026}])
    listed = client.get(MY_ELIGIBILITY, headers=student).json()
    assert listed == [{"id": listed[0]["id"], "name": "IIM Indore", "rules": [{"type": "twelfth_year_or_later", "value": 2026}]}]


def test_the_colleges_are_hidden_when_the_institute_switches_them_off(client, admin, student):
    features = client.get("/api/admin/features", headers=admin).json()["features"]
    rows = [{"key": row["key"], "enabled": row["enabled"] if row["key"] not in ("eligibility", "cutoffs") else False, "label": row["label"]} for row in features]
    assert client.put("/api/admin/features", json=rows, headers=admin).status_code == 200
    assert client.get(MY_ELIGIBILITY, headers=student).status_code == 404
    assert client.get("/api/my/colleges", headers=student).status_code == 404


def test_students_can_not_manage_colleges(client, student):
    assert client.post(ADMIN, json={"name": "x"}, headers=student).status_code == 403


def test_the_rule_values_are_checked_by_their_kind():
    assert colleges.clean_college({"name": "A", "rules": [{"type": "dob_on_or_after", "value": "2007-08-01"}]})["rules"][0]["value"] == "2007-08-01"
    with pytest.raises(Exception) as bad:
        colleges.clean_college({"name": "A", "rules": [{"type": "dob_on_or_after", "value": "01/08/2007"}]})
    assert "real date" in str(bad.value)
