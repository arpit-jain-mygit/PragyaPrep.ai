"""The platform admin's tools: view, create and edit institutes and their admin. Nothing can be deleted."""
import pytest

from app import tenants
from app.repo import now_iso
from conftest import code_in, headers

URL = "/api/platform/institutes"


@pytest.fixture
def owner(repo, sign_in):
    """The platform admin, signed in at the platform tenant."""
    tenants.ensure_platform_admin(repo, "owner@example.com", "Platform Owner")
    return sign_in("platform", "owner@example.com")


def new_form(**overrides) -> dict:
    form = {"slug": "newinst", "name": "New Institute", "admin_name": "Nina Shah", "admin_email": "nina@newinst.example.com"}
    form.update(overrides)
    return form


def make_legacy(repo, slug="legacy"):
    """An institute made before the admin was recorded on it: it has an admin person but no admin_email."""
    repo.create_tenant(
        {"slug": slug, "name": "Legacy Institute", "status": "active",
         "branding": {"display_name": "Legacy Institute", "primary_color": "#2563eb"}, "created_at": now_iso()}
    )
    repo.scoped(slug).create_member(
        {"email": "old-admin@legacy.example.com", "role": "tenant_admin", "status": "approved",
         "first_name": "Old", "last_name": "Admin", "created_at": now_iso()}
    )


# ---- Who may use it ----

@pytest.mark.parametrize("method, path, body", [
    ("get", URL, None),
    ("get", f"{URL}/aaptprep", None),
    ("post", URL, new_form()),
    ("patch", f"{URL}/aaptprep", {"name": "X"}),
])
def test_it_needs_a_login(client, owner, make_tenant, method, path, body):
    make_tenant("aaptprep")
    assert client.request(method, path, json=body, headers=headers("platform")).status_code == 401


@pytest.mark.parametrize("method, path, body", [
    ("get", URL, None),
    ("get", f"{URL}/aaptprep", None),
    ("post", URL, new_form()),
    ("patch", f"{URL}/aaptprep", {"name": "X"}),
])
def test_an_institute_admin_and_a_student_are_refused(client, make_tenant, add_member, sign_in, method, path, body):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    add_member("aaptprep", "asha@example.com")
    for who in ("ritesh@example.com", "asha@example.com"):
        session = sign_in("aaptprep", who)
        response = client.request(method, path, json=body, headers=session)
        assert response.status_code == 403, (who, response.text)


def test_an_institute_admins_session_does_not_work_at_the_platform(client, make_tenant, owner, sign_in):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    token = sign_in("aaptprep", "ritesh@example.com")["Authorization"].split()[1]
    response = client.get(URL, headers=headers("platform", token))
    assert response.status_code == 401


def test_the_platform_admins_session_does_not_work_at_an_institute(client, make_tenant, owner):
    make_tenant("aaptprep")
    token = owner["Authorization"].split()[1]
    assert client.get(URL, headers=headers("aaptprep", token)).status_code == 401


def test_the_institute_must_be_named(client, owner):
    assert client.get(URL, headers={"Authorization": owner["Authorization"]}).status_code == 400


def test_a_suspended_platform_admin_is_signed_out(client, repo, owner):
    assert client.get(URL, headers=owner).status_code == 200
    repo.scoped("platform").update_member("owner@example.com", status="suspended")
    assert client.get(URL, headers=owner).status_code == 401


# ---- Viewing ----

def test_the_list_is_empty_when_there_are_no_institutes(client, owner):
    assert client.get(URL, headers=owner).json() == []


def test_the_list_shows_each_institute_with_its_admin_in_short_name_order(client, owner, make_tenant):
    make_tenant("zeta", "Zeta Academy", "zed@zeta.example.com")
    make_tenant("alpha", "Alpha Institute", "ann@alpha.example.com")

    response = client.get(URL, headers=owner)

    assert response.status_code == 200
    assert [i["slug"] for i in response.json()] == ["alpha", "zeta"]
    alpha = response.json()[0]
    assert alpha["name"] == "Alpha Institute"
    assert alpha["status"] == "active"
    assert alpha["primary_color"] == "#2563eb"
    assert alpha["created_at"]
    assert alpha["admin"] == {"email": "ann@alpha.example.com", "first_name": "Test", "last_name": "Admin", "status": "approved"}


