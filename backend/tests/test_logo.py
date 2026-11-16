"""An institute's logo: the platform admin adds, replaces and removes it, and everyone can see it."""
import pytest

from app import tenants
from conftest import BUCKET, headers

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 40
URL = "/api/platform/institutes"


@pytest.fixture
def owner(repo, sign_in):
    tenants.ensure_platform_admin(repo, "owner@example.com", "Platform Owner")
    return sign_in("platform", "owner@example.com")


@pytest.fixture
def school(make_tenant):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")


@pytest.fixture
def s3(client):
    return client.app.state.storage.s3


def exists(s3, key) -> bool:
    return "Contents" in s3.list_objects_v2(Bucket=BUCKET, Prefix=key)


def pending_key(repo, slug="aaptprep") -> str:
    return repo.get_tenant(slug)["logo_pending"]["key"]


def add_logo(client, s3, repo, owner, name="logo.png", body=PNG, slug="aaptprep"):
    """The browser's three steps: ask, post the picture to S3, say it is done."""
    started = client.post(f"{URL}/{slug}/logo", json={"filename": name, "size": len(body)}, headers=owner)
    assert started.status_code == 200, started.text
    s3.put_object(Bucket=BUCKET, Key=pending_key(repo, slug), Body=body)
    done = client.post(f"{URL}/{slug}/logo/complete", headers=owner)
    assert done.status_code == 200, done.text
    return done.json()


# ---- Who may do it ----

@pytest.mark.parametrize("method, path, body", [
    ("post", f"{URL}/aaptprep/logo", {"filename": "a.png", "size": 10}),
    ("post", f"{URL}/aaptprep/logo/complete", None),
    ("post", f"{URL}/aaptprep/logo/remove", None),
])
def test_only_the_platform_admin_may_change_a_logo(client, school, owner, sign_in, method, path, body):
    assert client.request(method, path, json=body, headers=headers("platform")).status_code == 401
    admin = sign_in("aaptprep", "ritesh@example.com")
    assert client.request(method, path, json=body, headers={**admin, "X-Tenant": "platform"}).status_code == 401
    assert client.request(method, path, json=body, headers=admin).status_code == 403  # the institute's own admin


# ---- Adding ----

def test_a_new_logo_is_stored_in_the_institutes_folder_and_shown(client, school, owner, repo, s3):
    started = client.post(f"{URL}/aaptprep/logo", json={"filename": "Logo.PNG", "size": len(PNG)}, headers=owner).json()
    assert started["upload"]["url"] and started["upload"]["fields"]["Content-Type"] == "image/png"
    key = pending_key(repo)
    assert key.startswith("aaptprep/branding/") and key.endswith(".png")

    institute = add_logo(client, s3, repo, owner)
    assert institute["logo_url"].startswith("/api/logo/aaptprep?v=")
    stored = repo.get_tenant("aaptprep")["branding"]["logo"]["key"]
    assert stored.startswith("aaptprep/branding/") and exists(s3, stored)
    assert repo.get_tenant("aaptprep")["logo_pending"] is None


def test_a_jpeg_is_accepted(client, school, owner, repo, s3):
    assert add_logo(client, s3, repo, owner, "logo.jpeg", JPG)["logo_url"]


@pytest.mark.parametrize("name", ["logo.svg", "logo.gif", "logo.pdf", "logo", "logo.png.exe", ".png"])
def test_only_png_and_jpg_endings_are_accepted(client, school, owner, name):
    response = client.post(f"{URL}/aaptprep/logo", json={"filename": name, "size": 10}, headers=owner)
    assert response.status_code == 422
    assert "PNG or JPG" in response.json()["detail"]


@pytest.mark.parametrize("size", [0, -1, 1024 * 1024 + 1])
def test_the_size_must_be_up_to_one_megabyte(client, school, owner, size):
    response = client.post(f"{URL}/aaptprep/logo", json={"filename": "a.png", "size": size}, headers=owner)
    assert response.status_code == 422
    assert "1 MB" in response.json()["detail"]


def test_a_picture_that_never_arrived_is_refused_and_can_be_retried(client, school, owner):
    client.post(f"{URL}/aaptprep/logo", json={"filename": "a.png", "size": 10}, headers=owner)
    response = client.post(f"{URL}/aaptprep/logo/complete", headers=owner)
    assert response.status_code == 422
    assert "hasn't arrived" in response.json()["detail"]


def test_completing_without_asking_first_is_refused(client, school, owner):
    response = client.post(f"{URL}/aaptprep/logo/complete", headers=owner)
    assert response.status_code == 422
    assert "Choose a logo" in response.json()["detail"]


@pytest.mark.parametrize("name, body", [("fake.png", b"just text"), ("fake.png", JPG), ("fake.jpg", PNG)])
def test_a_file_that_is_not_the_picture_it_claims_to_be_is_removed(client, school, owner, repo, s3, name, body):
    client.post(f"{URL}/aaptprep/logo", json={"filename": name, "size": len(body)}, headers=owner)
    key = pending_key(repo)
    s3.put_object(Bucket=BUCKET, Key=key, Body=body)

    response = client.post(f"{URL}/aaptprep/logo/complete", headers=owner)
    assert response.status_code == 422
    assert "isn't a real" in response.json()["detail"]
    assert not exists(s3, key)
    assert "logo" not in repo.get_tenant("aaptprep")["branding"]


