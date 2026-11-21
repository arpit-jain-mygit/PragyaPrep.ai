"""Tenant tests: creating institutes, finding the institute for a request, and suspending one."""
import pytest

from app import tenants
from scripts import manage_tenants


def tenant_headers(slug: str) -> dict:
    return {"X-Tenant": slug}


# ---- Creating an institute ----

def test_creating_an_institute_also_creates_its_one_approved_admin(repo, make_tenant):
    tenant = make_tenant("aaptprep", "AAPT Prep", "Owner@AaptPrep.com")
    assert tenant["status"] == "active"

    admin = repo.scoped("aaptprep").get_member("owner@aaptprep.com")
    assert admin["role"] == "tenant_admin"
    assert admin["status"] == "approved"
    assert admin["first_name"] == "Test"


def test_admin_email_is_stored_in_lowercase_and_found_in_any_case(repo, make_tenant):
    make_tenant("aaptprep", admin_email="  Owner@AaptPrep.com ")
    assert repo.scoped("aaptprep").get_member("OWNER@aaptprep.COM") is not None


def test_a_second_institute_with_the_same_short_name_is_refused(make_tenant):
    make_tenant("aaptprep")
    with pytest.raises(tenants.ValidationError, match="already exists"):
        make_tenant("aaptprep")


@pytest.mark.parametrize("slug", ["", "ab", "9abc", "has space", "bad#slug", "UPPER_case", "../x", "a" * 31])
def test_bad_short_names_are_refused(make_tenant, slug):
    with pytest.raises(tenants.ValidationError):
        make_tenant(slug)


@pytest.mark.parametrize("slug", ["platform", "platform-admin", "admin", "api", "www", "login"])
def test_reserved_short_names_are_refused(make_tenant, slug):
    with pytest.raises(tenants.ValidationError, match="reserved"):
        make_tenant(slug)


def test_short_names_are_not_case_sensitive(repo, make_tenant):
    make_tenant("  AaptPrep ")
    assert repo.get_tenant("aaptprep") is not None


@pytest.mark.parametrize("email", ["", "not-an-email", "a@b", "a b@c.com"])
def test_bad_admin_emails_are_refused(make_tenant, email):
    with pytest.raises(tenants.ValidationError):
        make_tenant("aaptprep", admin_email=email)


def test_bad_colour_is_refused(repo):
    with pytest.raises(tenants.ValidationError, match="colour"):
        tenants.create_tenant(repo, "aaptprep", "AAPT Prep", "a@b.com", "Admin", primary_color="blue")


# ---- Finding the institute for a request ----

def test_public_info_comes_back_for_a_known_institute(client, make_tenant):
    make_tenant("aaptprep", "AAPT Prep")
    response = client.get("/api/tenant", headers=tenant_headers("aaptprep"))
    assert response.status_code == 200
    body = response.json()
    features = body.pop("features")
    assert body.pop("menu_headings")["Learn"] == "book-open"
    assert body.pop("menu_icon_colour") == "#4f46e5"
    assert body.pop("design") == "exam"
    assert body == {
        "slug": "aaptprep",
        "name": "AAPT Prep",
        "branding": {"display_name": "AAPT Prep", "primary_color": "#2563eb", "text_color": "#2563eb", "logo_url": None},
        "profile": {"description": "", "city": "", "contact_email": "", "contact_phone": "", "website": "", "exam_categories": []},
    }
    # A new institute shows every built feature, in the default order.
    assert [item["key"] for item in features] == ["dashboard_points", "word_of_day", "leaderboard", "yesterday_winners", "daily_challenge", "coursework", "vocabulary", "idioms", "topic_tests", "sectionals", "mocks", "daily_rc", "weekly_dilr", "past_papers", "past_papers_explore", "syllabus", "filter_topics", "analyse_topic_tests", "analyse_sectionals", "analyse_mocks", "swot", "pi_bank", "feedback", "help", "application_tracker", "eligibility", "tools_syllabus", "cutoffs", "live_classes", "tests", "results", "notices"]
    assert all(item["enabled"] for item in features)