def test_the_platforms_own_tenant_is_not_listed_or_viewable(client, owner):
    assert "platform" not in [i["slug"] for i in client.get(URL, headers=owner).json()]
    assert client.get(f"{URL}/platform", headers=owner).status_code == 404


def test_one_institute_can_be_viewed_in_any_case(client, owner, make_tenant):
    make_tenant("aaptprep", "AaptPrep")
    response = client.get(f"{URL}/AaptPrep", headers=owner)
    assert response.status_code == 200
    assert response.json()["name"] == "AaptPrep"


def test_an_unknown_institute_is_not_found(client, owner):
    assert client.get(f"{URL}/nobody", headers=owner).status_code == 404


def test_an_institute_made_before_admins_were_recorded_shows_no_admin(client, repo, owner):
    make_legacy(repo)
    assert client.get(f"{URL}/legacy", headers=owner).json()["admin"] is None


# ---- Creating ----

def test_creating_an_institute_makes_it_and_its_approved_admin_and_emails_the_admin(client, repo, owner, mailer):
    mailer.sent.clear()

    response = client.post(URL, json=new_form(primary_color="#7C3AED"), headers=owner)

    assert response.status_code == 201
    body = response.json()
    assert body["new_admin_notified"] is True
    assert body["institute"]["slug"] == "newinst"
    assert body["institute"]["name"] == "New Institute"
    assert body["institute"]["primary_color"] == "#7c3aed"
    assert body["institute"]["status"] == "active"
    assert body["institute"]["admin"] == {
        "email": "nina@newinst.example.com", "first_name": "Nina", "last_name": "Shah", "status": "approved",
    }
    assert repo.scoped("newinst").get_member("nina@newinst.example.com")["role"] == "tenant_admin"

    welcome = mailer.sent[-1]
    assert welcome.to == "nina@newinst.example.com"
    assert "admin of New Institute" in welcome.subject
    assert "6-digit code" in welcome.body and "Nina" in welcome.body


def test_the_new_institute_is_visible_to_the_public_with_its_branding(client, owner):
    client.post(URL, json=new_form(primary_color="#7c3aed"), headers=owner)
    info = client.get("/api/tenant", headers=headers("newinst")).json()
    assert info["name"] == "New Institute"
    assert info["branding"]["primary_color"] == "#7c3aed"


def test_the_new_admin_can_log_in_straight_away(client, owner, mailer):
    client.post(URL, json=new_form(), headers=owner)
    asked = client.post("/api/auth/request-code", json={"email": "nina@newinst.example.com"}, headers=headers("newinst"))
    assert asked.json()["status"] == "code_sent"
    assert mailer.sent[-1].to == "nina@newinst.example.com"
    assert code_in(mailer.sent[-1])


def test_the_default_colour_is_used_when_none_is_given(client, owner):
    assert client.post(URL, json=new_form(), headers=owner).json()["institute"]["primary_color"] == "#2563eb"


@pytest.mark.parametrize("overrides, message", [
    ({"slug": ""}, "3 to 30 letters"),
    ({"slug": "ab"}, "3 to 30 letters"),
    ({"slug": "9abc"}, "3 to 30 letters"),
    ({"slug": "bad#slug"}, "3 to 30 letters"),
    ({"slug": "platform"}, "reserved"),
    ({"slug": "login"}, "reserved"),
    ({"name": ""}, "1 to 120 characters"),
    ({"name": "x" * 121}, "1 to 120 characters"),
    ({"admin_name": ""}, "admin's name is required"),
    ({"admin_email": "nope"}, "valid email"),
    ({"primary_color": "blue"}, "colour"),
])
def test_bad_details_are_refused_with_a_clear_message_and_nothing_is_created(client, owner, overrides, message):
    response = client.post(URL, json=new_form(**overrides), headers=owner)
    assert response.status_code == 422
    assert message in response.json()["detail"]
    assert client.get(URL, headers=owner).json() == []


def test_a_short_name_already_used_is_refused_in_any_case(client, owner, make_tenant):
    make_tenant("aaptprep")
    response = client.post(URL, json=new_form(slug="AaptPrep"), headers=owner)
    assert response.status_code == 422
    assert "already exists" in response.json()["detail"]


def test_a_failed_welcome_email_does_not_undo_the_creation(client, owner):
    class Broken:
        def send(self, email):
            raise RuntimeError("down")

    client.app.state.mailer = Broken()
    response = client.post(URL, json=new_form(), headers=owner)
    assert response.status_code == 201
    assert response.json()["new_admin_notified"] is False
    assert client.get(f"{URL}/newinst", headers=owner).status_code == 200