def test_a_picture_bigger_than_it_said_is_removed(client, school, owner, repo, s3):
    client.post(f"{URL}/aaptprep/logo", json={"filename": "a.png", "size": 20}, headers=owner)
    key = pending_key(repo)
    s3.put_object(Bucket=BUCKET, Key=key, Body=PNG + b"x" * 500)
    assert client.post(f"{URL}/aaptprep/logo/complete", headers=owner).status_code == 422
    assert not exists(s3, key)


def test_an_unknown_institute_and_the_platform_itself_are_not_found(client, school, owner):
    for slug in ("nobody", "platform"):
        assert client.post(f"{URL}/{slug}/logo", json={"filename": "a.png", "size": 10}, headers=owner).status_code == 404
        assert client.post(f"{URL}/{slug}/logo/complete", headers=owner).status_code == 404
        assert client.post(f"{URL}/{slug}/logo/remove", headers=owner).status_code == 404


# ---- Replacing and removing ----

def test_a_new_logo_replaces_the_old_one_and_removes_its_file(client, school, owner, repo, s3):
    first = add_logo(client, s3, repo, owner)
    old_key = repo.get_tenant("aaptprep")["branding"]["logo"]["key"]
    second = add_logo(client, s3, repo, owner, "new.jpg", JPG)
    assert second["logo_url"] != first["logo_url"]  # a new version, so browsers fetch the new picture
    assert not exists(s3, old_key)
    assert exists(s3, repo.get_tenant("aaptprep")["branding"]["logo"]["key"])


def test_a_failed_replacement_keeps_the_old_logo(client, school, owner, repo, s3):
    first = add_logo(client, s3, repo, owner)
    client.post(f"{URL}/aaptprep/logo", json={"filename": "bad.png", "size": 9}, headers=owner)
    s3.put_object(Bucket=BUCKET, Key=pending_key(repo), Body=b"not a png")
    assert client.post(f"{URL}/aaptprep/logo/complete", headers=owner).status_code == 422
    assert client.get(f"{URL}/aaptprep", headers=owner).json()["logo_url"] == first["logo_url"]


def test_removing_the_logo_deletes_its_file(client, school, owner, repo, s3):
    add_logo(client, s3, repo, owner)
    key = repo.get_tenant("aaptprep")["branding"]["logo"]["key"]
    response = client.post(f"{URL}/aaptprep/logo/remove", headers=owner)
    assert response.status_code == 200
    assert response.json()["logo_url"] is None
    assert not exists(s3, key)
    assert client.post(f"{URL}/aaptprep/logo/remove", headers=owner).status_code == 200  # nothing to remove is fine


def test_changing_the_name_or_colour_keeps_the_logo(client, school, owner, repo, s3):
    add_logo(client, s3, repo, owner)
    changed = client.patch(f"{URL}/aaptprep", json={"name": "AaptPrep Classes", "primary_color": "#0d9488"}, headers=owner)
    assert changed.status_code == 200
    assert changed.json()["institute"]["logo_url"] is not None


# ---- Seeing it ----

def test_the_public_institute_info_carries_the_logo_address(client, school, owner, repo, s3):
    assert client.get("/api/tenant", headers=headers("aaptprep")).json()["branding"]["logo_url"] is None
    institute = add_logo(client, s3, repo, owner)
    branding = client.get("/api/tenant", headers=headers("aaptprep")).json()["branding"]
    assert branding["logo_url"] == institute["logo_url"]
    assert "key" not in branding and "logo" not in branding  # where it is stored is never shown


def test_anyone_can_fetch_the_logo_without_signing_in(client, school, owner, repo, s3):
    add_logo(client, s3, repo, owner)
    key = repo.get_tenant("aaptprep")["branding"]["logo"]["key"]
    response = client.get("/api/logo/aaptprep", follow_redirects=False)  # no tenant header and no sign-in
    assert response.status_code == 302
    assert key in response.headers["location"]
    assert "max-age=300" in response.headers["cache-control"]


def test_there_is_no_logo_to_fetch_before_one_is_added_or_after_it_is_removed(client, school, owner, repo, s3):
    assert client.get("/api/logo/aaptprep", follow_redirects=False).status_code == 404
    add_logo(client, s3, repo, owner)
    client.post(f"{URL}/aaptprep/logo/remove", headers=owner)
    assert client.get("/api/logo/aaptprep", follow_redirects=False).status_code == 404
    assert client.get("/api/logo/nobody", follow_redirects=False).status_code == 404
    assert client.get("/api/logo/platform", follow_redirects=False).status_code == 404


def test_one_institutes_logo_is_not_served_for_another(client, school, owner, repo, s3, make_tenant):
    make_tenant("other", "Other", "boss@example.com")
    add_logo(client, s3, repo, owner)
    assert client.get("/api/logo/other", follow_redirects=False).status_code == 404


def test_the_platform_list_shows_which_institutes_have_a_logo(client, school, owner, repo, s3, make_tenant):
    make_tenant("other", "Other", "boss@example.com")
    add_logo(client, s3, repo, owner)
    listed = {i["slug"]: i["logo_url"] for i in client.get(URL, headers=owner).json()}
    assert listed["aaptprep"] and listed["other"] is None
