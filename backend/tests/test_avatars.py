"""Student photos (round avatars): at registration, by the admin, and in a bulk import."""
from io import BytesIO

import pytest
from openpyxl import Workbook

from app import student_import
from app.security import create_token
from conftest import headers, valid_form

SECRET = "test-secret-that-is-long-enough-for-hmac-sha256"
REGISTER = "/api/register"
PHOTO_DONE = "/api/register/photo"
REGS = "/api/admin/registrations"
IMPORT = "/api/admin/students/import"
PHOTOS = "/api/admin/student-photos"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 2000


@pytest.fixture
def school(make_tenant, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    make_tenant("other", "Other", "boss@example.com")
    return {"cat": add_course("aaptprep", "CAT")}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


@pytest.fixture
def storage(client):
    return client.app.state.storage


def register(client, school, photo=True, **overrides):
    return client.post(REGISTER, json={**valid_form(school["cat"]["id"], **overrides), "photo": photo}, headers=headers("aaptprep"))


def send(storage, upload, data=JPEG):
    """What the browser does: post the file to the signed form's key."""
    storage.put(upload["fields"]["key"], data, "image/jpeg")
    return upload["fields"]["key"]


def listed(client, admin, status="pending"):
    return {p["email"]: p for p in client.get(f"{REGS}?status={status}", headers=admin).json()}


# ---- At registration ----

def test_a_registration_without_a_photo_gets_no_upload_permission(client, school):
    response = register(client, school, photo=False)
    assert response.status_code == 201 and response.json() == {"status": "pending", "message": response.json()["message"]}


def test_a_registration_that_wants_to_send_a_photo_gets_a_signed_form_in_the_institutes_folder_and_a_token(client, school):
    response = register(client, school)
    assert response.status_code == 201
    data = response.json()
    assert data["photo_upload"]["fields"]["key"].startswith("aaptprep/avatars/") and data["photo_upload"]["fields"]["key"].endswith(".jpg")
    assert data["photo_token"]


def test_a_refused_registration_gets_no_permission(client, school):
    response = register(client, school, email="not an email")
    assert response.status_code == 422 and "photo_upload" not in response.text and "photo_token" not in response.text


def test_the_student_finishes_the_upload_with_their_token_and_the_admin_sees_the_photo(client, school, admin, storage):
    data = register(client, school).json()
    key = send(storage, data["photo_upload"])
    done = client.post(PHOTO_DONE, json={"email": "new.student@example.com", "token": data["photo_token"]}, headers=headers("aaptprep"))
    assert done.status_code == 200 and done.json() == {"ok": True}
    person = listed(client, admin)["new.student@example.com"]
    assert person["avatar_url"].startswith("http") and key.split("/")[-1] in person["avatar_url"] and "avatar_key" not in person


def test_a_student_without_a_photo_has_an_empty_link(client, school, admin):
    register(client, school, photo=False)
    assert listed(client, admin)["new.student@example.com"]["avatar_url"] == ""


@pytest.mark.parametrize("what", ["garbage", "expired", "other_email", "other_institute"])
def test_a_wrong_or_expired_token_is_refused_and_the_photo_is_not_attached(client, school, admin, storage, what):
    data = register(client, school).json()
    send(storage, data["photo_upload"])
    key = data["photo_upload"]["fields"]["key"]
    token = {
        "garbage": "nonsense",
        "expired": create_token(SECRET, "new.student@example.com", "photo", -10, tenant="aaptprep", key=key),
        "other_email": create_token(SECRET, "someone.else@example.com", "photo", 600, tenant="aaptprep", key=key),
        "other_institute": create_token(SECRET, "new.student@example.com", "photo", 600, tenant="other", key=key),
    }[what]
    done = client.post(PHOTO_DONE, json={"email": "new.student@example.com", "token": token}, headers=headers("aaptprep"))
    assert done.status_code == 422
    assert listed(client, admin)["new.student@example.com"]["avatar_url"] == ""


def test_a_session_token_cannot_be_used_as_a_photo_token(client, school, admin, storage):
    register(client, school)
    done = client.post(PHOTO_DONE, json={"email": "new.student@example.com", "token": admin["Authorization"].split()[1]}, headers=headers("aaptprep"))
    assert done.status_code == 422


def test_a_photo_that_never_arrived_is_refused(client, school):
    data = register(client, school).json()
    done = client.post(PHOTO_DONE, json={"email": "new.student@example.com", "token": data["photo_token"]}, headers=headers("aaptprep"))
    assert done.status_code == 422 and "hasn't arrived" in done.json()["detail"]


@pytest.mark.parametrize("content, why", [(b"GIF89a" + b"\x00" * 100, "not a JPEG"), (JPEG + b"\x00" * (300 * 1024), "too big")])
def test_a_file_that_is_not_a_small_jpeg_is_refused_and_removed(client, school, storage, content, why):
    data = register(client, school).json()
    key = send(storage, data["photo_upload"], content)
    done = client.post(PHOTO_DONE, json={"email": "new.student@example.com", "token": data["photo_token"]}, headers=headers("aaptprep"))
    assert done.status_code == 422 and storage.size(key) is None


def test_a_token_for_a_student_who_does_not_exist_is_not_found(client, school, storage):
    key = "aaptprep/avatars/x.jpg"
    storage.put(key, JPEG, "image/jpeg")
    token = create_token(SECRET, "ghost@example.com", "photo", 600, tenant="aaptprep", key=key)
    assert client.post(PHOTO_DONE, json={"email": "ghost@example.com", "token": token}, headers=headers("aaptprep")).status_code == 404


def test_a_token_cannot_point_a_photo_at_another_institutes_folder(client, school, storage):
    register(client, school)
    key = "other/avatars/x.jpg"
    storage.put(key, JPEG, "image/jpeg")
    token = create_token(SECRET, "new.student@example.com", "photo", 600, tenant="aaptprep", key=key)
    done = client.post(PHOTO_DONE, json={"email": "new.student@example.com", "token": token}, headers=headers("aaptprep"))
    assert done.status_code == 422 and "isn't one of this institute's" in done.json()["detail"]


# ---- The admin sets or removes a photo ----

def test_the_admin_gets_a_form_and_key_for_a_student_and_attaches_the_photo(client, school, admin, storage):
    register(client, school, photo=False)
    start = client.post(f"{REGS}/new.student@example.com/photo", headers=admin)
    assert start.status_code == 200 and start.json()["key"].startswith("aaptprep/avatars/")
    storage.put(start.json()["key"], JPEG, "image/jpeg")
    done = client.post(f"{REGS}/new.student@example.com/photo/complete", json={"key": start.json()["key"]}, headers=admin)
    assert done.status_code == 200 and done.json()["avatar_url"].startswith("http") and "avatar_key" not in done.json()


def test_replacing_a_photo_deletes_the_old_one(client, school, admin, storage):
    register(client, school, photo=False)
    keys = []
    for _ in range(2):
        start = client.post(f"{REGS}/new.student@example.com/photo", headers=admin).json()
        storage.put(start["key"], JPEG, "image/jpeg")
        client.post(f"{REGS}/new.student@example.com/photo/complete", json={"key": start["key"]}, headers=admin)
        keys.append(start["key"])
    assert storage.size(keys[0]) is None and storage.size(keys[1]) is not None


def test_removing_a_photo_clears_the_link_and_deletes_the_file(client, school, admin, storage):
    register(client, school, photo=False)
    start = client.post(f"{REGS}/new.student@example.com/photo", headers=admin).json()
    storage.put(start["key"], JPEG, "image/jpeg")
    client.post(f"{REGS}/new.student@example.com/photo/complete", json={"key": start["key"]}, headers=admin)
    gone = client.delete(f"{REGS}/new.student@example.com/photo", headers=admin)
    assert gone.status_code == 200 and gone.json()["avatar_url"] == "" and storage.size(start["key"]) is None
    assert client.delete(f"{REGS}/new.student@example.com/photo", headers=admin).status_code == 200  # nothing to remove is fine


def test_the_admin_cannot_use_a_key_from_another_folder_or_one_that_never_arrived(client, school, admin, storage):
    register(client, school, photo=False)
    storage.put("other/avatars/x.jpg", JPEG, "image/jpeg")
    foreign = client.post(f"{REGS}/new.student@example.com/photo/complete", json={"key": "other/avatars/x.jpg"}, headers=admin)
    assert foreign.status_code == 422
    missing = client.post(f"{REGS}/new.student@example.com/photo/complete", json={"key": "aaptprep/avatars/nothing.jpg"}, headers=admin)
    assert missing.status_code == 422 and "hasn't arrived" in missing.json()["detail"]


def test_an_unknown_student_or_the_admin_has_no_photo_routes(client, school, admin):
    assert client.post(f"{REGS}/ghost@example.com/photo", headers=admin).status_code == 404
    assert client.post(f"{REGS}/ritesh@example.com/photo", headers=admin).status_code == 404
    assert client.delete(f"{REGS}/ghost@example.com/photo", headers=admin).status_code == 404
    assert client.post(f"{REGS}/ghost@example.com/photo/complete", json={"key": "aaptprep/avatars/x.jpg"}, headers=admin).status_code in (404, 422)


def test_only_the_admin_can_use_the_photo_routes(client, school, admin, sign_in, repo):
    repo.scoped("aaptprep").create_member({"email": "s@example.com", "role": "student", "status": "approved", "first_name": "S", "last_name": "T"})
    student = sign_in("aaptprep", "s@example.com")
    for call in (lambda h: client.post(f"{REGS}/s@example.com/photo", headers=h), lambda h: client.delete(f"{REGS}/s@example.com/photo", headers=h),
                 lambda h: client.post(PHOTOS, json={"filename": "a.jpg", "size": 10}, headers=h)):
        assert call(headers("aaptprep")).status_code == 401
        assert call(student).status_code == 403


def test_decisions_and_edits_return_the_photo_link_too(client, school, admin, storage):
    register(client, school, photo=False)
    start = client.post(f"{REGS}/new.student@example.com/photo", headers=admin).json()
    storage.put(start["key"], JPEG, "image/jpeg")
    client.post(f"{REGS}/new.student@example.com/photo/complete", json={"key": start["key"]}, headers=admin)
    approved = client.post(f"{REGS}/new.student@example.com/approve", headers=admin).json()
    assert approved["registration"]["avatar_url"].startswith("http")
    edited = client.patch(f"{REGS}/new.student@example.com", json={"first_name": "Asha-Rani"}, headers=admin).json()
    assert edited["registration"]["avatar_url"].startswith("http")


def test_a_student_sees_their_own_photo_link_in_me_and_others_see_none_of_it(client, school, admin, storage, sign_in, repo):
    register(client, school, photo=False)
    client.post(f"{REGS}/new.student@example.com/approve", headers=admin)
    me = sign_in("aaptprep", "new.student@example.com")
    assert client.get("/api/auth/me", headers=me).json()["avatar_url"] == ""
    start = client.post(f"{REGS}/new.student@example.com/photo", headers=admin).json()
    storage.put(start["key"], JPEG, "image/jpeg")
    client.post(f"{REGS}/new.student@example.com/photo/complete", json={"key": start["key"]}, headers=admin)
    shown = client.get("/api/auth/me", headers=me).json()
    assert shown["avatar_url"].startswith("http") and "avatar_key" not in shown


def test_the_progress_pages_carry_the_photo_link(client, school, admin, storage, repo):
    from test_progress import give

    register(client, school, photo=False)
    client.post(f"{REGS}/new.student@example.com/approve", headers=admin)
    give(client, admin, "new.student@example.com", school["cat"])
    start = client.post(f"{REGS}/new.student@example.com/photo", headers=admin).json()
    storage.put(start["key"], JPEG, "image/jpeg")
    client.post(f"{REGS}/new.student@example.com/photo/complete", json={"key": start["key"]}, headers=admin)
    rows = client.get(f"/api/admin/progress/{school['cat']['id']}", headers=admin).json()["students"]
    assert rows[0]["avatar_url"].startswith("http") and "avatar_key" not in rows[0]
    one = client.get(f"/api/admin/progress/{school['cat']['id']}/students/new.student@example.com", headers=admin).json()
    assert one["student"]["avatar_url"].startswith("http")


# ---- Bulk: photos by file name ----

def start_photo(client, admin, storage, name="Asha.JPG", data=JPEG, size=None):
    start = client.post(PHOTOS, json={"filename": name, "size": size or len(data)}, headers=admin)
    assert start.status_code == 201, start.text
    storage.put(start.json()["upload"]["fields"]["key"], data, "image/jpeg")
    return start.json()


def upload_photo(client, admin, storage, name="Asha.JPG", data=JPEG):
    made = start_photo(client, admin, storage, name, data)
    done = client.post(f"{PHOTOS}/{made['id']}/complete", headers=admin)
    assert done.status_code == 200, done.text
    return made


@pytest.mark.parametrize("filename, size, message", [
    ("asha.gif", 100, "JPG, PNG or WebP"), ("asha", 100, "JPG, PNG or WebP"), ("", 100, "JPG, PNG or WebP"),
    ("asha.jpg", 0, "300 KB"), ("asha.jpg", 300 * 1024 + 1, "300 KB"), ("asha.jpg", "big", "300 KB"), ("asha.jpg", True, "300 KB"),
])
def test_a_bad_photo_name_or_size_is_refused(client, school, admin, filename, size, message):
    response = client.post(PHOTOS, json={"filename": filename, "size": size}, headers=admin)
    assert response.status_code == 422 and message in response.json()["detail"]


def test_a_photo_is_stored_under_its_lower_case_file_name_in_the_institutes_folder(client, school, admin, storage):
    made = start_photo(client, admin, storage, "photos\\Asha Rao.JPG")
    assert made["name"] == "asha rao.jpg" and made["upload"]["fields"]["key"].startswith("aaptprep/avatars/")


def test_finishing_a_photo_that_never_arrived_or_is_not_a_jpeg_is_refused(client, school, admin, storage):
    start = client.post(PHOTOS, json={"filename": "a.jpg", "size": 100}, headers=admin).json()
    assert "hasn't arrived" in client.post(f"{PHOTOS}/{start['id']}/complete", headers=admin).json()["detail"]
    storage.put(start["upload"]["fields"]["key"], b"GIF89a" + b"\x00" * 100, "image/jpeg")
    bad = client.post(f"{PHOTOS}/{start['id']}/complete", headers=admin)
    assert bad.status_code == 422 and storage.size(start["upload"]["fields"]["key"]) is None
    assert client.post(f"{PHOTOS}/{start['id']}/complete", headers=admin).status_code == 404  # the row went with it
    assert client.post(f"{PHOTOS}/nope/complete", headers=admin).status_code == 404


def sheet(rows):
    book = Workbook()
    ws = book.active
    ws.title = "Students"
    ws.append(student_import.COLUMNS)
    for r in rows:
        ws.append(r)
    out = BytesIO()
    book.save(out)
    return out.getvalue()


def row(email="asha@example.com", first="Asha", photo=""):
    values = {"Email": email, "First name": first, "Last name": "Rao", "Mobile": "9876543210", "Courses": "CAT", "Photo": photo}
    return [values.get(name, "") for name in student_import.COLUMNS]


def run(client, admin, rows, confirm=False):
    return client.post(f"{IMPORT}{'?confirm=true' if confirm else ''}", content=sheet(rows), headers=admin)


def test_the_template_has_a_photo_column_and_says_how_to_use_it(client, school, admin):
    from openpyxl import load_workbook

    book = load_workbook(BytesIO(client.get("/api/admin/students/import/template", headers=admin).content))
    assert [c.value for c in book["Students"][1]][-1] == "Photo"
    assert any("Photos step" in str(r[0].value) for r in book["How to fill"].iter_rows())


def test_a_photo_name_that_was_not_uploaded_is_a_problem_on_that_row(client, school, admin):
    shown = run(client, admin, [row(photo="asha.jpg")]).json()["rows"][0]
    assert shown["status"] == "error" and "'asha.jpg' wasn't uploaded" in shown["problems"]["Photo"]


def test_an_uploaded_photo_is_matched_without_regard_to_case_or_a_folder_in_the_name(client, school, admin, storage):
    upload_photo(client, admin, storage, "asha.jpg")
    for name in ("asha.jpg", "ASHA.JPG", "photos/Asha.jpg", "C:\\pics\\asha.jpg"):
        shown = run(client, admin, [row(photo=name)]).json()["rows"][0]
        assert shown["status"] == "ready" and shown["photo"] is True and not shown["problems"]


def test_importing_attaches_the_photo_and_the_student_shows_it(client, school, admin, storage, repo):
    made = upload_photo(client, admin, storage, "asha.jpg")
    data = run(client, admin, [row(photo="asha.jpg"), row("b@example.com", "B")], confirm=True).json()
    assert data["summary"]["created"] == 2
    scoped = repo.scoped("aaptprep")
    member = scoped.get_member("asha@example.com")
    assert member["avatar_key"] == made["upload"]["fields"]["key"] and scoped.get_photo(made["id"])["student"] == "asha@example.com"
    assert "ttl" not in scoped.get_photo(made["id"])
    assert "avatar_key" not in scoped.get_member("b@example.com") or not scoped.get_member("b@example.com")["avatar_key"]
    shown = {p["email"]: p for p in client.get(f"{REGS}?status=approved", headers=admin).json()}
    assert shown["asha@example.com"]["avatar_url"].startswith("http") and shown["b@example.com"]["avatar_url"] == ""


def test_one_photo_cannot_go_with_two_students_in_a_file(client, school, admin, storage):
    upload_photo(client, admin, storage, "asha.jpg")
    rows = run(client, admin, [row(photo="asha.jpg"), row("b@example.com", "B", photo="asha.jpg")]).json()["rows"]
    assert [r["status"] for r in rows] == ["ready", "error"] and "same photo is used on row 2" in rows[1]["problems"]["Photo"]


def test_a_photo_already_on_a_student_is_not_offered_again(client, school, admin, storage):
    upload_photo(client, admin, storage, "asha.jpg")
    run(client, admin, [row(photo="asha.jpg")], confirm=True)
    again = run(client, admin, [row("b@example.com", "B", photo="asha.jpg")]).json()["rows"][0]
    assert again["status"] == "error" and "wasn't uploaded" in again["problems"]["Photo"]


def test_uploading_a_name_twice_uses_the_newest(client, school, admin, storage, repo, fake_clock):
    first = upload_photo(client, admin, storage, "asha.jpg")
    fake_clock.advance(60)
    second = upload_photo(client, admin, storage, "asha.jpg")
    run(client, admin, [row(photo="asha.jpg")], confirm=True)
    assert repo.scoped("aaptprep").get_member("asha@example.com")["avatar_key"] == second["upload"]["fields"]["key"] and first["id"] != second["id"]


def test_a_photo_still_uploading_or_from_another_institute_is_not_matched(client, school, admin, storage, repo, sign_in):
    start_photo(client, admin, storage, "pending.jpg")  # started, never finished
    assert run(client, admin, [row(photo="pending.jpg")]).json()["rows"][0]["status"] == "error"
    other = sign_in("other", "boss@example.com")
    upload_photo(client, other, storage, "theirs.jpg")
    assert run(client, admin, [row(photo="theirs.jpg")]).json()["rows"][0]["status"] == "error"


def test_a_row_with_no_photo_is_unaffected_and_a_problem_row_attaches_nothing(client, school, admin, storage, repo):
    made = upload_photo(client, admin, storage, "asha.jpg")
    data = run(client, admin, [row("bad", photo="asha.jpg"), row("ok@example.com", "Ok")], confirm=True).json()
    assert data["summary"]["created"] == 1 and "student" not in repo.scoped("aaptprep").get_photo(made["id"])