# ---- Editing the institute ----

def test_the_name_and_colour_can_be_changed_and_show_on_the_institutes_own_pages(client, owner, make_tenant):
    make_tenant("aaptprep", "AAPT Prep")

    response = client.patch(f"{URL}/aaptprep", json={"name": "AaptPrep", "primary_color": "#0F766E"}, headers=owner)

    assert response.status_code == 200
    assert response.json()["institute"]["name"] == "AaptPrep"
    assert response.json()["institute"]["primary_color"] == "#0f766e"
    assert response.json()["new_admin_notified"] is None
    info = client.get("/api/tenant", headers=headers("aaptprep")).json()
    assert info["name"] == "AaptPrep"
    assert info["branding"] == {"display_name": "AaptPrep", "primary_color": "#0f766e", "logo_url": None}


def test_only_what_is_sent_is_changed(client, owner, make_tenant):
    make_tenant("aaptprep", "AAPT Prep")
    client.patch(f"{URL}/aaptprep", json={"primary_color": "#0f766e"}, headers=owner)
    institute = client.get(f"{URL}/aaptprep", headers=owner).json()
    assert institute["name"] == "AAPT Prep"
    assert institute["primary_color"] == "#0f766e"


def test_a_change_with_nothing_in_it_changes_nothing(client, owner, make_tenant):
    make_tenant("aaptprep", "AAPT Prep")
    before = client.get(f"{URL}/aaptprep", headers=owner).json()
    response = client.patch(f"{URL}/aaptprep", json={}, headers=owner)
    assert response.status_code == 200
    assert response.json()["institute"] == before


def test_suspending_locks_the_institute_out_and_reactivating_brings_it_back(client, owner, make_tenant, sign_in):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    ritesh = sign_in("aaptprep", "ritesh@example.com")

    suspended = client.patch(f"{URL}/aaptprep", json={"status": "suspended"}, headers=owner)

    assert suspended.json()["institute"]["status"] == "suspended"
    assert client.get("/api/tenant", headers=headers("aaptprep")).status_code == 403
    assert client.get("/api/auth/me", headers=ritesh).status_code == 403

    client.patch(f"{URL}/aaptprep", json={"status": "active"}, headers=owner)
    assert client.get("/api/tenant", headers=headers("aaptprep")).status_code == 200
    assert client.get("/api/auth/me", headers=ritesh).status_code == 200


def test_the_platform_admin_can_still_see_and_edit_a_suspended_institute(client, owner, make_tenant):
    make_tenant("aaptprep")
    client.patch(f"{URL}/aaptprep", json={"status": "suspended"}, headers=owner)
    assert client.get(f"{URL}/aaptprep", headers=owner).json()["status"] == "suspended"
    assert client.patch(f"{URL}/aaptprep", json={"name": "Renamed"}, headers=owner).status_code == 200


def test_a_bad_value_is_refused_and_nothing_at_all_is_changed(client, owner, make_tenant):
    make_tenant("aaptprep", "AAPT Prep")
    response = client.patch(f"{URL}/aaptprep", json={"name": "New Name", "status": "deleted"}, headers=owner)
    assert response.status_code == 422
    assert client.get(f"{URL}/aaptprep", headers=owner).json()["name"] == "AAPT Prep"

    response = client.patch(f"{URL}/aaptprep", json={"name": "New Name", "primary_color": "red"}, headers=owner)
    assert response.status_code == 422
    assert client.get(f"{URL}/aaptprep", headers=owner).json()["name"] == "AAPT Prep"


def test_the_short_name_cannot_be_changed(client, owner, make_tenant):
    make_tenant("aaptprep")
    response = client.patch(f"{URL}/aaptprep", json={"slug": "other", "name": "Same Place"}, headers=owner)
    assert response.status_code == 200
    assert response.json()["institute"]["slug"] == "aaptprep"
    assert [i["slug"] for i in client.get(URL, headers=owner).json()] == ["aaptprep"]


def test_the_platform_tenant_and_unknown_institutes_cannot_be_edited(client, owner):
    assert client.patch(f"{URL}/platform", json={"status": "suspended"}, headers=owner).status_code == 404
    assert client.patch(f"{URL}/nobody", json={"name": "X"}, headers=owner).status_code == 404
    assert client.get("/api/tenant", headers=headers("platform")).status_code == 200


