"""Courses: the public list for the registration dropdown, and the admin's controls."""
import pytest

from app import courses
from app.tenants import ValidationError
from conftest import headers


@pytest.fixture
def school(make_tenant, add_member):
    """AaptPrep with its admin Ritesh and a student Asha."""
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


# ---- The public list ----

def test_the_public_list_shows_open_courses_in_name_order_with_only_id_name_and_fee(client, school, add_course):
    add_course("aaptprep", "IPMAT", 12000)
    clat = add_course("aaptprep", "CLAT", 10000)
    add_course("aaptprep", "cat", 8000)

    response = client.get("/api/courses", headers=headers("aaptprep"))

    assert response.status_code == 200
    assert [course["name"] for course in response.json()] == ["cat", "CLAT", "IPMAT"]
    assert response.json()[1] == {"id": clat["id"], "name": "CLAT", "fee": 10000}


def test_hidden_courses_are_left_out_of_the_public_list(client, school, add_course):
    add_course("aaptprep", "CLAT")
    add_course("aaptprep", "CUET", active=False)
    names = [course["name"] for course in client.get("/api/courses", headers=headers("aaptprep")).json()]
    assert names == ["CLAT"]


def test_an_institute_with_no_courses_gets_an_empty_list(client, school):
    assert client.get("/api/courses", headers=headers("aaptprep")).json() == []


def test_the_public_list_needs_an_institute(client, school):
    assert client.get("/api/courses").status_code == 400
    assert client.get("/api/courses", headers=headers("nobody")).status_code == 404


# ---- Who can manage courses ----

def test_managing_courses_needs_a_login_and_the_admin_role(client, school, add_course, sign_in):
    course = add_course("aaptprep", "CLAT")
    student = sign_in("aaptprep", "asha@example.com")
    body = {"name": "New", "fee": 1}

    for method, path, json in [
        ("get", "/api/admin/courses", None),
        ("post", "/api/admin/courses", body),
        ("patch", f"/api/admin/courses/{course['id']}", {"fee": 5}),
    ]:
        assert client.request(method, path, json=json, headers=headers("aaptprep")).status_code == 401, path
        assert client.request(method, path, json=json, headers=student).status_code == 403, path


def test_the_admin_sees_every_course_with_its_access_length_and_whether_it_is_open(client, admin, add_course):
    add_course("aaptprep", "CLAT", 10000)
    add_course("aaptprep", "CUET", 9000, {"type": "days", "days": 90}, active=False)

    response = client.get("/api/admin/courses", headers=admin)

    assert response.status_code == 200
    by_name = {course["name"]: course for course in response.json()}
    assert by_name["CLAT"]["access"] == {"type": "unlimited"}
    assert by_name["CLAT"]["active"] is True
    assert by_name["CUET"]["access"] == {"type": "days", "days": 90}
    assert by_name["CUET"]["active"] is False


# ---- Adding a course ----

def test_adding_a_course_defaults_to_unlimited_access_and_appears_in_the_public_list(client, admin):
    response = client.post("/api/admin/courses", json={"name": "CLAT", "fee": 10000}, headers=admin)

    assert response.status_code == 201
    course = response.json()
    assert course["name"] == "CLAT"
    assert course["fee"] == 10000
    assert course["access"] == {"type": "unlimited"}
    assert course["active"] is True
    assert [c["name"] for c in client.get("/api/courses", headers=headers("aaptprep")).json()] == ["CLAT"]


def test_a_course_can_end_after_a_number_of_days_or_on_a_date(client, admin):
    days = client.post("/api/admin/courses", json={"name": "A", "fee": 1, "access": {"type": "days", "days": 365}}, headers=admin)
    until = client.post(
        "/api/admin/courses", json={"name": "B", "fee": 1, "access": {"type": "until_date", "until": "2027-06-30"}}, headers=admin
    )
    assert days.json()["access"] == {"type": "days", "days": 365}
    assert until.json()["access"] == {"type": "until_date", "until": "2027-06-30"}


def test_a_free_course_is_allowed(client, admin):
    assert client.post("/api/admin/courses", json={"name": "Trial", "fee": 0}, headers=admin).status_code == 201


@pytest.mark.parametrize(
    "body, message",
    [
        ({"name": "", "fee": 1}, "1 to 80 characters"),
        ({"name": "x" * 81, "fee": 1}, "1 to 80 characters"),
        ({"name": "A", "fee": -1}, "whole number of rupees"),
        ({"name": "A", "fee": 10_000_001}, "whole number of rupees"),
        ({"name": "A", "fee": 1, "access": {"type": "days"}}, "number of days"),
        ({"name": "A", "fee": 1, "access": {"type": "days", "days": 0}}, "number of days"),
        ({"name": "A", "fee": 1, "access": {"type": "days", "days": 3651}}, "number of days"),
        ({"name": "A", "fee": 1, "access": {"type": "until_date", "until": "2020-01-01"}}, "can't be in the past"),
        ({"name": "A", "fee": 1, "access": {"type": "until_date", "until": "next year"}}, "YYYY-MM-DD"),
        ({"name": "A", "fee": 1, "access": {"type": "until_date"}}, "YYYY-MM-DD"),
        ({"name": "A", "fee": 1, "access": {"type": "forever"}}, "must be 'unlimited'"),
    ],
)
def test_bad_course_details_are_refused_with_a_clear_message(client, admin, body, message):
    response = client.post("/api/admin/courses", json=body, headers=admin)
    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_a_course_name_must_be_unique_ignoring_capitals_and_extra_spaces(client, admin):
    client.post("/api/admin/courses", json={"name": "CLAT Prep", "fee": 1}, headers=admin)

    duplicate = client.post("/api/admin/courses", json={"name": "  clat   PREP ", "fee": 1}, headers=admin)

    assert duplicate.status_code == 422
    assert "already exists" in duplicate.json()["detail"]
    assert len(client.get("/api/admin/courses", headers=admin).json()) == 1


