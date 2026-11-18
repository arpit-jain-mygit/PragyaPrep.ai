"""Batches: creating them, enrolling students (which opens the courses), seat limits, and what a student or parent sees."""
import pytest

from conftest import headers

URL = "/api/admin/batches"


@pytest.fixture
def school(make_tenant, add_member, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    for email in ("asha@example.com", "ravi@example.com", "mira@example.com"):
        add_member("aaptprep", email)
    add_member("aaptprep", "pending@example.com", status="pending")
    return {"cat": add_course("aaptprep", "CAT"), "clat": add_course("aaptprep", "CLAT")}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


def make(client, admin, school, **overrides):
    body = {"name": "Morning CAT", "course_ids": [school["cat"]["id"]], "start_date": "2027-02-01", "end_date": "2027-06-30", "seat_limit": 2, "faculty": "Dr Rao", "schedule": "Mon to Fri, 7 to 9 am", **overrides}
    made = client.post(URL, json=body, headers=admin)
    assert made.status_code == 201, made.text
    return made.json()


def courses_of(repo, email):
    return {a["course_id"]: a.get("source") for a in repo.scoped("aaptprep").list_access(email)}


def test_only_the_institute_admin_manages_batches(client, school, sign_in):
    assert client.get(URL, headers=headers("aaptprep")).status_code == 401
    assert client.get(URL, headers=sign_in("aaptprep", "asha@example.com")).status_code == 403


def test_a_batch_is_created_with_its_courses_dates_seats_faculty_and_timetable(client, admin, school):
    batch = make(client, admin, school)
    assert batch["name"] == "Morning CAT" and batch["course_names"] == ["CAT"] and batch["seat_limit"] == 2 and batch["seats_left"] == 2
    assert batch["faculty"] == "Dr Rao" and batch["schedule"] == "Mon to Fri, 7 to 9 am" and batch["enrolled"] == 0 and batch["students"] == []
    assert [b["name"] for b in client.get(URL, headers=admin).json()] == ["Morning CAT"]


@pytest.mark.parametrize("body,word", [
    ({"name": ""}, "1 to 80"), ({"course_ids": []}, "at least one course"), ({"course_ids": ["nope"]}, "from the list"), ({"start_date": "01/02/2027"}, "YYYY-MM-DD"),
    ({"start_date": "2027-03-01", "end_date": "2027-02-01"}, "before the start"), ({"seat_limit": 0}, "1 to 1000"), ({"seat_limit": "ten"}, "whole number"),
    ({"faculty": "x" * 81}, "80"), ({"schedule": "x" * 201}, "200"), ({"students": ["a@b.com"]}, "can't be set here"),
])
def test_bad_batches_are_refused(client, admin, school, body, word):
    response = client.post(URL, json={"name": "B", "course_ids": [school["cat"]["id"]], **body}, headers=admin)
    assert response.status_code == 422 and word in response.json()["detail"]
    assert client.get(URL, headers=admin).json() == []


def test_two_batches_cannot_share_a_name(client, admin, school):
    make(client, admin, school)
    again = client.post(URL, json={"name": " morning cat ", "course_ids": [school["cat"]["id"]]}, headers=admin)
    assert again.status_code == 422 and "already exists" in again.json()["detail"]


def test_enrolling_opens_the_batchs_courses_and_removing_closes_them(client, admin, school, repo):
    batch = make(client, admin, school, course_ids=[school["cat"]["id"], school["clat"]["id"]])
    done = client.post(f"{URL}/{batch['id']}/students", json={"emails": ["asha@example.com", "Ravi@Example.com"]}, headers=admin)
    assert done.status_code == 200 and done.json()["enrolled"] == 2 and done.json()["seats_left"] == 0
    assert [s["email"] for s in done.json()["students"]] == ["asha@example.com", "ravi@example.com"]
    assert courses_of(repo, "asha@example.com") == {school["cat"]["id"]: "batch", school["clat"]["id"]: "batch"}
    gone = client.delete(f"{URL}/{batch['id']}/students/asha@example.com", headers=admin)
    assert gone.status_code == 200 and gone.json()["enrolled"] == 1
    assert courses_of(repo, "asha@example.com") == {}
    assert len(courses_of(repo, "ravi@example.com")) == 2


def test_enrolling_again_changes_nothing_and_access_the_admin_gave_is_never_taken_away(client, admin, school, repo):
    client.post(f"/api/admin/registrations/asha@example.com/access", json={"course_id": school["cat"]["id"]}, headers=admin)
    before = courses_of(repo, "asha@example.com")
    batch = make(client, admin, school)
    client.post(f"{URL}/{batch['id']}/students", json={"emails": ["asha@example.com"]}, headers=admin)
    client.post(f"{URL}/{batch['id']}/students", json={"emails": ["asha@example.com"]}, headers=admin)
    assert courses_of(repo, "asha@example.com") == before
    client.delete(f"{URL}/{batch['id']}/students/asha@example.com", headers=admin)
    assert courses_of(repo, "asha@example.com") == before


def test_a_course_stays_open_while_another_batch_still_needs_it(client, admin, school, repo):
    a = make(client, admin, school, name="Morning CAT", seat_limit=None)
    b = make(client, admin, school, name="Evening CAT", seat_limit=None)
    for batch in (a, b):
        client.post(f"{URL}/{batch['id']}/students", json={"emails": ["asha@example.com"]}, headers=admin)
    client.delete(f"{URL}/{a['id']}/students/asha@example.com", headers=admin)
    assert school["cat"]["id"] in courses_of(repo, "asha@example.com")
    client.delete(f"{URL}/{b['id']}/students/asha@example.com", headers=admin)
    assert courses_of(repo, "asha@example.com") == {}


def test_seat_limits_are_kept_and_nothing_is_added_when_they_would_run_out(client, admin, school):
    batch = make(client, admin, school, seat_limit=2)
    full = client.post(f"{URL}/{batch['id']}/students", json={"emails": ["asha@example.com", "ravi@example.com", "mira@example.com"]}, headers=admin)
    assert full.status_code == 409 and "2 seats left" in full.json()["detail"]
    assert client.get(f"{URL}/{batch['id']}", headers=admin).json()["enrolled"] == 0
    lower = client.patch(f"{URL}/{batch['id']}", json={"seat_limit": 5}, headers=admin)
    assert lower.status_code == 200
    client.post(f"{URL}/{batch['id']}/students", json={"emails": ["asha@example.com", "ravi@example.com"]}, headers=admin)
    too_low = client.patch(f"{URL}/{batch['id']}", json={"seat_limit": 1}, headers=admin)
    assert too_low.status_code == 422 and "already in this batch" in too_low.json()["detail"]


@pytest.mark.parametrize("emails,word", [(["pending@example.com"], "not approved"), (["nobody@example.com"], "not a student"), ([], "at least one"), ("asha@example.com", "at least one")])
def test_only_approved_students_can_be_enrolled(client, admin, school, emails, word):
    batch = make(client, admin, school)
    response = client.post(f"{URL}/{batch['id']}/students", json={"emails": emails}, headers=admin)
    assert response.status_code == 422 and word in response.json()["detail"]


def test_changing_the_courses_opens_and_closes_them_for_everyone_in_the_batch(client, admin, school, repo):
    batch = make(client, admin, school, seat_limit=None)
    client.post(f"{URL}/{batch['id']}/students", json={"emails": ["asha@example.com"]}, headers=admin)
    client.patch(f"{URL}/{batch['id']}", json={"course_ids": [school["clat"]["id"]]}, headers=admin)
    assert courses_of(repo, "asha@example.com") == {school["clat"]["id"]: "batch"}


def test_archiving_closes_the_courses_and_making_it_active_opens_them_again(client, admin, school, repo):
    batch = make(client, admin, school, seat_limit=None)
    client.post(f"{URL}/{batch['id']}/students", json={"emails": ["asha@example.com"]}, headers=admin)
    client.patch(f"{URL}/{batch['id']}", json={"status": "archived"}, headers=admin)
    assert courses_of(repo, "asha@example.com") == {}
    refused = client.post(f"{URL}/{batch['id']}/students", json={"emails": ["ravi@example.com"]}, headers=admin)
    assert refused.status_code == 422 and "archived" in refused.json()["detail"]
    client.patch(f"{URL}/{batch['id']}", json={"status": "active"}, headers=admin)
    assert school["cat"]["id"] in courses_of(repo, "asha@example.com")


def test_a_student_sees_only_their_own_active_batches_without_the_other_students(client, admin, school, sign_in):
    mine = make(client, admin, school, name="Morning CAT", seat_limit=None)
    other = make(client, admin, school, name="Evening CAT", seat_limit=None)
    client.post(f"{URL}/{mine['id']}/students", json={"emails": ["asha@example.com", "ravi@example.com"]}, headers=admin)
    client.post(f"{URL}/{other['id']}/students", json={"emails": ["ravi@example.com"]}, headers=admin)
    asha = sign_in("aaptprep", "asha@example.com")
    seen = client.get("/api/my/batches", headers=asha).json()
    assert [b["name"] for b in seen] == ["Morning CAT"] and seen[0]["faculty"] == "Dr Rao" and seen[0]["schedule"] == "Mon to Fri, 7 to 9 am"
    assert "students" not in seen[0] and "ravi" not in str(seen)
    client.patch(f"{URL}/{mine['id']}", json={"status": "archived"}, headers=admin)
    assert client.get("/api/my/batches", headers=asha).json() == []


def test_a_parent_sees_their_childs_batches(client, admin, school, repo, sign_in):
    batch = make(client, admin, school, seat_limit=None)
    client.post(f"{URL}/{batch['id']}/students", json={"emails": ["asha@example.com"]}, headers=admin)
    repo.scoped("aaptprep").create_member({"email": "mum@example.com", "role": "parent", "status": "approved", "first_name": "Meena", "last_name": "Rao", "children": ["asha@example.com"]})
    mum = sign_in("aaptprep", "mum@example.com")
    detail = client.get("/api/parent/children/asha@example.com", headers=mum).json()
    assert [b["name"] for b in detail["batches"]] == ["Morning CAT"]


def test_one_institute_cannot_see_anothers_batches(client, make_tenant, admin, school, sign_in):
    make(client, admin, school)
    make_tenant("other", "Other", "boss@other.example.com")
    other = sign_in("other", "boss@other.example.com")
    assert client.get(URL, headers=other).json() == []
    batch_id = client.get(URL, headers=admin).json()[0]["id"]
    assert client.get(f"{URL}/{batch_id}", headers=other).status_code == 404