def test_public_info_never_includes_private_fields(client, make_tenant):
    make_tenant("aaptprep")
    body = client.get("/api/tenant", headers=tenant_headers("aaptprep")).json()
    assert set(body) == {"slug", "name", "branding", "profile", "features", "menu_headings", "menu_icon_colour", "design"}


def test_the_header_is_not_case_sensitive_and_ignores_spaces(client, make_tenant):
    make_tenant("aaptprep")
    assert client.get("/api/tenant", headers=tenant_headers("  AAPTPREP ")).status_code == 200


def test_a_missing_header_is_an_error_not_a_default(client, make_tenant):
    make_tenant("aaptprep")
    response = client.get("/api/tenant")
    assert response.status_code == 400
    assert "X-Tenant" in response.json()["detail"]


def test_an_unknown_institute_is_not_found(client, make_tenant):
    make_tenant("aaptprep")
    assert client.get("/api/tenant", headers=tenant_headers("nobody")).status_code == 404


@pytest.mark.parametrize("slug", ["a", "bad#slug", "../etc", "9abc"])
def test_a_malformed_institute_name_is_refused(client, slug):
    assert client.get("/api/tenant", headers=tenant_headers(slug)).status_code == 400


# ---- Suspending ----

def test_a_suspended_institute_is_locked_and_comes_back_when_reactivated(client, repo, make_tenant):
    make_tenant("aaptprep")
    tenants.set_tenant_status(repo, "aaptprep", "suspended")
    response = client.get("/api/tenant", headers=tenant_headers("aaptprep"))
    assert response.status_code == 403
    assert "isn't active" in response.json()["detail"]

    tenants.set_tenant_status(repo, "aaptprep", "active")
    assert client.get("/api/tenant", headers=tenant_headers("aaptprep")).status_code == 200


def test_suspending_one_institute_leaves_the_others_working(client, repo, make_tenant):
    make_tenant("aaptprep")
    make_tenant("otherinst")
    tenants.set_tenant_status(repo, "aaptprep", "suspended")
    assert client.get("/api/tenant", headers=tenant_headers("otherinst")).status_code == 200


def test_the_platform_tenant_cannot_be_suspended(repo):
    tenants.ensure_platform_admin(repo, "owner@example.com")
    with pytest.raises(tenants.ValidationError):
        tenants.set_tenant_status(repo, "platform", "suspended")


def test_suspending_an_unknown_institute_is_refused(repo):
    with pytest.raises(tenants.ValidationError, match="No institute"):
        tenants.set_tenant_status(repo, "nobody", "suspended")


# ---- The platform admin ----

def test_the_platform_admin_lives_in_the_reserved_platform_tenant(repo):
    tenants.ensure_platform_admin(repo, "Owner@Example.com", "Owner Name")
    admin = repo.scoped("platform").get_member("owner@example.com")
    assert admin["role"] == "platform_admin"
    assert admin["status"] == "approved"


def test_setting_up_the_platform_admin_twice_changes_nothing(repo):
    tenants.ensure_platform_admin(repo, "owner@example.com")
    tenants.ensure_platform_admin(repo, "owner@example.com")
    assert len([t for t in repo.list_tenants() if t["slug"] == "platform"]) == 1


def test_a_second_platform_admin_can_be_added(repo):
    tenants.ensure_platform_admin(repo, "owner@example.com")
    tenants.ensure_platform_admin(repo, "second@example.com")
    assert repo.scoped("platform").get_member("second@example.com")["role"] == "platform_admin"


def test_listing_shows_every_institute_in_order(repo, make_tenant):
    make_tenant("zeta")
    make_tenant("alpha")
    assert [t["slug"] for t in repo.list_tenants()] == ["alpha", "zeta"]


