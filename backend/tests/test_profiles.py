"""A student's or parent's own profile: what they can keep, what they cannot touch, photo, data download, deletion request."""
import pytest

from conftest import headers

URL = "/api/me/profile"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 2000


@pytest.fixture
def storage(client):
    return client.app.state.storage


@pytest.fixture
def school(make_tenant):
    return make_tenant("aaptprep", "AaptPrep", "boss@aaptprep.example.com")


@pytest.fixture
def people(school, repo, sign_in):
    scoped = repo.scoped("aaptprep")
    scoped.create_member({"email": "asha@example.com", "role": "student", "status": "approved", "first_name": "Asha", "last_name": "Rao", "course_ids": ["c1"]})
    scoped.create_member({"email": "mum@example.com", "role": "parent", "status": "approved", "first_name": "Meena", "last_name": "Rao", "children": ["asha@example.com"]})
    return {"student": sign_in("aaptprep", "asha@example.com"), "parent": sign_in("aaptprep", "mum@example.com"), "admin": sign_in("aaptprep", "boss@aaptprep.example.com")}


def test_only_students_and_parents_have_a_profile(client, people):
    assert client.get(URL, headers=headers("aaptprep")).status_code == 401
    assert client.get(URL, headers=people["admin"]).status_code == 403


def test_a_new_student_sees_defaults_and_their_linked_parent(client, people):
    profile = client.get(URL, headers=people["student"]).json()
    assert profile["role"] == "student" and profile["first_name"] == "Asha"
    assert profile["target_exams"] == [] and profile["weekly_goal_hours"] == 0 and profile["exam_date"] == ""
    assert profile["notify"] == {"announcements": True, "tests": True, "live_classes": True}
    assert profile["linked"] == [{"name": "Meena Rao", "email": "mum@example.com"}] and profile["avatar_url"] == ""


def test_a_student_saves_their_details_and_the_rest_stay(client, people):
    done = client.put(URL, json={"mobile": "+91 98765 43210", "birth_date": "2008-05-04", "target_exams": ["CLAT", " clat ", "CUET", ""], "exam_date": "2027-05-20", "weekly_goal_hours": 12}, headers=people["student"])
    assert done.status_code == 200, done.text
    assert done.json()["mobile"] == "9876543210" and done.json()["target_exams"] == ["CLAT", "CUET"] and done.json()["weekly_goal_hours"] == 12
    client.put(URL, json={"notify": {"tests": False}}, headers=people["student"])
    again = client.get(URL, headers=people["student"]).json()
    assert again["notify"] == {"announcements": True, "tests": False, "live_classes": True} and again["exam_date"] == "2027-05-20"


@pytest.mark.parametrize("body,word", [
    ({"mobile": "12345"}, "10-digit"), ({"birth_date": "04/05/2008"}, "YYYY-MM-DD"), ({"birth_date": "2030-01-01"}, "valid birth date"),
    ({"exam_date": "2020-01-01"}, "today or later"), ({"weekly_goal_hours": 200}, "0 to 80"), ({"weekly_goal_hours": "ten"}, "whole number"),
    ({"target_exams": ["a", "b", "c", "d", "e", "f"]}, "up to 5"), ({"target_exams": ["x" * 41]}, "40 characters"),
    ({"notify": {"sms": True}}, "on or off"), ({"first_name": "Zed"}, "can't be changed"), ({"role": "tenant_admin"}, "can't be changed"),
])
def test_bad_student_details_are_refused(client, people, body, word):
    response = client.put(URL, json=body, headers=people["student"])
    assert response.status_code == 422 and word in response.json()["detail"]


def test_a_parent_saves_their_details_and_consent_is_stamped(client, people):
    first = client.get(URL, headers=people["parent"]).json()
    assert first["role"] == "parent" and first["summary"] == "weekly" and first["consent"] is False
    assert first["linked"] == [{"name": "Asha Rao", "email": "asha@example.com"}]
    done = client.put(URL, json={"relation": "Mother", "summary": "monthly", "consent": True, "mobile": "9876543210"}, headers=people["parent"])
    assert done.status_code == 200 and done.json()["relation"] == "Mother" and done.json()["summary"] == "monthly" and done.json()["consent"] is True


@pytest.mark.parametrize("body", [{"relation": "Uncle"}, {"summary": "daily"}, {"consent": "yes"}, {"target_exams": ["CLAT"]}])
def test_bad_parent_details_are_refused(client, people, body):
    assert client.put(URL, json=body, headers=people["parent"]).status_code == 422


def test_profiles_are_private_to_each_person(client, people):
    client.put(URL, json={"weekly_goal_hours": 9}, headers=people["student"])
    assert client.get(URL, headers=people["parent"]).json().get("weekly_goal_hours") is None


@pytest.mark.parametrize("who", ["student", "parent"])
def test_a_photo_can_be_set_and_removed(client, people, storage, who):
    start = client.post("/api/me/photo", headers=people[who])
    assert start.status_code == 200 and start.json()["key"].startswith("aaptprep/avatars/")
    storage.put(start.json()["key"], JPEG, "image/jpeg")
    done = client.post("/api/me/photo/complete", json={"key": start.json()["key"]}, headers=people[who])
    assert done.status_code == 200 and done.json()["avatar_url"].startswith("http")
    assert client.get("/api/auth/me", headers=people[who]).json()["avatar_url"].startswith("http")
    gone = client.delete("/api/me/photo", headers=people[who])
    assert gone.status_code == 200 and gone.json()["avatar_url"] == "" and storage.size(start.json()["key"]) is None


def test_a_photo_that_never_arrived_or_is_from_another_folder_is_refused(client, people, storage):
    assert client.post("/api/me/photo/complete", json={"key": "aaptprep/avatars/none.jpg"}, headers=people["student"]).status_code == 422
    storage.put("other/avatars/x.jpg", JPEG, "image/jpeg")
    assert client.post("/api/me/photo/complete", json={"key": "other/avatars/x.jpg"}, headers=people["student"]).status_code == 422


def test_the_person_can_download_their_data(client, people):
    client.put(URL, json={"target_exams": ["CLAT"]}, headers=people["student"])
    response = client.get("/api/me/export", headers=people["student"])
    assert response.status_code == 200 and "attachment" in response.headers["content-disposition"]
    body = response.json()
    assert body["profile"]["email"] == "asha@example.com" and body["profile"]["target_exams"] == ["CLAT"] and body["courses"] == ["c1"]
    assert "avatar_key" not in str(body) and "code_hash" not in str(body)


def test_a_deletion_request_tells_the_admin_once_and_can_be_cancelled(client, people, mailer):
    sent = len(mailer.sent)
    first = client.post("/api/me/delete-request", headers=people["student"])
    assert first.status_code == 202
    email = mailer.sent[sent]
    assert email.to == "boss@aaptprep.example.com" and "asha@example.com" in email.body
    assert client.get(URL, headers=people["student"]).json()["deletion_requested"] is True
    assert client.post("/api/me/delete-request", headers=people["student"]).status_code == 409
    assert len(mailer.sent) == sent + 1
    assert client.delete("/api/me/delete-request", headers=people["student"]).status_code == 200
    assert client.get(URL, headers=people["student"]).json()["deletion_requested"] is False
    assert client.post("/api/me/delete-request", headers=people["student"]).status_code == 202
