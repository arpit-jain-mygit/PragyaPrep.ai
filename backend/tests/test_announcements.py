"""Announcements and reminders: the admin sends, each student gets their own notice (and perhaps an email), and reads them."""
import pytest

from conftest import headers
from test_coursework import sub, topic, url as plan_url
from test_progress import admin, give, mark, person, plan, school, students, sub_id  # noqa: F401

SEND = "/api/admin/announcements"
REMIND = "/api/admin/reminders"
MINE = "/api/my/notices"
ASHA, RAVI, MEERA, ZED = "asha@example.com", "ravi@example.com", "meera@example.com", "zed@example.com"


def outbox(mailer):
    """The emails the announcements sent, leaving out the login codes sent when the test signed people in."""
    return [m for m in mailer.sent if "login code" not in m.subject]


def announce(client, admin, **overrides):
    body = {"title": "Class moved", "message": "Friday's class is at 6 pm.", "kind": "info", "audience": {"type": "all"}, **overrides}
    return client.post(SEND, json=body, headers=admin)


def notices(client, token):
    return client.get(MINE, headers=token).json()


# ---- Who can use it ----

def test_only_the_admin_sends_and_only_students_read(client, school, admin, students):
    assert client.post(SEND, json={}, headers=headers("aaptprep")).status_code == 401
    assert client.post(SEND, json={}, headers=students["asha"]).status_code == 403
    assert client.get(SEND, headers=students["asha"]).status_code == 403
    assert client.post(REMIND, json={}, headers=students["asha"]).status_code == 403
    assert client.get(MINE, headers=headers("aaptprep")).status_code == 401
    assert client.get(MINE, headers=admin).status_code == 403
    assert client.put(f"{MINE}/read-all", headers=admin).status_code == 403


# ---- Checking the form ----

@pytest.mark.parametrize("overrides, message", [
    ({"title": ""}, "title must be 1 to 120"),
    ({"title": "x" * 121}, "title must be 1 to 120"),
    ({"title": None}, "title must be 1 to 120"),
    ({"message": ""}, "message must be 1 to 2000"),
    ({"message": "x" * 2001}, "message must be 1 to 2000"),
    ({"kind": "urgent"}, "information or action needed"),
    ({"kind": "info", "link": "coursework"}, "goes with an action-needed"),
    ({"kind": "action", "link": "https://evil.example"}, "from the list"),
    ({"audience": None}, "Choose who to send to"),
    ({"audience": {"type": "nobody"}}, "Choose who to send to"),
    ({"audience": {"type": "course"}}, "Choose the course"),
    ({"audience": {"type": "course", "course_id": "nope"}}, "Choose the course"),
    ({"audience": {"type": "students"}}, "email addresses"),
    ({"audience": {"type": "students", "emails": []}}, "at least one"),
    ({"audience": {"type": "students", "emails": ["ghost@example.com"]}}, "aren't approved students: ghost@example.com"),
    ({"audience": {"type": "students", "emails": [f"s{i}@example.com" for i in range(501)]}}, "up to 500"),
])
def test_a_bad_announcement_is_refused_and_nothing_is_sent(client, school, admin, students, mailer, overrides, message):
    response = announce(client, admin, send_email=True, **overrides)
    assert response.status_code == 422 and message in response.json()["detail"]
    assert notices(client, students["asha"])["notices"] == [] and outbox(mailer) == []
    assert client.get(SEND, headers=admin).json() == []


def test_pending_rejected_and_suspended_people_are_not_approved_students(client, school, admin, repo):
    person(repo, "wait@example.com", "Wait", status="pending")
    response = announce(client, admin, audience={"type": "students", "emails": ["wait@example.com"]})
    assert response.status_code == 422 and "wait@example.com" in response.json()["detail"]


def test_an_institute_with_no_students_has_no_one_to_send_to(client, make_tenant, sign_in):
    make_tenant("empty", "Empty", "boss@example.com")
    admin_ = sign_in("empty", "boss@example.com")
    response = client.post(SEND, json={"title": "Hi", "message": "x", "audience": {"type": "all"}}, headers=admin_)
    assert response.status_code == 422 and "no students" in response.json()["detail"]


# ---- Sending ----

