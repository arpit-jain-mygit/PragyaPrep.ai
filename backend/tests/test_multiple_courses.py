"""A student can choose several courses at registration; the admin sees and edits them and can give access to all at once."""
import pytest

from conftest import headers, valid_form

REGISTER = "/api/register"
REGS = "/api/admin/registrations"


@pytest.fixture
def school(make_tenant, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    return {
        "cat": add_course("aaptprep", "CAT", access={"type": "days", "days": 30}),
        "clat": add_course("aaptprep", "CLAT"),
        "ipmat": add_course("aaptprep", "IPMAT"),
    }


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


def register(client, school, picks, **overrides):
    ids = [school[name]["id"] for name in picks]
    return client.post(REGISTER, json=valid_form(school["cat"]["id"], course_ids=ids, **overrides), headers=headers("aaptprep"))


def person(client, admin, email="new.student@example.com"):
    return [p for p in client.get(f"{REGS}?status=all", headers=admin).json() if p["email"] == email][0]


# ---- Registering ----

def test_a_student_can_choose_several_courses_and_all_are_saved_in_order(client, school, admin, repo):
    response = register(client, school, ["clat", "cat"])
    assert response.status_code == 201, response.text
    saved = repo.scoped("aaptprep").get_member("new.student@example.com")
    assert saved["course_ids"] == [school["clat"]["id"], school["cat"]["id"]] and saved["course_names"] == ["CLAT", "CAT"]
    assert saved["course_id"] == school["clat"]["id"] and saved["course_name"] == "CLAT"  # the first choice, kept as a single course
    listed = person(client, admin)
    assert listed["course_ids"] == [school["clat"]["id"], school["cat"]["id"]] and listed["course_names"] == ["CLAT", "CAT"]


def test_a_course_ticked_twice_is_kept_once(client, school, admin):
    register(client, school, ["cat", "cat", "clat"])
    assert person(client, admin)["course_names"] == ["CAT", "CLAT"]


@pytest.mark.parametrize("picks,phrase", [(["cat"], "for CAT."), (["cat", "clat"], "for CAT and CLAT."), (["cat", "clat", "ipmat"], "for CAT, CLAT and IPMAT.")])
def test_the_receipt_and_the_approval_email_name_every_course(client, school, admin, mailer, picks, phrase):
    register(client, school, picks)
    assert phrase in mailer.sent[-1].body
    client.post(f"{REGS}/new.student@example.com/approve", headers=admin)
    assert phrase.replace("for ", "access to ").replace(".", ".") in mailer.sent[-1].body


@pytest.mark.parametrize("bad", [[], None, "cat", [5], [None], ["not-a-course"], {"a": 1}, True])
def test_a_bad_choice_is_refused_next_to_the_courses(client, school, bad):
    form = valid_form(school["cat"]["id"], course_ids=bad)
    if bad is None:
        form.pop("course_id")
    response = client.post(REGISTER, json=form, headers=headers("aaptprep"))
    assert response.status_code == 422 and "course_ids" in response.json()["errors"]


def test_a_hidden_course_or_one_from_another_institute_cannot_be_chosen(client, school, make_tenant, add_course):
    hidden = add_course("aaptprep", "HIDDEN", active=False)
    make_tenant("otherinst")
    other = add_course("otherinst", "OTHER")
    for bad in (hidden["id"], other["id"]):
        response = client.post(REGISTER, json=valid_form(school["cat"]["id"], course_ids=[school["cat"]["id"], bad]), headers=headers("aaptprep"))
        assert response.json()["errors"]["course_ids"] == "Choose the courses from the list."


def test_an_older_caller_that_sends_one_course_still_works(client, school, admin):
    response = client.post(REGISTER, json=valid_form(school["clat"]["id"]), headers=headers("aaptprep"))
    assert response.status_code == 201
    listed = person(client, admin)
    assert listed["course_ids"] == [school["clat"]["id"]] and listed["course_names"] == ["CLAT"]


def test_a_registration_saved_before_this_change_shows_its_one_course_as_a_list(client, school, admin, repo):
    repo.scoped("aaptprep").create_member({"email": "old@example.com", "role": "student", "status": "pending", "first_name": "Old", "last_name": "Timer",
                                           "course_id": school["clat"]["id"], "course_name": "CLAT", "created_at": "2026-01-01T00:00:00+00:00"})
    listed = person(client, admin, "old@example.com")
    assert listed["course_ids"] == [school["clat"]["id"]] and listed["course_names"] == ["CLAT"]


def test_a_rejected_student_who_registers_again_gets_the_new_choice(client, school, admin):
    register(client, school, ["cat"])
    client.post(f"{REGS}/new.student@example.com/reject", json={}, headers=admin)
    register(client, school, ["clat", "ipmat"])
    assert person(client, admin)["course_names"] == ["CLAT", "IPMAT"]


# ---- The admin edits a student's courses ----

def test_the_admin_can_add_and_remove_courses(client, school, admin):
    register(client, school, ["cat"])
    edited = client.patch(f"{REGS}/new.student@example.com", json={"course_ids": [school["ipmat"]["id"], school["cat"]["id"]]}, headers=admin)
    assert edited.status_code == 200, edited.text
    body = edited.json()["registration"]
    assert body["course_names"] == ["IPMAT", "CAT"] and body["course_id"] == school["ipmat"]["id"] and body["course_name"] == "IPMAT"
    again = client.patch(f"{REGS}/new.student@example.com", json={"course_ids": [school["clat"]["id"]]}, headers=admin).json()["registration"]
    assert again["course_names"] == ["CLAT"] and again["edited_by"] == "ritesh@example.com"


def test_other_edits_keep_the_courses_and_an_unchanged_choice_changes_nothing(client, school, admin):
    register(client, school, ["cat", "clat"])
    client.patch(f"{REGS}/new.student@example.com", json={"city": "Noida"}, headers=admin)
    assert person(client, admin)["course_names"] == ["CAT", "CLAT"] and person(client, admin)["city"] == "Noida"
    same = client.patch(f"{REGS}/new.student@example.com", json={"course_ids": [school["cat"]["id"], school["clat"]["id"]]}, headers=admin)
    assert same.json()["registration"].get("edited_at") != "" and person(client, admin)["course_names"] == ["CAT", "CLAT"]


def test_bad_courses_in_an_edit_are_refused_with_the_other_mistakes(client, school, admin):
    register(client, school, ["cat"])
    response = client.patch(f"{REGS}/new.student@example.com", json={"course_ids": [], "city": ""}, headers=admin)
    assert response.status_code == 422 and {"course_ids", "city"} <= set(response.json()["errors"])
    assert person(client, admin)["course_names"] == ["CAT"]


def test_a_course_the_student_already_has_may_stay_even_if_it_is_now_hidden(client, school, admin):
    register(client, school, ["cat", "clat"])
    client.patch(f"/api/admin/courses/{school['clat']['id']}", json={"active": False}, headers=admin)
    kept = client.patch(f"{REGS}/new.student@example.com", json={"course_ids": [school["cat"]["id"], school["clat"]["id"]], "city": "Noida"}, headers=admin)
    assert kept.status_code == 200 and kept.json()["registration"]["course_names"] == ["CAT", "CLAT"]
    added = client.patch(f"{REGS}/new.student@example.com", json={"course_ids": [school["clat"]["id"], school["ipmat"]["id"]]}, headers=admin)
    assert added.status_code == 200
    hidden_new = client.patch(f"{REGS}/new.student@example.com", json={"course_ids": [school["cat"]["id"]]}, headers=admin)
    assert hidden_new.status_code == 200
    back = client.patch(f"{REGS}/new.student@example.com", json={"course_ids": [school["clat"]["id"]]}, headers=admin)
    assert back.status_code == 422  # CLAT is hidden and no longer the student's, so it can't be added again


def test_an_edit_that_sends_one_course_the_old_way_still_works(client, school, admin):
    register(client, school, ["cat"])
    response = client.patch(f"{REGS}/new.student@example.com", json={"course_id": school["clat"]["id"]}, headers=admin)
    assert response.status_code == 200 and response.json()["registration"]["course_names"] == ["CLAT"]


# ---- Giving access to everything they chose ----

def test_one_click_gives_access_to_every_chosen_course_each_for_its_own_length(client, school, admin):
    register(client, school, ["cat", "clat"])
    client.post(f"{REGS}/new.student@example.com/approve", headers=admin)
    response = client.post(f"{REGS}/new.student@example.com/access/requested", headers=admin)
    assert response.status_code == 201, response.text
    granted = {a["course_name"]: a for a in response.json()["granted"]}
    assert set(granted) == {"CAT", "CLAT"} and response.json()["skipped"] == []
    assert granted["CAT"]["expires_at"] is not None and granted["CLAT"]["expires_at"] is None  # 30 days against no end
    assert all(a["active"] for a in granted.values())
    shown = {a["course_name"] for a in client.get(f"{REGS}/new.student@example.com/access", headers=admin).json()}
    assert shown == {"CAT", "CLAT"}


def test_the_student_then_sees_all_their_courses_and_giving_again_renews(client, school, admin, sign_in, fake_clock):
    register(client, school, ["cat", "clat"])
    client.post(f"{REGS}/new.student@example.com/approve", headers=admin)
    client.post(f"{REGS}/new.student@example.com/access/requested", headers=admin)
    student = sign_in("aaptprep", "new.student@example.com")
    assert sorted(c["name"] for c in client.get("/api/my/courses", headers=student).json()) == ["CAT", "CLAT"]
    first = [a for a in client.get(f"{REGS}/new.student@example.com/access", headers=admin).json() if a["course_name"] == "CAT"][0]["expires_at"]
    fake_clock.advance(86400)
    client.post(f"{REGS}/new.student@example.com/access/requested", headers=admin)
    renewed = [a for a in client.get(f"{REGS}/new.student@example.com/access", headers=admin).json() if a["course_name"] == "CAT"][0]["expires_at"]
    assert renewed > first


def test_a_chosen_course_that_no_longer_exists_is_skipped_and_named(client, school, admin, repo):
    register(client, school, ["cat"])
    client.post(f"{REGS}/new.student@example.com/approve", headers=admin)
    repo.scoped("aaptprep").update_member("new.student@example.com", course_ids=[school["cat"]["id"], "gone"], course_names=["CAT", "Vanished"])
    body = client.post(f"{REGS}/new.student@example.com/access/requested", headers=admin).json()
    assert [a["course_name"] for a in body["granted"]] == ["CAT"] and body["skipped"] == ["Vanished"]


def test_an_older_registration_with_one_course_is_given_that_course(client, school, admin, repo):
    repo.scoped("aaptprep").create_member({"email": "old@example.com", "role": "student", "status": "approved", "first_name": "Old", "last_name": "Timer",
                                           "course_id": school["clat"]["id"], "course_name": "CLAT", "created_at": "2026-01-01T00:00:00+00:00"})
    body = client.post(f"{REGS}/old@example.com/access/requested", headers=admin).json()
    assert [a["course_name"] for a in body["granted"]] == ["CLAT"]


def test_only_an_approved_student_can_be_given_access_and_unknown_students_are_404(client, school, admin):
    register(client, school, ["cat"])
    pending = client.post(f"{REGS}/new.student@example.com/access/requested", headers=admin)
    assert pending.status_code == 409 and "approved" in pending.json()["detail"]
    assert client.post(f"{REGS}/nobody@example.com/access/requested", headers=admin).status_code == 404


def test_only_an_admin_of_the_same_institute_can_do_it(client, school, admin, sign_in, make_tenant):
    register(client, school, ["cat"])
    client.post(f"{REGS}/new.student@example.com/approve", headers=admin)
    assert client.post(f"{REGS}/new.student@example.com/access/requested", headers=headers("aaptprep")).status_code == 401
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    assert client.post(f"{REGS}/new.student@example.com/access/requested", headers=other).status_code == 404
    assert client.get(f"{REGS}/new.student@example.com/access", headers=admin).json() == []
