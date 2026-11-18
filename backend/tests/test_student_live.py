"""Students see the published live classes of the courses they can open, and open the files through the usual link."""
import pytest

from conftest import headers
from test_live_classes import add_file, url as admin_url

MINE = "/api/my/live-classes"


@pytest.fixture
def school(make_tenant, add_member, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")
    add_member("aaptprep", "ravi@example.com")
    return {"cat": add_course("aaptprep", "CAT"), "clat": add_course("aaptprep", "CLAT")}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


def give(client, admin, email, course):
    assert client.post(f"/api/admin/registrations/{email}/access", json={"course_id": course["id"]}, headers=admin).status_code == 201


@pytest.fixture
def classes(client, admin, school, repo):
    cid, clat = school["cat"]["id"], school["clat"]["id"]
    video = add_file(repo, cid, "v1", "algebra.mp4")
    slides = add_file(repo, cid, "p1", "algebra.pdf", kind="pdf")
    post = lambda course, **b: client.post(admin_url(course), json=b, headers=admin)
    post(cid, title="Algebra", held_on="2027-01-10", held_time="18:00", description="Ch 1", status="published",
         materials=[{"type": "file", "file_id": video}, {"type": "file", "file_id": slides}, {"type": "link", "url": "https://a.com", "title": "Notes"}])
    post(cid, title="Geometry", held_on="2027-01-12", description="Ch 2", status="published")
    post(cid, title="Draft one", held_on="2027-01-13", description="soon")
    post(clat, title="Legal reasoning", held_on="2027-01-11", description="x", status="published")


def test_a_student_sees_published_classes_of_their_courses_newest_first(client, school, admin, classes, sign_in):
    give(client, admin, "asha@example.com", school["cat"])
    asha = sign_in("aaptprep", "asha@example.com")
    out = client.get(MINE, headers=asha).json()
    assert [c["course_name"] for c in out] == ["CAT"]
    assert [c["title"] for c in out[0]["classes"]] == ["Geometry", "Algebra"]
    algebra = out[0]["classes"][1]
    assert [m["type"] for m in algebra["materials"]] == ["file", "file", "link"]
    assert algebra["held_time"] == "18:00"
    assert "key" not in str(out)


def test_a_student_without_access_sees_nothing(client, school, admin, classes, sign_in):
    asha = sign_in("aaptprep", "ravi@example.com")
    assert client.get(MINE, headers=asha).json() == []


def test_each_course_is_listed_separately(client, school, admin, classes, sign_in):
    give(client, admin, "asha@example.com", school["cat"])
    give(client, admin, "asha@example.com", school["clat"])
    asha = sign_in("aaptprep", "asha@example.com")
    assert [c["course_name"] for c in client.get(MINE, headers=asha).json()] == ["CAT", "CLAT"]


def test_a_class_file_opens_only_with_access(client, school, admin, classes, sign_in):
    give(client, admin, "asha@example.com", school["cat"])
    asha, ravi = sign_in("aaptprep", "asha@example.com"), sign_in("aaptprep", "ravi@example.com")
    link = f"/api/my/courses/{school['cat']['id']}/files/v1/link"
    assert client.get(link, headers=asha).status_code == 200
    assert client.get(link, headers=ravi).status_code == 404


def test_only_students_can_ask(client, school, admin, classes):
    assert client.get(MINE, headers=admin).status_code == 403
    assert client.get(MINE, headers=headers("aaptprep")).status_code == 401