# ---- The command-line script ----

def test_script_creates_lists_suspends_and_activates(repo, capsys):
    assert manage_tenants.main(
        ["create", "--slug", "aaptprep", "--name", "AAPT Prep", "--admin-email", "a@b.com", "--admin-name", "Ann Admin"],
        repo,
    ) == 0
    assert manage_tenants.main(["suspend", "--slug", "aaptprep"], repo) == 0
    assert repo.get_tenant("aaptprep")["status"] == "suspended"
    assert manage_tenants.main(["activate", "--slug", "aaptprep"], repo) == 0
    assert repo.get_tenant("aaptprep")["status"] == "active"

    capsys.readouterr()
    manage_tenants.main(["list"], repo)
    assert "aaptprep" in capsys.readouterr().out


def test_script_reports_errors_and_exits_with_failure(repo, capsys):
    code = manage_tenants.main(
        ["create", "--slug", "admin", "--name", "X", "--admin-email", "a@b.com", "--admin-name", "A"], repo
    )
    assert code == 1
    assert "reserved" in capsys.readouterr().err


def test_script_sets_up_the_platform_admin(repo):
    assert manage_tenants.main(["platform-admin", "--email", "owner@example.com", "--name", "Owner Name"], repo) == 0
    assert repo.scoped("platform").get_member("owner@example.com") is not None


def test_script_adds_and_lists_courses(repo, make_tenant, capsys):
    make_tenant("aaptprep")

    assert manage_tenants.main(["add-course", "--slug", "aaptprep", "--name", "CLAT", "--fee", "10000"], repo) == 0
    assert manage_tenants.main(
        ["add-course", "--slug", "aaptprep", "--name", "CAT", "--fee", "8000", "--access", "days=365"], repo
    ) == 0

    capsys.readouterr()
    manage_tenants.main(["list-courses", "--slug", "aaptprep"], repo)
    out = capsys.readouterr().out
    assert "CAT" in out and "365 days" in out
    assert "CLAT" in out and "unlimited" in out
    assert [c["name"] for c in repo.scoped("aaptprep").list_courses()] == ["CAT", "CLAT"]


def test_script_course_errors_exit_with_failure(repo, make_tenant, capsys):
    make_tenant("aaptprep")
    manage_tenants.main(["add-course", "--slug", "aaptprep", "--name", "CLAT", "--fee", "10000"], repo)

    assert manage_tenants.main(["add-course", "--slug", "aaptprep", "--name", "clat", "--fee", "1"], repo) == 1
    assert manage_tenants.main(["add-course", "--slug", "nobody", "--name", "X", "--fee", "1"], repo) == 1
    assert manage_tenants.main(
        ["add-course", "--slug", "aaptprep", "--name", "Y", "--fee", "1", "--access", "forever"], repo
    ) == 1
    errors = capsys.readouterr().err
    assert "already exists" in errors and "No institute" in errors and "Access must be" in errors


def test_script_lists_each_institutes_admin(repo, make_tenant, capsys):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    manage_tenants.main(["list"], repo)
    assert "ritesh@example.com" in capsys.readouterr().out


def test_script_records_the_admin_of_an_older_institute_and_checks_it(repo, make_tenant, add_member, capsys):
    make_tenant("aaptprep", admin_email="ritesh@example.com")
    repo.update_tenant("aaptprep", admin_email="")  # as if made before admins were recorded
    add_member("aaptprep", "asha@example.com")

    assert manage_tenants.main(["link-admin", "--slug", "aaptprep", "--email", "Ritesh@Example.com"], repo) == 0
    assert repo.get_tenant("aaptprep")["admin_email"] == "ritesh@example.com"

    assert manage_tenants.main(["link-admin", "--slug", "aaptprep", "--email", "asha@example.com"], repo) == 1
    assert "is not the admin" in capsys.readouterr().err
