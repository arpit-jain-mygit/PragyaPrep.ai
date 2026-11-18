"""The institute admin's My institute page: what they can change, what is checked, what the public sees."""
import pytest

from conftest import headers

URL = "/api/admin/institute"
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 2000
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200


@pytest.fixture
def storage(client):
    return client.app.state.storage


@pytest.fixture
def school(make_tenant, add_member):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    add_member("aaptprep", "asha@example.com")


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


def test_only_the_institute_admin_can_open_it(client, school, sign_in):
    assert client.get(URL, headers=headers("aaptprep")).status_code == 401
    assert client.get(URL, headers=sign_in("aaptprep", "asha@example.com")).status_code == 403


def test_a_new_institute_shows_its_name_colour_and_empty_details(client, admin):
    page = client.get(URL, headers=admin).json()
    assert page["name"] == "AaptPrep" and page["slug"] == "aaptprep" and page["logo_url"] is None
    assert page["profile"] == {"description": "", "city": "", "contact_email": "", "contact_phone": "", "website": "", "exam_categories": []}
    assert page["admin"]["email"] == "ritesh@aaptprep.example.com" and page["admin"]["first_name"] == "Test"


def test_the_admin_saves_details_and_the_public_page_shows_them(client, admin):
    done = client.put(URL, json={
        "name": "AaptPrep Classes", "primary_color": "#16A34A", "description": "Coaching for law and management.", "city": "Noida",
        "contact_email": "Hello@AaptPrep.example.com", "contact_phone": "+91 98765 43210", "website": "aaptprep.example.com",
        "exam_categories": ["CLAT", " clat ", "CUET", ""], "admin_first_name": "Ritesh", "admin_last_name": "Jain", "admin_mobile": "9811111111",
    }, headers=admin)
    assert done.status_code == 200, done.text
    page = done.json()
    assert page["name"] == "AaptPrep Classes" and page["primary_color"] == "#16a34a"
    assert page["profile"]["contact_email"] == "hello@aaptprep.example.com" and page["profile"]["contact_phone"] == "9876543210"
    assert page["profile"]["website"] == "https://aaptprep.example.com" and page["profile"]["exam_categories"] == ["CLAT", "CUET"]
    assert page["admin"]["first_name"] == "Ritesh" and page["admin"]["last_name"] == "Jain" and page["admin"]["mobile"] == "9811111111"
    public = client.get("/api/tenant", headers=headers("aaptprep")).json()
    assert public["name"] == "AaptPrep Classes" and public["branding"]["display_name"] == "AaptPrep Classes" and public["branding"]["primary_color"] == "#16a34a"
    assert public["profile"]["city"] == "Noida" and public["profile"]["exam_categories"] == ["CLAT", "CUET"]


def test_fields_not_sent_stay_as_they_are(client, admin):
    client.put(URL, json={"city": "Noida", "description": "Hello"}, headers=admin)
    client.put(URL, json={"city": "Delhi"}, headers=admin)
    page = client.get(URL, headers=admin).json()
    assert page["profile"]["city"] == "Delhi" and page["profile"]["description"] == "Hello" and page["name"] == "AaptPrep"


@pytest.mark.parametrize("body,word", [
    ({"name": ""}, "1 to 120"), ({"primary_color": "green"}, "colour"), ({"description": "x" * 301}, "300"), ({"city": "x" * 61}, "60"),
    ({"contact_email": "nope"}, "email"), ({"contact_phone": "123"}, "10-digit"), ({"website": "ftp://x.com"}, "website"), ({"website": "not a site"}, "website"),
    ({"exam_categories": "CLAT"}, "list"), ({"exam_categories": ["x" * 41]}, "40"), ({"exam_categories": [str(i) for i in range(9)]}, "up to 8"),
    ({"admin_first_name": ""}, "first name"), ({"admin_mobile": "12"}, "10-digit"), ({"admin_email": "x@y.com"}, "can't be changed"), ({"status": "suspended"}, "can't be changed"), ({"plan": "paid"}, "can't be changed"),
])
def test_bad_details_are_refused_and_nothing_changes(client, admin, body, word):
    response = client.put(URL, json={"city": "Changed", **body}, headers=admin)
    assert response.status_code == 422 and word in response.json()["detail"]
    assert client.get(URL, headers=admin).json()["profile"]["city"] == ""


def test_the_logo_can_be_added_and_removed_by_the_admin(client, admin, storage, repo):
    start = client.post(f"{URL}/logo", json={"filename": "logo.png", "size": len(PNG)}, headers=admin)
    assert start.status_code == 200 and "upload" in start.json()
    storage.put(repo.get_tenant("aaptprep")["logo_pending"]["key"], PNG, "image/png")
    done = client.post(f"{URL}/logo/complete", headers=admin)
    assert done.status_code == 200 and done.json()["logo_url"].startswith("/api/logo/aaptprep")
    gone = client.post(f"{URL}/logo/remove", headers=admin)
    assert gone.json()["logo_url"] is None


def test_a_bad_logo_is_refused(client, admin):
    assert client.post(f"{URL}/logo", json={"filename": "logo.gif", "size": 100}, headers=admin).status_code == 422
    assert client.post(f"{URL}/logo", json={"filename": "logo.png", "size": 5 * 1024 * 1024}, headers=admin).status_code == 422
    assert client.post(f"{URL}/logo/complete", headers=admin).status_code == 422


def test_the_admin_can_set_and_remove_their_own_photo(client, admin, storage):
    start = client.post(f"{URL}/photo", headers=admin)
    assert start.status_code == 200 and start.json()["key"].startswith("aaptprep/avatars/")
    storage.put(start.json()["key"], JPEG, "image/jpeg")
    done = client.post(f"{URL}/photo/complete", json={"key": start.json()["key"]}, headers=admin)
    assert done.status_code == 200 and done.json()["admin"]["avatar_url"].startswith("http")
    gone = client.delete(f"{URL}/photo", headers=admin)
    assert gone.json()["admin"]["avatar_url"] == "" and storage.size(start.json()["key"]) is None


def test_one_institute_cannot_change_another(client, make_tenant, admin, sign_in):
    make_tenant("other", "Other Institute", "boss@other.example.com")
    other = sign_in("other", "boss@other.example.com")
    client.put(URL, json={"city": "Pune"}, headers=other)
    assert client.get(URL, headers=admin).json()["profile"]["city"] == ""
    assert client.get(URL, headers=other).json()["profile"]["city"] == "Pune"