def test_editing_one_institute_leaves_the_others_alone(client, owner, make_tenant):
    make_tenant("alpha", "Alpha Institute")
    make_tenant("beta", "Beta Academy")
    client.patch(f"{URL}/alpha", json={"name": "Alpha Renamed", "status": "suspended"}, headers=owner)
    beta = client.get(f"{URL}/beta", headers=owner).json()
    assert beta["name"] == "Beta Academy" and beta["status"] == "active"


# ---- Editing the admin ----

def test_the_admins_name_can_be_changed_without_changing_who_they_are(client, repo, owner, make_tenant, mailer):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    mailer.sent.clear()

    response = client.patch(f"{URL}/aaptprep", json={"admin_name": "Ritesh Kumar Jain"}, headers=owner)

    assert response.status_code == 200
    assert response.json()["new_admin_notified"] is None
    admin = response.json()["institute"]["admin"]
    assert admin["email"] == "ritesh@example.com"
    assert admin["first_name"] == "Ritesh" and admin["last_name"] == "Kumar Jain"
    assert admin["status"] == "approved"
    assert mailer.sent == []


def test_sending_the_same_email_in_another_case_is_not_a_replacement(client, owner, make_tenant, mailer):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    mailer.sent.clear()
    response = client.patch(f"{URL}/aaptprep", json={"admin_email": "  Ritesh@Example.COM "}, headers=owner)
    assert response.status_code == 200
    assert response.json()["new_admin_notified"] is None
    assert mailer.sent == []


def test_changing_the_admins_email_makes_a_new_admin_switches_off_the_old_one_and_tells_the_new_one(
    client, repo, owner, make_tenant, sign_in, mailer
):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    old_session = sign_in("aaptprep", "ritesh@example.com")
    assert client.get("/api/auth/me", headers=old_session).status_code == 200
    mailer.sent.clear()

    response = client.patch(f"{URL}/aaptprep", json={"admin_email": "Priya@Example.com"}, headers=owner)

    assert response.status_code == 200
    assert response.json()["new_admin_notified"] is True
    admin = response.json()["institute"]["admin"]
    assert admin == {"email": "priya@example.com", "first_name": "Test", "last_name": "Admin", "status": "approved"}

    new = repo.scoped("aaptprep").get_member("priya@example.com")
    assert new["role"] == "tenant_admin" and new["status"] == "approved"
    old = repo.scoped("aaptprep").get_member("ritesh@example.com")
    assert old["status"] == "suspended"
    assert old["decided_by"] == "owner@example.com"
    assert old["reason"] == "Replaced as the institute's admin"

    assert mailer.sent[-1].to == "priya@example.com"
    assert "admin of AAPT Prep" in mailer.sent[-1].subject

    # The old admin is out at once, and the new one can sign in.
    assert client.get("/api/auth/me", headers=old_session).status_code == 401
    asked = client.post("/api/auth/request-code", json={"email": "ritesh@example.com"}, headers=headers("aaptprep"))
    assert asked.json()["status"] == "suspended"
    new_session = sign_in("aaptprep", "priya@example.com")
    assert client.get("/api/auth/me", headers=new_session).json()["role"] == "tenant_admin"


def test_the_new_admin_can_be_given_a_new_name_in_the_same_change(client, owner, make_tenant):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    response = client.patch(
        f"{URL}/aaptprep", json={"admin_email": "priya@example.com", "admin_name": "Priya Menon"}, headers=owner
    )
    assert response.json()["institute"]["admin"]["first_name"] == "Priya"
    assert response.json()["institute"]["admin"]["last_name"] == "Menon"


def test_the_old_admins_details_are_kept_not_deleted(client, repo, owner, make_tenant):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    client.patch(f"{URL}/aaptprep", json={"admin_email": "priya@example.com"}, headers=owner)
    assert repo.scoped("aaptprep").get_member("ritesh@example.com") is not None


def test_an_email_already_registered_at_the_institute_cannot_become_the_admin(client, repo, owner, make_tenant, add_member):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    add_member("aaptprep", "asha@example.com")

    response = client.patch(f"{URL}/aaptprep", json={"admin_email": "asha@example.com"}, headers=owner)

    assert response.status_code == 422
    assert "already registered" in response.json()["detail"]
    assert repo.scoped("aaptprep").get_member("ritesh@example.com")["status"] == "approved"
    assert repo.scoped("aaptprep").get_member("asha@example.com")["role"] == "student"
    assert client.get(f"{URL}/aaptprep", headers=owner).json()["admin"]["email"] == "ritesh@example.com"


