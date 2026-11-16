"""Course files (PDF and MP4), giving students access, and opening files while access lasts."""
import pytest

from conftest import BUCKET, headers, valid_form

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"
MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
DAY = 86400


@pytest.fixture
def school(make_tenant, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    return {"clat": add_course("aaptprep", "CLAT", 10000), "cat": add_course("aaptprep", "CAT", 12000, {"type": "days", "days": 30})}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


@pytest.fixture
def student(client, school, admin, sign_in):
    form = valid_form(school["clat"]["id"], email="asha@example.com")
    client.post("/api/register", json=form, headers=headers("aaptprep"))
    client.post("/api/admin/registrations/asha@example.com/approve", headers=admin)
    return sign_in("aaptprep", "asha@example.com")


@pytest.fixture
def s3(client):
    return client.app.state.storage.s3


def url(course, suffix=""):
    return f"/api/admin/courses/{course['id']}/files{suffix}"


def add_file(client, s3, repo, admin, course, name="notes.pdf", body=PDF, title=None, finish=True):
    """Add a file the way the browser does: ask, post the bytes to S3, then say it's done."""
    started = client.post(url(course), json={"filename": name, "size": len(body), "title": title}, headers=admin)
    assert started.status_code == 201, started.text
    file = started.json()["file"]
    key = repo.scoped("aaptprep").get_file(course["id"], file["id"])["key"]
    s3.put_object(Bucket=BUCKET, Key=key, Body=body)
    if finish:
        done = client.post(url(course, f"/{file['id']}/complete"), headers=admin)
        assert done.status_code == 200, done.text
        file = done.json()
    return file, key


def exists(s3, key) -> bool:
    return "Contents" in s3.list_objects_v2(Bucket=BUCKET, Prefix=key)


# ---- Who may do what ----

def test_only_the_admin_manages_files_and_access(client, school, student):
    course = school["clat"]
    for method, path, body in [
        ("get", url(course), None),
        ("post", url(course), {"filename": "a.pdf", "size": 5}),
        ("post", url(course, "/x/complete"), None),
        ("delete", url(course, "/x"), None),
        ("get", "/api/admin/registrations/asha@example.com/access", None),
        ("post", "/api/admin/registrations/asha@example.com/access", {"course_id": course["id"]}),
        ("delete", f"/api/admin/registrations/asha@example.com/access/{course['id']}", None),
    ]:
        assert client.request(method, path, json=body, headers=headers("aaptprep")).status_code == 401, path
        assert client.request(method, path, json=body, headers=student).status_code == 403, path


def test_only_students_use_the_student_pages(client, school, admin):
    assert client.get("/api/my/courses", headers=headers("aaptprep")).status_code == 401
    assert client.get("/api/my/courses", headers=admin).status_code == 403


# ---- Adding a file ----

def test_a_new_file_starts_as_uploading_in_the_institutes_own_folder(client, school, admin, repo):
    started = client.post(url(school["clat"]), json={"filename": "Notes.PDF", "size": 100}, headers=admin).json()
    assert started["file"]["status"] == "uploading"
    assert started["file"]["kind"] == "pdf"
    assert started["file"]["title"] == "Notes"  # from the file name
    assert started["upload"]["url"]
    assert started["upload"]["fields"]["Content-Type"] == "application/pdf"
    row = repo.scoped("aaptprep").get_file(school["clat"]["id"], started["file"]["id"])
    assert row["key"].startswith(f"aaptprep/courses/{school['clat']['id']}/")
    assert row["key"].endswith(".pdf")
    assert "ttl" in row  # a half-finished upload is forgotten after a day


@pytest.mark.parametrize("name", ["virus.exe", "notes", "notes.pdf.exe", "page.html", "clip.mov", ".pdf"])
def test_only_pdf_and_mp4_endings_are_accepted(client, school, admin, name):
    response = client.post(url(school["clat"]), json={"filename": name, "size": 10}, headers=admin)
    assert response.status_code == 422
    assert "PDF and MP4" in response.json()["detail"]


@pytest.mark.parametrize("size", [0, -5, 6 * 1024**3])
def test_the_size_must_be_sensible(client, school, admin, size):
    assert client.post(url(school["clat"]), json={"filename": "a.pdf", "size": size}, headers=admin).status_code == 422


def test_a_title_can_be_given_and_is_tidied(client, school, admin):
    started = client.post(url(school["clat"]), json={"filename": "a.mp4", "size": 10, "title": "  Lecture   1 "}, headers=admin)
    assert started.json()["file"]["title"] == "Lecture 1"
    assert client.post(url(school["clat"]), json={"filename": "a.mp4", "size": 10, "title": "x" * 121}, headers=admin).status_code == 422


def test_an_unknown_course_is_not_found(client, school, admin):
    assert client.post("/api/admin/courses/nope/files", json={"filename": "a.pdf", "size": 5}, headers=admin).status_code == 404
    assert client.get("/api/admin/courses/nope/files", headers=admin).status_code == 404


# ---- Checking what arrived ----

def test_a_real_pdf_and_a_real_mp4_become_ready(client, school, admin, repo, s3):
    pdf, pdf_key = add_file(client, s3, repo, admin, school["clat"], "notes.pdf", PDF)
    mp4, _ = add_file(client, s3, repo, admin, school["clat"], "lecture.mp4", MP4)
    assert (pdf["status"], pdf["size"]) == ("ready", len(PDF))
    assert (mp4["status"], mp4["kind"]) == ("ready", "mp4")
    assert "ttl" not in repo.scoped("aaptprep").get_file(school["clat"]["id"], pdf["id"])
    assert exists(s3, pdf_key)


def test_finishing_twice_is_harmless(client, school, admin, repo, s3):
    file, _ = add_file(client, s3, repo, admin, school["clat"])
    assert client.post(url(school["clat"], f"/{file['id']}/complete"), headers=admin).json()["status"] == "ready"


def test_a_file_that_never_arrived_is_refused_and_can_be_retried(client, school, admin, repo, s3):
    started = client.post(url(school["clat"]), json={"filename": "a.pdf", "size": 10}, headers=admin).json()["file"]
    response = client.post(url(school["clat"], f"/{started['id']}/complete"), headers=admin)
    assert response.status_code == 422
    assert "hasn't arrived" in response.json()["detail"]
    assert repo.scoped("aaptprep").get_file(school["clat"]["id"], started["id"]) is not None


@pytest.mark.parametrize("name,body", [("fake.pdf", b"just some text"), ("fake.mp4", PDF), ("fake.pdf", MP4)])
def test_a_file_that_is_not_what_its_ending_says_is_removed(client, school, admin, repo, s3, name, body):
    started = client.post(url(school["clat"]), json={"filename": name, "size": len(body)}, headers=admin).json()["file"]
    key = repo.scoped("aaptprep").get_file(school["clat"]["id"], started["id"])["key"]
    s3.put_object(Bucket=BUCKET, Key=key, Body=body)

    response = client.post(url(school["clat"], f"/{started['id']}/complete"), headers=admin)
    assert response.status_code == 422
    assert "isn't a real" in response.json()["detail"]
    assert not exists(s3, key)
    assert repo.scoped("aaptprep").get_file(school["clat"]["id"], started["id"]) is None


def test_a_file_bigger_than_it_said_is_removed(client, school, admin, repo, s3):
    started = client.post(url(school["clat"]), json={"filename": "a.pdf", "size": 10}, headers=admin).json()["file"]
    key = repo.scoped("aaptprep").get_file(school["clat"]["id"], started["id"])["key"]
    s3.put_object(Bucket=BUCKET, Key=key, Body=PDF + b"x" * 1000)
    assert client.post(url(school["clat"], f"/{started['id']}/complete"), headers=admin).status_code == 422
    assert not exists(s3, key)


def test_listing_and_deleting_files(client, school, admin, repo, s3, fake_clock):
    first, key = add_file(client, s3, repo, admin, school["clat"], "a.pdf", PDF, title="One")
    fake_clock.advance(1)
    add_file(client, s3, repo, admin, school["clat"], "b.mp4", MP4, title="Two")
    add_file(client, s3, repo, admin, school["cat"], "c.pdf", PDF, title="Other course")

    listed = client.get(url(school["clat"]), headers=admin).json()
    assert [f["title"] for f in listed] == ["One", "Two"]

    assert client.delete(url(school["clat"], f"/{first['id']}"), headers=admin).status_code == 204
    assert [f["title"] for f in client.get(url(school["clat"]), headers=admin).json()] == ["Two"]
    assert not exists(s3, key)
    assert client.delete(url(school["clat"], f"/{first['id']}"), headers=admin).status_code == 404


def test_a_file_is_not_reachable_through_another_course_or_institute(client, school, admin, repo, s3, make_tenant, sign_in):
    file, _ = add_file(client, s3, repo, admin, school["clat"])
    assert client.post(url(school["cat"], f"/{file['id']}/complete"), headers=admin).status_code == 404
    make_tenant("other", "Other", "boss@example.com")
    boss = sign_in("other", "boss@example.com")
    assert client.delete(url(school["clat"], f"/{file['id']}"), headers=boss).status_code == 404


# ---- Giving access ----

def grant(client, admin, course, email="asha@example.com"):
    return client.post(f"/api/admin/registrations/{email}/access", json={"course_id": course["id"]}, headers=admin)


def test_unlimited_access_never_ends(client, school, admin, student):
    body = grant(client, admin, school["clat"]).json()
    assert (body["expires_at"], body["active"], body["source"]) == (None, True, "manual")
    assert body["granted_by"] == "ritesh@example.com"
    assert body["course_name"] == "CLAT"


def test_access_for_a_number_of_days_ends_after_them(client, school, admin, student, fake_clock):
    body = grant(client, admin, school["cat"]).json()
    assert body["expires_at"] is not None and body["active"] is True
    listing = lambda: client.get("/api/admin/registrations/asha@example.com/access", headers=admin).json()[0]
    fake_clock.advance(29 * DAY)
    assert listing()["active"] is True
    fake_clock.advance(2 * DAY)
    assert listing()["active"] is False


def test_access_until_a_date_ends_at_the_end_of_that_day(client, school, admin, student, fake_clock, add_course):
    from app import clock

    until = clock.today_india().isoformat()
    course = add_course("aaptprep", "CUET", 5000, {"type": "until_date", "until": until})
    assert grant(client, admin, course).json()["active"] is True
    fake_clock.advance(DAY)
    assert client.get("/api/admin/registrations/asha@example.com/access", headers=admin).json()[0]["active"] is False
    # Once the date has passed, nobody can be given this course until its length is changed.
    refused = grant(client, admin, course)
    assert refused.status_code == 409
    assert "end date has passed" in refused.json()["detail"]


def test_granting_again_renews_the_access(client, school, admin, student, fake_clock):
    first = grant(client, admin, school["cat"]).json()
    fake_clock.advance(20 * DAY)
    second = grant(client, admin, school["cat"]).json()
    assert second["expires_at"] > first["expires_at"]
    assert len(client.get("/api/admin/registrations/asha@example.com/access", headers=admin).json()) == 1


@pytest.mark.parametrize("status", ["pending", "suspended", "rejected"])
def test_only_an_approved_student_can_be_given_access(client, school, admin, add_member, status):
    add_member("aaptprep", "meera@example.com", status=status)
    response = grant(client, admin, school["clat"], "meera@example.com")
    assert response.status_code == 409
    assert status in response.json()["detail"]


def test_unknown_people_and_courses_are_not_found(client, school, admin, student):
    assert grant(client, admin, school["clat"], "nobody@example.com").status_code == 404
    assert grant(client, admin, {"id": "nope"}).status_code == 404
    assert grant(client, admin, school["clat"], "ritesh@example.com").status_code == 404  # the admin is not a student


def test_taking_access_away(client, school, admin, student):
    grant(client, admin, school["clat"])
    path = f"/api/admin/registrations/asha@example.com/access/{school['clat']['id']}"
    assert client.delete(path, headers=admin).status_code == 204
    assert client.get("/api/admin/registrations/asha@example.com/access", headers=admin).json() == []
    assert client.delete(path, headers=admin).status_code == 404


# ---- What the student sees ----

def test_a_student_sees_only_courses_they_were_given_with_ready_files(client, school, admin, student, repo, s3):
    add_file(client, s3, repo, admin, school["clat"], "a.pdf", PDF, title="Notes")
    client.post(url(school["clat"]), json={"filename": "later.mp4", "size": 10}, headers=admin)  # still uploading
    add_file(client, s3, repo, admin, school["cat"], "c.pdf", PDF, title="Not theirs")

    assert client.get("/api/my/courses", headers=student).json() == []
    grant(client, admin, school["clat"])
    courses = client.get("/api/my/courses", headers=student).json()
    assert [c["name"] for c in courses] == ["CLAT"]
    assert [f["title"] for f in courses[0]["files"]] == ["Notes"]
    assert "key" not in courses[0]["files"][0]  # where it is stored is never shown


def test_a_student_opens_a_file_through_a_short_lived_link(client, school, admin, student, repo, s3):
    file, key = add_file(client, s3, repo, admin, school["clat"], "a.pdf", PDF, title="Notes")
    grant(client, admin, school["clat"])
    response = client.get(f"/api/my/courses/{school['clat']['id']}/files/{file['id']}/link", headers=student)
    assert response.status_code == 200, response.text
    body = response.json()
    assert key in body["url"]
    assert "X-Amz-Expires=300" in body["url"] or "Expires=" in body["url"]
    assert body["expires_in"] == 300
    assert body["content_type"] == "application/pdf"


def test_without_access_a_file_is_simply_not_found(client, school, admin, student, repo, s3):
    file, _ = add_file(client, s3, repo, admin, school["clat"])
    link = f"/api/my/courses/{school['clat']['id']}/files/{file['id']}/link"
    assert client.get(link, headers=student).status_code == 404

    grant(client, admin, school["cat"])  # access to a different course doesn't help
    assert client.get(link, headers=student).status_code == 404
    assert client.get(f"/api/my/courses/{school['cat']['id']}/files/{file['id']}/link", headers=student).status_code == 404


def test_an_unfinished_upload_cannot_be_opened(client, school, admin, student):
    started = client.post(url(school["clat"]), json={"filename": "a.pdf", "size": 10}, headers=admin).json()["file"]
    grant(client, admin, school["clat"])
    assert client.get(f"/api/my/courses/{school['clat']['id']}/files/{started['id']}/link", headers=student).status_code == 404


def test_access_stops_when_it_runs_out(client, school, admin, student, repo, s3, fake_clock):
    file, _ = add_file(client, s3, repo, admin, school["cat"])
    grant(client, admin, school["cat"])
    link = f"/api/my/courses/{school['cat']['id']}/files/{file['id']}/link"
    assert client.get(link, headers=student).status_code == 200
    fake_clock.advance(31 * DAY)
    assert client.get(link, headers=student).status_code == 404
    assert client.get("/api/my/courses", headers=student).json() == []


def test_taking_access_away_closes_the_link_at_once(client, school, admin, student, repo, s3):
    file, _ = add_file(client, s3, repo, admin, school["clat"])
    grant(client, admin, school["clat"])
    link = f"/api/my/courses/{school['clat']['id']}/files/{file['id']}/link"
    assert client.get(link, headers=student).status_code == 200
    client.delete(f"/api/admin/registrations/asha@example.com/access/{school['clat']['id']}", headers=admin)
    assert client.get(link, headers=student).status_code == 404


def test_a_suspended_student_loses_everything_at_once(client, school, admin, student, repo, s3):
    file, _ = add_file(client, s3, repo, admin, school["clat"])
    grant(client, admin, school["clat"])
    client.post("/api/admin/registrations/asha@example.com/suspend", headers=admin)
    assert client.get("/api/my/courses", headers=student).status_code == 401
    assert client.get(f"/api/my/courses/{school['clat']['id']}/files/{file['id']}/link", headers=student).status_code == 401


def test_a_deleted_file_disappears_from_the_students_list(client, school, admin, student, repo, s3):
    file, _ = add_file(client, s3, repo, admin, school["clat"])
    grant(client, admin, school["clat"])
    client.delete(url(school["clat"], f"/{file['id']}"), headers=admin)
    assert client.get("/api/my/courses", headers=student).json()[0]["files"] == []


def test_a_student_of_another_institute_gets_nothing(client, school, admin, student, repo, s3, make_tenant, add_member, sign_in):
    file, _ = add_file(client, s3, repo, admin, school["clat"])
    grant(client, admin, school["clat"])
    make_tenant("other", "Other", "boss@example.com")
    add_member("other", "asha@example.com")  # the same email, but a different institute
    other = sign_in("other", "asha@example.com")
    assert client.get("/api/my/courses", headers=other).json() == []
    assert client.get(f"/api/my/courses/{school['clat']['id']}/files/{file['id']}/link", headers=other).status_code == 404


# ---- A corrected email keeps the access ----

def test_correcting_the_email_keeps_the_students_access(client, school, admin, student, sign_in, repo, s3):
    file, _ = add_file(client, s3, repo, admin, school["clat"])
    grant(client, admin, school["clat"])
    edited = client.patch("/api/admin/registrations/asha@example.com", json={"email": "asha.new@example.com"}, headers=admin)
    assert edited.status_code == 200, edited.text

    assert client.get("/api/admin/registrations/asha@example.com/access", headers=admin).status_code == 404
    moved = client.get("/api/admin/registrations/asha.new@example.com/access", headers=admin).json()
    assert [a["course_name"] for a in moved] == ["CLAT"]

    fresh = sign_in("aaptprep", "asha.new@example.com")
    assert [c["name"] for c in client.get("/api/my/courses", headers=fresh).json()] == ["CLAT"]
    assert client.get(f"/api/my/courses/{school['clat']['id']}/files/{file['id']}/link", headers=fresh).status_code == 200
    assert repo.scoped("aaptprep").list_access("asha@example.com") == []  # nothing left under the old email