def test_everyone_gets_their_own_notice_and_the_admin_sees_the_history(client, school, admin, students):
    response = announce(client, admin)
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["recipients"] == 4 and record["audience"] == {"type": "all"} and record["kind"] == "info" and record["source"] == "manual"
    for name in ("asha", "ravi", "meera", "zed"):
        mine = notices(client, students[name])
        assert [(n["title"], n["message"], n["kind"], n["link"], n["read_at"]) for n in mine["notices"]] == [("Class moved", "Friday's class is at 6 pm.", "info", None, None)]
        assert mine["unread"] == 1 and mine["action_unread"] == 0
    history = client.get(SEND, headers=admin).json()
    assert [h["id"] for h in history] == [record["id"]] and history[0]["recipients"] == 4 and history[0]["created_by"] == "ritesh@example.com"


def test_a_course_audience_reaches_only_students_with_current_access(client, school, admin, students, repo):
    scoped = repo.scoped("aaptprep")
    access = scoped.get_access(MEERA, school["cat"]["id"])
    scoped.put_access(MEERA, {k: v for k, v in access.items() if k not in ("PK", "SK")} | {"expires_at": "2020-01-01T00:00:00+05:30"})
    record = announce(client, admin, audience={"type": "course", "course_id": school["cat"]["id"]}).json()
    assert record["recipients"] == 2 and record["audience"] == {"type": "course", "course_id": school["cat"]["id"], "course_name": "CAT"}
    assert [len(notices(client, students[n])["notices"]) for n in ("asha", "ravi", "meera", "zed")] == [1, 1, 0, 0]


def test_chosen_students_get_it_and_others_do_not(client, school, admin, students):
    record = announce(client, admin, audience={"type": "students", "emails": [" ASHA@example.com ", RAVI, RAVI]}).json()
    assert record["recipients"] == 2 and record["audience"] == {"type": "students", "count": 2}
    assert [len(notices(client, students[n])["notices"]) for n in ("asha", "ravi", "meera", "zed")] == [1, 1, 0, 0]


def test_an_action_notice_has_a_button_to_a_place_in_the_app(client, school, admin, students):
    announce(client, admin, kind="action", link="tests", title="Take the mock", message="It closes Friday.")
    mine = notices(client, students["asha"])
    assert mine["notices"][0]["link"] == {"to": "tests", "label": "Open tests"} and mine["action_unread"] == 1


# ---- Email ----

def test_no_email_goes_unless_asked(client, school, admin, students, mailer):
    record = announce(client, admin).json()
    assert outbox(mailer) == [] and record["emailed"] == 0 and record["email_requested"] is False


def test_the_email_has_the_message_the_button_and_a_link_to_all_notices(client, school, admin, students, mailer):
    record = announce(client, admin, kind="action", link="coursework", send_email=True, audience={"type": "students", "emails": [ASHA]}).json()
    assert record["emailed"] == 1 and record["email_failed"] == 0 and record["email_requested"] is True
    [mail] = outbox(mailer)
    assert mail.to == ASHA and mail.subject == "Action needed: Class moved" and mail.from_name == "AaptPrep"
    assert "Hello Asha," in mail.body and "Friday's class is at 6 pm." in mail.body
    assert "Open coursework: http://localhost:4200/aaptprep/learning" in mail.body and "All your notices: http://localhost:4200/aaptprep/notices" in mail.body
    assert notices(client, students["asha"])["notices"][0]["title"] == "Class moved"


def test_an_info_email_has_no_action_prefix_or_button(client, school, admin, students, mailer):
    announce(client, admin, send_email=True, audience={"type": "students", "emails": [ASHA]})
    [mail] = outbox(mailer)
    assert mail.subject == "Class moved" and "Open " not in mail.body


def test_a_failed_email_is_counted_and_never_undoes_the_notice(client, school, admin, students, mailer, monkeypatch):
    real = mailer.send

    def flaky(email):
        if email.to == RAVI:
            raise RuntimeError("SES says no")
        real(email)

    monkeypatch.setattr(mailer, "send", flaky)
    record = announce(client, admin, send_email=True, audience={"type": "students", "emails": [ASHA, RAVI]}).json()
    assert (record["recipients"], record["emailed"], record["email_failed"]) == (2, 1, 1)
    assert len(notices(client, students["ravi"])["notices"]) == 1 and [m.to for m in outbox(mailer)] == [ASHA]


# ---- Reminders ----

def remind(client, admin, school, **overrides):
    return client.post(REMIND, json={"course_id": school["cat"]["id"], **overrides}, headers=admin)


