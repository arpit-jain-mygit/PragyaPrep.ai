"""The admin's home: counts for the tiles, and how many students are behind."""
import pytest

from conftest import headers
from test_coursework import sub, topic, url as plan_url
from test_progress import give, mark, person, sub_id
from test_student_tests import make_test, q

HOME = "/api/admin/home"
BEHIND = "/api/admin/home/behind"
REFRESH = "/api/admin/home/behind/refresh"


@pytest.fixture
def school(make_tenant, repo, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    make_tenant("other", "Other", "boss@example.com")
    return {"cat": add_course("aaptprep", "CAT"), "clat": add_course("aaptprep", "CLAT"), "old": add_course("aaptprep", "OLD", active=False)}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


def test_only_the_admin_can_see_the_home_counts(client, school, admin, sign_in, repo):
    person(repo, "asha@example.com", "Asha")
    student = sign_in("aaptprep", "asha@example.com")
    for path in (HOME, BEHIND):
        assert client.get(path, headers=headers("aaptprep")).status_code == 401
        assert client.get(path, headers=student).status_code == 403
        assert client.get(path, headers=admin).status_code == 200


def test_an_empty_institute_has_zero_counts_and_its_courses(client, school, admin):
    assert client.get(HOME, headers=admin).json() == {"pending": 0, "students": 0, "courses": 2, "tests_open": 0, "questions": {"published": 0, "draft": 0}}
    assert _figures(client.post(REFRESH, headers=admin)) == {"students": 0, "courses": 0}


def test_pending_and_approved_students_are_counted_and_the_admin_and_others_are_not(client, school, admin, repo):
    person(repo, "a@example.com", "A")
    person(repo, "b@example.com", "B")
    person(repo, "c@example.com", "C", status="pending")
    person(repo, "d@example.com", "D", status="rejected")
    person(repo, "e@example.com", "E", status="suspended")
    data = client.get(HOME, headers=admin).json()
    assert data["pending"] == 1 and data["students"] == 2  # the admin is not a student; rejected and suspended are neither


def test_every_page_of_students_is_counted(client, school, admin, repo):
    for i in range(205):
        person(repo, f"s{i:03d}@example.com", f"S{i}")
    assert client.get(HOME, headers=admin).json()["students"] == 205


def test_only_open_courses_are_counted(client, school, admin):
    assert client.get(HOME, headers=admin).json()["courses"] == 2


def test_questions_are_split_into_published_and_drafts(client, school, admin):
    for i in range(3):
        q(client, admin, f"Published {i}")
    for i in range(2):
        q(client, admin, f"Draft {i}", status="draft")
    assert client.get(HOME, headers=admin).json()["questions"] == {"published": 3, "draft": 2}


def test_tests_open_now_counts_published_tests_inside_their_window(client, school, admin):
    ids = [q(client, admin, "One")["id"]]
    make_test(client, admin, school, ids, title="Open", start_at="2027-01-10 09:00", end_at="2027-01-31 23:59")
    make_test(client, admin, school, ids, title="Any time", start_at="", end_at="")
    make_test(client, admin, school, ids, title="Closed", start_at="2027-01-01 09:00", end_at="2027-01-14 18:00")
    make_test(client, admin, school, ids, title="Upcoming", start_at="2027-02-10 09:00", end_at="2027-02-28 18:00")
    make_test(client, admin, school, ids, title="Draft", status="draft")
    assert client.get(HOME, headers=admin).json()["tests_open"] == 2


def test_another_institutes_data_is_never_counted(client, school, admin, repo):
    repo.scoped("other").create_member({"email": "x@example.com", "role": "student", "status": "pending", "first_name": "X", "last_name": "Y"})
    repo.scoped("other").create_member({"email": "y@example.com", "role": "student", "status": "approved", "first_name": "Y", "last_name": "Z"})
    data = client.get(HOME, headers=admin).json()
    assert data["pending"] == 0 and data["students"] == 0


# ---- Behind ----

def _figures(response) -> dict:
    assert response.status_code == 200, response.text
    return {key: response.json()[key] for key in ("students", "courses")}


@pytest.fixture
def behind_setup(client, school, admin, repo, sign_in):
    """Asha (CAT and CLAT) and Ravi (CAT) have an overdue sub-topic in CAT; Meera is up to date; Zed has CLAT with nothing overdue."""
    for email, first in (("asha@example.com", "Asha"), ("ravi@example.com", "Ravi"), ("meera@example.com", "Meera"), ("zed@example.com", "Zed")):
        person(repo, email, first)
    for course, emails in ((school["cat"], ("asha", "ravi", "meera")), (school["clat"], ("asha", "zed"))):
        for e in emails:
            give(client, admin, f"{e}@example.com", course)
    for course, due in ((school["cat"], "2027-01-10"), (school["clat"], "2027-03-01")):
        t = topic(client, admin, course["id"], "Percentages")
        sub(client, admin, course["id"], t["id"], "Concepts", note="Read", due=due, status="published")
    mark(client, sign_in("aaptprep", "meera@example.com"), school["cat"]["id"], sub_id(client, admin, school["cat"]["id"], "Concepts"))


def test_behind_counts_each_student_once_across_courses(client, school, admin, behind_setup):
    assert _figures(client.post(REFRESH, headers=admin)) == {"students": 2, "courses": 1}  # Asha and Ravi, both in CAT only


def test_a_student_behind_in_two_courses_is_counted_once(client, school, admin, behind_setup):
    sid = sub_id(client, admin, school["clat"]["id"], "Concepts")
    client.patch(plan_url(school["clat"]["id"], f"/{sid}"), json={"due": "2027-01-05"}, headers=admin)
    assert _figures(client.post(REFRESH, headers=admin)) == {"students": 3, "courses": 2}  # Asha (both), Ravi, Zed


def test_hidden_courses_are_left_out_of_behind(client, school, admin, behind_setup):
    client.patch(f"/api/admin/courses/{school['cat']['id']}", json={"active": False}, headers=admin)
    assert _figures(client.post(REFRESH, headers=admin)) == {"students": 0, "courses": 0}


def test_the_saved_answer_is_instant_and_empty_until_it_was_worked_out_once(client, school, admin, behind_setup):
    first = client.get(BEHIND, headers=admin).json()
    assert first == {"students": None, "courses": None, "as_of": None, "fresh": False}
    worked = client.post(REFRESH, headers=admin).json()
    assert worked["students"] == 2 and worked["fresh"] is True and worked["as_of"]
    assert client.get(BEHIND, headers=admin).json() == worked


def test_a_saved_answer_goes_stale_after_fifteen_minutes_but_is_still_shown(client, school, admin, behind_setup, fake_clock):
    client.post(REFRESH, headers=admin)
    fake_clock.advance(14 * 60)
    assert client.get(BEHIND, headers=admin).json()["fresh"] is True
    fake_clock.advance(2 * 60)
    old = client.get(BEHIND, headers=admin).json()
    assert old["fresh"] is False and old["students"] == 2


def test_asking_to_refresh_again_within_a_minute_does_not_work_it_out_again(client, school, admin, behind_setup, fake_clock):
    client.post(REFRESH, headers=admin)
    client.patch(f"/api/admin/courses/{school['cat']['id']}", json={"active": False}, headers=admin)
    assert client.post(REFRESH, headers=admin).json()["students"] == 2  # still the saved answer
    fake_clock.advance(61)
    assert client.post(REFRESH, headers=admin).json()["students"] == 0  # worked out again


def test_each_students_records_are_read_once_however_many_courses_there_are(client, school, admin, behind_setup, monkeypatch):
    from app import repo as repo_module

    reads = {"done": 0, "attempts": 0}
    done, attempts = repo_module.TenantRepo.list_done, repo_module.TenantRepo.list_attempts

    def counting_done(self, *a, **k):
        reads["done"] += 1
        return done(self, *a, **k)

    def counting_attempts(self, *a, **k):
        reads["attempts"] += 1
        return attempts(self, *a, **k)

    monkeypatch.setattr(repo_module.TenantRepo, "list_done", counting_done)
    monkeypatch.setattr(repo_module.TenantRepo, "list_attempts", counting_attempts)
    client.post(REFRESH, headers=admin)
    students = 4  # Asha, Ravi, Meera and Zed, in two courses between them
    assert reads == {"done": students, "attempts": students}


def test_only_the_admin_can_see_or_refresh_it(client, school, admin, sign_in, add_member):
    add_member("aaptprep", "asha@example.com")
    student = sign_in("aaptprep", "asha@example.com")
    assert client.get(BEHIND, headers=student).status_code == 403
    assert client.post(REFRESH, headers=student).status_code == 403
    assert client.post(REFRESH, headers={"X-Tenant": "aaptprep"}).status_code == 401