def test_extra_spaces_in_a_name_are_tidied(client, admin):
    response = client.post("/api/admin/courses", json={"name": "  CLAT    Prep  ", "fee": 1}, headers=admin)
    assert response.json()["name"] == "CLAT Prep"


def test_a_fee_cannot_be_true_or_a_decimal():
    with pytest.raises(ValidationError):
        courses.clean_fee(True)
    with pytest.raises(ValidationError):
        courses.clean_fee(99.5)


# ---- Changing a course ----

def test_the_fee_and_access_length_can_be_changed(client, admin, add_course):
    course = add_course("aaptprep", "CLAT", 10000)

    response = client.patch(
        f"/api/admin/courses/{course['id']}",
        json={"fee": 12000, "access": {"type": "days", "days": 180}},
        headers=admin,
    )

    assert response.status_code == 200
    assert response.json()["fee"] == 12000
    assert response.json()["access"] == {"type": "days", "days": 180}
    assert response.json()["name"] == "CLAT"


def test_hiding_a_course_removes_it_from_the_dropdown_and_showing_it_brings_it_back(client, admin, add_course):
    course = add_course("aaptprep", "CLAT")

    client.patch(f"/api/admin/courses/{course['id']}", json={"active": False}, headers=admin)
    assert client.get("/api/courses", headers=headers("aaptprep")).json() == []

    client.patch(f"/api/admin/courses/{course['id']}", json={"active": True}, headers=admin)
    assert len(client.get("/api/courses", headers=headers("aaptprep")).json()) == 1


def test_renaming_keeps_the_same_course_and_frees_the_old_name(client, admin, add_course):
    course = add_course("aaptprep", "CLAT")

    renamed = client.patch(f"/api/admin/courses/{course['id']}", json={"name": "CLAT 2027"}, headers=admin)

    assert renamed.status_code == 200
    assert renamed.json()["id"] == course["id"]
    assert renamed.json()["name"] == "CLAT 2027"
    assert client.post("/api/admin/courses", json={"name": "CLAT", "fee": 1}, headers=admin).status_code == 201


def test_renaming_to_a_name_already_taken_is_refused_and_changes_nothing(client, admin, add_course):
    add_course("aaptprep", "CLAT")
    ipmat = add_course("aaptprep", "IPMAT")

    response = client.patch(f"/api/admin/courses/{ipmat['id']}", json={"name": "clat"}, headers=admin)

    assert response.status_code == 422
    assert "already exists" in response.json()["detail"]
    names = sorted(course["name"] for course in client.get("/api/admin/courses", headers=admin).json())
    assert names == ["CLAT", "IPMAT"]


def test_a_name_can_change_only_in_capitals(client, admin, add_course):
    course = add_course("aaptprep", "clat")
    response = client.patch(f"/api/admin/courses/{course['id']}", json={"name": "CLAT"}, headers=admin)
    assert response.status_code == 200
    assert response.json()["name"] == "CLAT"


def test_a_change_with_nothing_in_it_changes_nothing(client, admin, add_course):
    course = add_course("aaptprep", "CLAT", 10000)
    response = client.patch(f"/api/admin/courses/{course['id']}", json={}, headers=admin)
    assert response.status_code == 200
    assert response.json()["fee"] == 10000


def test_changing_a_course_that_does_not_exist_is_not_found(client, admin):
    assert client.patch("/api/admin/courses/nope", json={"fee": 1}, headers=admin).status_code == 404


def test_a_bad_change_is_refused_and_nothing_is_half_applied(client, admin, add_course):
    course = add_course("aaptprep", "CLAT", 10000)

    response = client.patch(
        f"/api/admin/courses/{course['id']}", json={"fee": 5000, "access": {"type": "days", "days": 0}}, headers=admin
    )

    assert response.status_code == 422
    assert client.get("/api/admin/courses", headers=admin).json()[0]["fee"] == 10000


# ---- Institutes keep their courses apart ----

def test_two_institutes_can_each_have_a_course_with_the_same_name(client, make_tenant, add_course):
    make_tenant("alpha")
    make_tenant("beta")
    add_course("alpha", "CLAT", 1000)
    add_course("beta", "CLAT", 2000)

    alpha = client.get("/api/courses", headers=headers("alpha")).json()
    beta = client.get("/api/courses", headers=headers("beta")).json()

    assert [c["fee"] for c in alpha] == [1000]
    assert [c["fee"] for c in beta] == [2000]
    assert alpha[0]["id"] != beta[0]["id"]


def test_one_institute_cannot_see_or_change_anothers_course(client, make_tenant, add_course, sign_in):
    make_tenant("alpha", admin_email="admin@alpha.example.com")
    make_tenant("beta", admin_email="admin@beta.example.com")
    betas_course = add_course("beta", "CLAT", 2000)
    alpha_admin = sign_in("alpha", "admin@alpha.example.com")

    assert client.get("/api/admin/courses", headers=alpha_admin).json() == []
    response = client.patch(f"/api/admin/courses/{betas_course['id']}", json={"fee": 1}, headers=alpha_admin)
    assert response.status_code == 404
    assert client.get("/api/courses", headers=headers("beta")).json()[0]["fee"] == 2000
