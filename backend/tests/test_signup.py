"""First-time sign-up: a new institute, or a free student or parent, each with an emailed code and no one's approval."""
import re

import pytest

from app import tenants
from test_coursework import sub, topic


def code_from(mailer, to):
    mail = [m for m in mailer.sent if m.to == to][-1]
    return re.search(r"\b(\d{6})\b", mail.subject).group(1)


INSTITUTE = {"kind": "institute", "email": "new@school.example", "name": "Nita Rao", "institute_name": "Nita Coaching", "slug": "nita-coaching", "primary_color": "#16a34a"}
LEARNER = {"kind": "student", "email": "kid@example.com", "name": "Kabir Shah"}


@pytest.fixture(autouse=True)
def platform(repo):
    tenants.ensure_platform_admin(repo, "boss@example.com")


def ask(client, form):
    return client.post("/api/public/signup/code", json=form)


def finish(client, mailer, form):
    ask(client, form)
    return client.post("/api/public/signup", json={**form, "code": code_from(mailer, form["email"])})


def test_an_institute_signs_up_with_a_code_and_is_signed_in_as_its_admin(client, mailer, repo):
    assert ask(client, INSTITUTE).status_code == 202
    response = finish(client, mailer, INSTITUTE)
    assert response.status_code == 201
    body = response.json()
    assert body["tenant"] == "nita-coaching" and body["member"]["role"] == "tenant_admin"
    tenant = repo.get_tenant("nita-coaching")
    assert tenant["plan"] == "free" and tenant["branding"]["display_name"] == "Nita Coaching" and tenant["admin_email"] == INSTITUTE["email"]
    me = client.get("/api/auth/me", headers={"X-Tenant": "nita-coaching", "Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert any("New institute" in m.subject and m.to == "boss@example.com" for m in mailer.sent)


def test_a_wrong_code_or_a_reused_code_makes_nothing(client, mailer, repo):
    ask(client, INSTITUTE)
    assert client.post("/api/public/signup", json={**INSTITUTE, "code": "000000"}).status_code == 400
    assert repo.get_tenant("nita-coaching") is None
    code = code_from(mailer, INSTITUTE["email"])
    assert client.post("/api/public/signup", json={**INSTITUTE, "code": code}).status_code == 201
    other = {**INSTITUTE, "slug": "other-one"}
    assert client.post("/api/public/signup", json={**other, "code": code}).status_code == 400


def test_a_code_for_one_kind_of_signup_does_not_work_for_another(client, mailer):
    ask(client, LEARNER)
    code = code_from(mailer, LEARNER["email"])
    assert client.post("/api/public/signup", json={**LEARNER, "kind": "parent", "code": code}).status_code == 400


@pytest.mark.parametrize("slug,reason", [("ab", "3 to 30"), ("pricing", "reserved"), ("free", "reserved"), ("platform", "reserved")])
def test_a_bad_or_reserved_short_name_is_refused_before_any_email(client, mailer, slug, reason):
    response = ask(client, {**INSTITUTE, "slug": slug})
    assert response.status_code == 422 and reason in response.json()["detail"]
    assert mailer.sent == []


def test_a_taken_short_name_is_refused(client, make_tenant):
    make_tenant("nita-coaching")
    assert ask(client, INSTITUTE).status_code == 422


def test_one_email_can_start_only_three_institutes(client, repo):
    for n in range(3):
        tenants.create_tenant(repo, f"inst-{n}", f"Inst {n}", INSTITUTE["email"], "Nita Rao")
    response = ask(client, {**INSTITUTE, "slug": "inst-9"})
    assert response.status_code == 422 and "up to 3" in response.json()["detail"]


def test_a_free_student_and_parent_sign_up_into_the_shared_free_tenant(client, mailer, repo):
    kid = finish(client, mailer, LEARNER).json()
    parent = finish(client, mailer, {"kind": "parent", "email": "mum@example.com", "name": "Mira Shah"}).json()
    assert kid["tenant"] == parent["tenant"] == "free"
    assert kid["member"]["role"] == "student" and parent["member"]["role"] == "parent"
    free = repo.get_tenant("free")
    assert free["branding"]["display_name"] == "PragyaPrep" and free["plan"] == "free"
    assert repo.scoped("free").get_member("kid@example.com")["status"] == "approved"


def test_signing_up_twice_with_the_same_email_says_to_log_in(client, mailer):
    finish(client, mailer, LEARNER)
    response = ask(client, LEARNER)
    assert response.status_code == 409 and "Log in" in response.json()["detail"]


def test_a_free_learner_can_log_in_again_with_a_code(client, mailer):
    finish(client, mailer, LEARNER)
    client.app.state.mailer.sent.clear()
    assert client.post("/api/auth/request-code", json={"email": LEARNER["email"]}, headers={"X-Tenant": "free"}).json()["status"] == "code_sent"


def test_too_many_codes_for_one_email_are_slowed_down(client, mailer):
    assert ask(client, LEARNER).status_code == 202
    assert ask(client, LEARNER).status_code == 429


# ---- the free plan itself ----

@pytest.fixture
def school(make_tenant, add_course, client, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    admin = sign_in("aaptprep", "ritesh@example.com")
    cat = add_course("aaptprep", "CAT")
    percent = topic(client, admin, cat["id"], "Percentages")
    sub(client, admin, cat["id"], percent["id"], "Concepts", note="Free note", status="published",
        materials=[{"type": "link", "url": "https://example.com/x", "title": "Read this"}])
    sub(client, admin, cat["id"], percent["id"], "Practice", note="Locked note", status="published")


@pytest.fixture
def learner(client, mailer, school):
    token = finish(client, mailer, LEARNER).json()["access_token"]
    return {"X-Tenant": "free", "Authorization": f"Bearer {token}"}


def test_a_free_learner_sees_the_courses_picks_one_and_opens_only_its_first_sub_topic(client, learner):
    state = client.get("/api/free/courses", headers=learner).json()
    assert state["picked"] is None and [c["name"] for c in state["courses"]] == ["CAT"]
    assert client.get("/api/free/sample", headers=learner).json() == {"sample": None}
    assert client.put("/api/free/pick", json={"course": "CAT"}, headers=learner).json()["picked"] == "CAT"
    sample = client.get("/api/free/sample", headers=learner).json()["sample"]
    assert sample["title"] == "Concepts" and sample["note"] == "Free note" and sample["links"] == [{"title": "Read this", "url": "https://example.com/x"}]
    assert "Locked note" not in str(sample) and "AaptPrep" not in str(sample)


def test_the_free_course_cannot_be_changed_or_invented(client, learner):
    assert client.put("/api/free/pick", json={"course": "Nope"}, headers=learner).status_code == 404
    client.put("/api/free/pick", json={"course": "CAT"}, headers=learner)
    assert client.put("/api/free/pick", json={"course": "CAT"}, headers=learner).status_code == 409


def test_the_free_plan_is_only_for_the_free_tenant_and_signed_in_learners(client, learner, school, sign_in):
    assert client.get("/api/free/courses", headers={"X-Tenant": "free"}).status_code == 401
    admin = sign_in("aaptprep", "ritesh@example.com")
    assert client.get("/api/free/courses", headers={**admin}).status_code in (403, 404)


# ---- a free institute's limits ----

def test_a_free_institute_can_have_one_student_and_one_parent(client, mailer, repo):
    token = finish(client, mailer, INSTITUTE).json()["access_token"]
    admin = {"X-Tenant": "nita-coaching", "Authorization": f"Bearer {token}"}
    scoped = repo.scoped("nita-coaching")
    for n in (1, 2):
        scoped.create_member({"email": f"s{n}@example.com", "role": "student", "status": "pending", "first_name": "S", "last_name": str(n), "created_at": "2027-01-01"})
    assert client.post("/api/admin/registrations/s1@example.com/approve", headers=admin).status_code == 200
    second = client.post("/api/admin/registrations/s2@example.com/approve", headers=admin)
    assert second.status_code == 403 and "1 student" in second.json()["detail"]
    parent = {"first_name": "Mira", "last_name": "S", "mobile": "9876543210", "email": "mira@example.com", "student_email": "s1@example.com"}
    assert client.post("/api/admin/parents", json=parent, headers=admin).status_code == 201
    other = client.post("/api/admin/parents", json={**parent, "email": "other@example.com"}, headers=admin)
    assert other.status_code == 403 and "1 parent" in other.json()["detail"]


def test_a_paid_institute_has_no_such_limit(client, make_tenant, sign_in, repo):
    make_tenant("big", "Big", "big@example.com")
    admin = sign_in("big", "big@example.com")
    scoped = repo.scoped("big")
    for n in (1, 2, 3):
        scoped.create_member({"email": f"s{n}@example.com", "role": "student", "status": "pending", "first_name": "S", "last_name": str(n), "created_at": "2027-01-01"})
        assert client.post(f"/api/admin/registrations/s{n}@example.com/approve", headers=admin).status_code == 200