def test_each_student_who_is_behind_gets_a_reminder_with_their_own_numbers(client, school, admin, students, plan, mailer):
    mark(client, students["meera"], plan, sub_id(client, admin, plan, "Examples"))  # Meera has nothing overdue
    response = remind(client, admin, school)
    assert response.status_code == 200, response.text
    assert response.json() == {"reminded": 2, "skipped": 0, "not_behind": 0, "emailed": 2, "email_failed": 0}
    asha = notices(client, students["asha"])["notices"][0]
    assert asha["title"] == "Action needed in CAT" and asha["kind"] == "action" and asha["source"] == "reminder"
    assert asha["message"] == "You have 1 overdue sub-topic in CAT. Please catch up when you can." and asha["link"] == {"to": "coursework", "label": "Open coursework"}
    assert notices(client, students["meera"])["notices"] == [] and notices(client, students["zed"])["notices"] == []
    assert sorted(m.to for m in outbox(mailer)) == [ASHA, RAVI] and all(m.subject == "Action needed: Action needed in CAT" for m in outbox(mailer))


def test_a_reminder_counts_missed_tests_and_points_to_tests_when_no_coursework_is_late(client, admin, school, students, plan):
    from test_student_tests import make_test, q

    sid = sub_id(client, admin, plan, "Examples")
    client.patch(plan_url(plan, f"/{sid}"), json={"due": "2027-03-01"}, headers=admin)  # no coursework is late now
    ids = [q(client, admin, f"Q{i}")["id"] for i in range(2)]
    make_test(client, admin, school, ids, title="Closed A", start_at="2027-01-01 09:00", end_at="2027-01-14 18:00")
    make_test(client, admin, school, ids, title="Closed B", start_at="2027-01-01 09:00", end_at="2027-01-14 18:00")
    remind(client, admin, school)
    asha = notices(client, students["asha"])["notices"][0]
    assert asha["message"] == "You have 2 missed tests in CAT. Please catch up when you can." and asha["link"]["to"] == "tests"


def test_the_message_names_both_kinds_of_overdue_work(client, admin, school, students, plan):
    from test_student_tests import make_test, q

    ids = [q(client, admin, "Q")["id"]]
    make_test(client, admin, school, ids, title="Closed", start_at="2027-01-01 09:00", end_at="2027-01-14 18:00")
    remind(client, admin, school)
    assert notices(client, students["asha"])["notices"][0]["message"] == "You have 1 overdue sub-topic and 1 missed test in CAT. Please catch up when you can."


def test_nobody_is_nagged_twice_but_a_read_one_or_a_day_later_is_fine(client, school, admin, students, plan, fake_clock):
    assert remind(client, admin, school).json()["reminded"] == 3
    again = remind(client, admin, school).json()
    assert (again["reminded"], again["skipped"]) == (0, 3)
    mine = notices(client, students["asha"])["notices"][0]
    client.put(f"{MINE}/{mine['id']}/read", headers=students["asha"])
    assert remind(client, admin, school).json() == {"reminded": 1, "skipped": 2, "not_behind": 0, "emailed": 1, "email_failed": 0}
    fake_clock.advance(25 * 3600)
    assert remind(client, admin, school).json()["reminded"] == 3


def test_reminders_can_be_limited_to_named_students_and_say_who_was_not_behind(client, school, admin, students, plan):
    mark(client, students["meera"], plan, sub_id(client, admin, plan, "Examples"))
    result = remind(client, admin, school, emails=[ASHA, MEERA, "ghost@example.com"]).json()
    assert result["reminded"] == 1 and result["not_behind"] == 2
    assert len(notices(client, students["asha"])["notices"]) == 1 and notices(client, students["ravi"])["notices"] == []


def test_email_can_be_turned_off_for_reminders(client, school, admin, students, plan, mailer):
    result = remind(client, admin, school, send_email=False).json()
    assert result["reminded"] == 3 and result["emailed"] == 0 and outbox(mailer) == []


def test_reminders_appear_in_the_admin_history_but_nothing_is_recorded_when_nobody_is_reminded(client, school, admin, students, plan):
    assert remind(client, admin, school, emails=[ZED]).json()["reminded"] == 0
    assert client.get(SEND, headers=admin).json() == []
    remind(client, admin, school)
    [entry] = client.get(SEND, headers=admin).json()
    assert entry["source"] == "reminder" and entry["recipients"] == 3 and entry["title"] == "Reminder: behind in CAT"