def test_a_bad_admin_email_is_refused_and_changes_nothing(client, owner, make_tenant):
    make_tenant("aaptprep", "AAPT Prep", admin_email="ritesh@example.com")
    response = client.patch(f"{URL}/aaptprep", json={"name": "Renamed", "admin_email": "nope"}, headers=owner)
    assert response.status_code == 422
    institute = client.get(f"{URL}/aaptprep", headers=owner).json()
    assert institute["name"] == "AAPT Prep"
    assert institute["admin"]["email"] == "ritesh@example.com"


def test_a_failed_welcome_email_does_not_undo_changing_the_admin(client, owner, make_tenant):
    make_tenant("aaptprep", admin_email="ritesh@example.com")

    class Broken:
        def send(self, email):
            raise RuntimeError("down")

    client.app.state.mailer = Broken()
    response = client.patch(f"{URL}/aaptprep", json={"admin_email": "priya@example.com"}, headers=owner)
    assert response.status_code == 200
    assert response.json()["new_admin_notified"] is False
    assert response.json()["institute"]["admin"]["email"] == "priya@example.com"


def test_two_institutes_can_have_the_same_admin_email(client, owner, make_tenant):
    make_tenant("alpha", admin_email="same@example.com")
    assert client.post(URL, json=new_form(admin_email="same@example.com"), headers=owner).status_code == 201


# ---- Institutes made before the admin was recorded ----

def test_a_name_change_for_an_institute_with_no_admin_on_record_asks_for_the_email(client, repo, owner):
    make_legacy(repo)
    response = client.patch(f"{URL}/legacy", json={"admin_name": "Someone"}, headers=owner)
    assert response.status_code == 422
    assert "no admin on record" in response.json()["detail"]


def test_an_admin_can_be_set_for_an_institute_with_none_on_record(client, repo, owner):
    make_legacy(repo)

    missing_name = client.patch(f"{URL}/legacy", json={"admin_email": "new@legacy.example.com"}, headers=owner)
    assert missing_name.status_code == 422
    assert "new admin's name" in missing_name.json()["detail"]

    response = client.patch(
        f"{URL}/legacy", json={"admin_email": "new@legacy.example.com", "admin_name": "New Person"}, headers=owner
    )
    assert response.status_code == 200
    assert response.json()["institute"]["admin"]["email"] == "new@legacy.example.com"
    assert repo.scoped("legacy").get_member("old-admin@legacy.example.com")["status"] == "approved"  # untouched


def test_recording_an_existing_admin_makes_them_show_up(client, repo, owner):
    make_legacy(repo)
    tenants.link_admin(repo, "legacy", "Old-Admin@legacy.example.com")
    admin = client.get(f"{URL}/legacy", headers=owner).json()["admin"]
    assert admin["email"] == "old-admin@legacy.example.com"
    assert admin["first_name"] == "Old"


def test_recording_an_admin_checks_that_the_person_really_is_the_admin(repo, make_tenant, add_member):
    make_tenant("aaptprep")
    add_member("aaptprep", "asha@example.com")
    with pytest.raises(tenants.ValidationError, match="is not the admin"):
        tenants.link_admin(repo, "aaptprep", "asha@example.com")
    with pytest.raises(tenants.ValidationError, match="is not the admin"):
        tenants.link_admin(repo, "aaptprep", "nobody@example.com")
    with pytest.raises(tenants.ValidationError, match="No institute"):
        tenants.link_admin(repo, "nobody", "asha@example.com")
    with pytest.raises(tenants.ValidationError, match="No institute"):
        tenants.link_admin(repo, "platform", "owner@example.com")


# ---- Nothing can be deleted ----

def test_there_is_no_way_to_delete_an_institute(client, owner, make_tenant):
    make_tenant("aaptprep")
    assert client.delete(f"{URL}/aaptprep", headers=owner).status_code == 405
    assert client.delete(URL, headers=owner).status_code == 405
    assert client.get(f"{URL}/aaptprep", headers=owner).status_code == 200


def test_the_platform_api_offers_no_delete_at_all(client):
    paths = client.get("/openapi.json").json()["paths"]
    platform_paths = {path: methods for path, methods in paths.items() if path.startswith("/api/platform")}
    assert platform_paths
    for path, methods in platform_paths.items():
        assert "delete" not in methods, path