def test_a_bad_reminder_request_is_refused(client, school, admin, students, plan):
    assert client.post(REMIND, json={"course_id": "nope"}, headers=admin).status_code == 404
    assert client.post(REMIND, json={}, headers=admin).status_code == 404
    assert remind(client, admin, school, emails="asha").status_code == 422
    assert remind(client, admin, school, emails=[]).status_code == 422


# ---- What a student sees ----

def test_the_order_is_unread_action_then_other_unread_then_read_newest_first(client, school, admin, students, fake_clock):
    for title, kind in (("Info 1", "info"), ("Action 1", "action"), ("Info 2", "info"), ("Action 2", "action")):
        announce(client, admin, title=title, kind=kind, audience={"type": "students", "emails": [ASHA]})
        fake_clock.advance(10)
    mine = notices(client, students["asha"])
    assert [n["title"] for n in mine["notices"]] == ["Action 2", "Action 1", "Info 2", "Info 1"] and (mine["unread"], mine["action_unread"]) == (4, 2)
    client.put(f"{MINE}/{mine['notices'][0]['id']}/read", headers=students["asha"])
    mine = notices(client, students["asha"])
    assert [n["title"] for n in mine["notices"]] == ["Action 1", "Info 2", "Info 1", "Action 2"] and (mine["unread"], mine["action_unread"]) == (3, 1)


def test_an_empty_list_has_zero_counts(client, school, admin, students):
    assert notices(client, students["asha"]) == {"unread": 0, "action_unread": 0, "notices": []}


def test_marking_read_keeps_the_first_time_and_marking_all_clears_everything(client, school, admin, students, fake_clock):
    announce(client, admin, title="A", audience={"type": "students", "emails": [ASHA]})
    announce(client, admin, title="B", audience={"type": "students", "emails": [ASHA]})
    first = notices(client, students["asha"])["notices"][0]
    stamp = client.put(f"{MINE}/{first['id']}/read", headers=students["asha"]).json()["notices"][-1]["read_at"]
    fake_clock.advance(3600)
    again = client.put(f"{MINE}/{first['id']}/read", headers=students["asha"]).json()
    assert [n["read_at"] for n in again["notices"] if n["id"] == first["id"]] == [stamp] and again["unread"] == 1
    done = client.put(f"{MINE}/read-all", headers=students["asha"]).json()
    assert done["unread"] == 0 and all(n["read_at"] for n in done["notices"])


def test_a_student_cannot_read_or_mark_another_students_notice(client, school, admin, students):
    announce(client, admin, audience={"type": "students", "emails": [ASHA]})
    theirs = notices(client, students["asha"])["notices"][0]["id"]
    assert client.put(f"{MINE}/{theirs}/read", headers=students["ravi"]).status_code == 404
    assert client.put(f"{MINE}/nope/read", headers=students["ravi"]).status_code == 404
    assert notices(client, students["asha"])["unread"] == 1 and notices(client, students["ravi"])["notices"] == []


def test_a_student_never_sees_the_audience_or_other_internal_fields(client, school, admin, students):
    announce(client, admin)
    shown = notices(client, students["asha"])["notices"][0]
    assert set(shown) == {"id", "title", "message", "kind", "link", "source", "created_at", "read_at"}


def test_notices_move_with_the_student_when_their_email_is_changed(client, school, admin, students, repo):
    announce(client, admin, audience={"type": "students", "emails": [ASHA]})
    scoped = repo.scoped("aaptprep")
    member = scoped.get_member(ASHA)
    scoped.move_member(ASHA, {k: v for k, v in member.items() if k not in ("PK", "SK", "GSI1PK", "GSI1SK")} | {"email": "asha.new@example.com"})
    assert scoped.list_notices(ASHA) == [] and len(scoped.list_notices("asha.new@example.com")) == 1


def test_another_institutes_students_are_never_reached(client, school, admin, students, make_tenant, repo):
    make_tenant("other", "Other", "boss@example.com")
    person_ = {"email": "o@example.com", "role": "student", "status": "approved", "first_name": "O", "last_name": "P"}
    repo.scoped("other").create_member(person_)
    assert announce(client, admin).json()["recipients"] == 4
    assert repo.scoped("other").list_notices("o@example.com") == []
