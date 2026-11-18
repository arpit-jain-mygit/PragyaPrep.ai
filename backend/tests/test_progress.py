"""Admin progress: per course, who is behind, where students get stuck, and one student's detail."""
import pytest

from conftest import headers
from test_coursework import QUANT, add_file, sub, topic, url as plan_url
from test_student_tests import URL as MY_TESTS, make_test, q, start, submit

PROGRESS = "/api/admin/progress"
MINE = "/api/my/coursework"
# The fake clock starts on 15 Jan 2027, India time.
PAST, SOON = "2027-01-10", "2027-01-20"


def person(repo, email, first, last="Rao", status="approved"):
    repo.scoped("aaptprep").create_member({"email": email, "role": "student", "status": status, "first_name": first, "last_name": last})


@pytest.fixture
def school(make_tenant, repo, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    for email, first in (("asha@example.com", "Asha"), ("ravi@example.com", "Ravi"), ("meera@example.com", "Meera"), ("zed@example.com", "Zed")):
        person(repo, email, first)
    return {"cat": add_course("aaptprep", "CAT"), "clat": add_course("aaptprep", "CLAT")}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


def give(client, admin, email, course):
    assert client.post(f"/api/admin/registrations/{email}/access", json={"course_id": course["id"]}, headers=admin).status_code == 201


@pytest.fixture
def plan(client, admin, school):
    """CAT coursework: Percentages has Concepts (due soon, published), Examples (due in the past, published), Practice (draft)."""
    cid = school["cat"]["id"]
    t = topic(client, admin, cid, "Percentages")
    sub(client, admin, cid, t["id"], "Concepts", note="Read", due=SOON, status="published")
    sub(client, admin, cid, t["id"], "Examples", note="Watch", due=PAST, status="published")
    sub(client, admin, cid, t["id"], "Practice", note="Later")
    return cid


@pytest.fixture
def students(client, admin, school, plan, sign_in):
    """Asha, Ravi and Meera have CAT. Zed has only CLAT."""
    for email in ("asha@example.com", "ravi@example.com", "meera@example.com"):
        give(client, admin, email, school["cat"])
    give(client, admin, "zed@example.com", school["clat"])
    return {name: sign_in("aaptprep", f"{name}@example.com") for name in ("asha", "ravi", "meera", "zed")}


def sub_id(client, admin, cid, title):
    plan = client.get(plan_url(cid), headers=admin).json()
    return next(s["id"] for sj in plan["subjects"] for t in sj["topics"] for s in t["subtopics"] if s["title"] == title)


def mark(client, token, cid, sid):
    assert client.put(f"{MINE}/{cid}/{sid}/done", headers=token).status_code == 200


def rows(client, admin, cid):
    return client.get(f"{PROGRESS}/{cid}", headers=admin)


def by_email(response):
    return {r["email"]: r for r in response.json()["students"]}


# ---- Who can see it ----

def test_only_the_admin_can_see_progress(client, school, plan, students, admin):
    cid = school["cat"]["id"]
    assert client.get(f"{PROGRESS}/{cid}", headers=headers("aaptprep")).status_code == 401
    assert client.get(f"{PROGRESS}/{cid}", headers=students["asha"]).status_code == 403
    assert client.get(f"{PROGRESS}/{cid}/stuck", headers=students["asha"]).status_code == 403
    assert client.get(f"{PROGRESS}/{cid}/students/asha@example.com", headers=students["asha"]).status_code == 403


def test_an_unknown_course_is_not_found(client, admin, students):
    for tail in ("", "/stuck", "/students/asha@example.com"):
        assert client.get(f"{PROGRESS}/nope{tail}", headers=admin).status_code == 404


# ---- The student table ----

def test_it_lists_only_students_with_access_to_the_course_with_counts(client, admin, school, students):
    response = rows(client, admin, school["cat"]["id"])
    assert response.status_code == 200
    assert response.json()["course"] == {"id": school["cat"]["id"], "name": "CAT"}
    assert sorted(by_email(response)) == ["asha@example.com", "meera@example.com", "ravi@example.com"]
    assert response.json()["summary"] == {"students": 3, "behind": 3, "not_started": 0, "on_track": 0, "subtopics": 2, "tests": 0}


def test_students_whose_access_ended_or_who_are_not_approved_are_left_out(client, admin, school, students, repo):
    scoped = repo.scoped("aaptprep")
    access = scoped.get_access("ravi@example.com", school["cat"]["id"])
    scoped.put_access("ravi@example.com", {k: v for k, v in access.items() if k not in ("PK", "SK")} | {"expires_at": "2020-01-01T00:00:00+05:30"})
    client.post("/api/admin/registrations/meera@example.com/suspend", headers=admin)
    assert sorted(by_email(rows(client, admin, school["cat"]["id"]))) == ["asha@example.com"]


def test_coursework_progress_counts_published_subtopics_and_overdue_ones(client, admin, school, students, plan):
    cid = school["cat"]["id"]
    mark(client, students["asha"], cid, sub_id(client, admin, cid, "Concepts"))
    asha = by_email(rows(client, admin, cid))["asha@example.com"]
    assert (asha["cw_done"], asha["cw_total"], asha["cw_overdue"]) == (1, 2, 1)  # Examples is past its date and not done
    assert asha["status"] == "behind" and asha["overdue"] == 1
    mark(client, students["asha"], cid, sub_id(client, admin, cid, "Examples"))
    asha = by_email(rows(client, admin, cid))["asha@example.com"]
    assert (asha["cw_done"], asha["cw_overdue"], asha["status"], asha["overdue"]) == (2, 0, "on_track", 0)


def test_not_started_means_nothing_done_and_no_test_and_nothing_overdue(client, admin, school, students, plan):
    cid = school["cat"]["id"]
    sid = sub_id(client, admin, cid, "Examples")
    client.patch(plan_url(cid, f"/{sid}"), json={"due": "2027-03-01"}, headers=admin)  # nothing is overdue now
    data = rows(client, admin, cid)
    assert {r["status"] for r in data.json()["students"]} == {"not_started"}
    assert data.json()["summary"]["not_started"] == 3
    mark(client, students["ravi"], cid, sid)
    assert by_email(rows(client, admin, cid))["ravi@example.com"]["status"] == "on_track"


def test_the_last_active_time_is_the_latest_completion(client, admin, school, students, plan, fake_clock):
    cid = school["cat"]["id"]
    assert by_email(rows(client, admin, cid))["asha@example.com"]["last_active"] is None
    mark(client, students["asha"], cid, sub_id(client, admin, cid, "Concepts"))
    first = by_email(rows(client, admin, cid))["asha@example.com"]["last_active"]
    fake_clock.advance(7200)
    mark(client, students["asha"], cid, sub_id(client, admin, cid, "Examples"))
    assert by_email(rows(client, admin, cid))["asha@example.com"]["last_active"] > first


def test_those_needing_attention_come_first_then_by_name(client, admin, school, students, plan):
    cid = school["cat"]["id"]
    for title in ("Concepts", "Examples"):
        mark(client, students["meera"], cid, sub_id(client, admin, cid, title))
    mark(client, students["ravi"], cid, sub_id(client, admin, cid, "Concepts"))
    order = [r["email"] for r in rows(client, admin, cid).json()["students"]]
    assert order == ["asha@example.com", "ravi@example.com", "meera@example.com"]  # both behind first (name order), then on track


def test_the_same_student_in_two_courses_has_separate_progress(client, admin, school, students, plan):
    give(client, admin, "asha@example.com", school["clat"])
    mark(client, students["asha"], school["cat"]["id"], sub_id(client, admin, school["cat"]["id"], "Concepts"))
    clat = by_email(rows(client, admin, school["clat"]["id"]))
    assert sorted(clat) == ["asha@example.com", "zed@example.com"] and clat["asha@example.com"]["cw_done"] == 0 and clat["asha@example.com"]["cw_total"] == 0


# ---- Tests in the table ----

@pytest.fixture
def two_tests(client, admin, school, students):
    ids = [q(client, admin, f"Question {i}")["id"] for i in range(3)]
    open_test = make_test(client, admin, school, ids, title="Open one", start_at="2027-01-10 09:00", end_at="2027-01-31 23:59")
    closed = make_test(client, admin, school, ids, title="Closed one", start_at="2027-01-01 09:00", end_at="2027-01-14 18:00")
    upcoming = make_test(client, admin, school, ids, title="Upcoming one", start_at="2027-02-10 09:00", end_at="2027-02-28 18:00")
    draft = make_test(client, admin, school, ids, title="Draft one", status="draft")
    return {"open": open_test, "closed": closed, "upcoming": upcoming, "draft": draft}


def test_tests_available_leave_out_upcoming_and_draft_tests(client, admin, school, students, two_tests):
    data = rows(client, admin, school["cat"]["id"]).json()
    assert data["summary"]["tests"] == 3  # published tests for the course: open, closed, upcoming
    assert {r["tests_available"] for r in data["students"]} == {2}  # open and closed only


def test_a_closed_test_never_attempted_is_overdue_and_an_attempt_clears_it(client, admin, school, students, two_tests, plan):
    cid = school["cat"]["id"]
    for title in ("Concepts", "Examples"):
        mark(client, students["asha"], cid, sub_id(client, admin, cid, title))
    asha = by_email(rows(client, admin, cid))["asha@example.com"]
    assert (asha["tests_overdue"], asha["cw_overdue"], asha["overdue"], asha["status"]) == (1, 0, 1, "behind")
    assert start(client, students["asha"], two_tests["open"]["id"]).status_code == 201  # an attempt at the open test does not clear the closed one


def test_tests_taken_and_the_average_use_each_tests_best_score(client, admin, school, students, two_tests, plan):
    cid = school["cat"]["id"]
    token = students["asha"]
    number = start(client, token, two_tests["open"]["id"]).json()["number"]
    assert submit(client, token, two_tests["open"]["id"], number).status_code == 200  # nothing answered: 0%
    second = start(client, token, two_tests["open"]["id"]).json()["number"]
    questions = client.get(f"{MY_TESTS}/{two_tests['open']['id']}/attempts/{second}", headers=token).json()["questions"]
    client.put(f"{MY_TESTS}/{two_tests['open']['id']}/attempts/{second}/answers", json={"answers": {x["id"]: 1 for x in questions}}, headers=token)
    submit(client, token, two_tests["open"]["id"], second)
    asha = by_email(rows(client, admin, cid))["asha@example.com"]
    assert asha["tests_taken"] == 1 and asha["avg_percent"] == 100.0  # best of the two attempts, not the mean
    assert asha["last_active"] is not None


def test_a_started_but_unsubmitted_attempt_is_not_counted_as_taken(client, admin, school, students, two_tests):
    start(client, students["ravi"], two_tests["open"]["id"])
    ravi = by_email(rows(client, admin, school["cat"]["id"]))["ravi@example.com"]
    assert ravi["tests_taken"] == 0 and ravi["avg_percent"] is None


def test_tests_of_another_course_do_not_count(client, admin, school, students, two_tests):
    ids = [q(client, admin, "Another")["id"]]
    make_test(client, admin, school, ids, title="CLAT only", courses=[school["clat"]["id"]], start_at="2027-01-01 09:00", end_at="2027-01-14 18:00")
    assert rows(client, admin, school["cat"]["id"]).json()["summary"]["tests"] == 3
    zed = by_email(rows(client, admin, school["clat"]["id"]))["zed@example.com"]
    assert zed["tests_overdue"] == 1 and zed["status"] == "behind"


# ---- Where students get stuck ----

def test_stuck_lists_each_published_subtopic_with_how_many_finished_least_first(client, admin, school, students, plan):
    cid = school["cat"]["id"]
    concepts, examples = sub_id(client, admin, cid, "Concepts"), sub_id(client, admin, cid, "Examples")
    mark(client, students["asha"], cid, concepts)
    mark(client, students["ravi"], cid, concepts)
    mark(client, students["asha"], cid, examples)
    data = client.get(f"{PROGRESS}/{cid}/stuck", headers=admin).json()
    assert data["students"] == 3
    assert [(s["title"], s["done"], s["students"], s["percent"]) for s in data["subtopics"]] == [("Examples", 1, 3, 33), ("Concepts", 2, 3, 67)]
    assert data["subtopics"][0]["subject"] == "Quantitative Ability" and data["subtopics"][0]["topic"] == "Percentages" and data["subtopics"][0]["due"] == PAST


def test_stuck_ignores_drafts_and_students_without_access(client, admin, school, students, plan):
    cid = school["cat"]["id"]
    titles = [s["title"] for s in client.get(f"{PROGRESS}/{cid}/stuck", headers=admin).json()["subtopics"]]
    assert "Practice" not in titles
    give(client, admin, "zed@example.com", school["cat"])
    assert client.get(f"{PROGRESS}/{cid}/stuck", headers=admin).json()["students"] == 4


def test_stuck_with_no_students_has_zero_percent_and_no_error(client, admin, school, plan):
    data = client.get(f"{PROGRESS}/{school['cat']['id']}/stuck", headers=admin).json()
    assert data["students"] == 0 and {s["percent"] for s in data["subtopics"]} == {0}


# ---- One student ----

def test_a_student_page_has_the_status_coursework_overdue_items_and_tests(client, admin, school, students, plan, two_tests):
    cid = school["cat"]["id"]
    mark(client, students["asha"], cid, sub_id(client, admin, cid, "Concepts"))
    response = client.get(f"{PROGRESS}/{cid}/students/asha@example.com", headers=admin)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["student"] == {"email": "asha@example.com", "name": "Asha Rao", "avatar_url": ""} and data["course"]["name"] == "CAT"
    assert data["row"]["status"] == "behind" and data["row"]["cw_done"] == 1 and "done_ids" not in data["row"]
    assert [(i["title"], i["due"], i["days_late"]) for i in data["overdue_items"]] == [("Examples", PAST, 5)]
    topics = data["coursework"]["subjects"][0]["topics"]
    assert topics[0]["progress"] == {"total": 2, "done": 1} and [s["done"] for s in topics[0]["subtopics"]] == [True, False]
    assert [(t["title"], t["state"], t["overdue"], t["attempts_used"]) for t in data["tests"]] == [
        ("Closed one", "ended", True, 0), ("Open one", "open", False, 0), ("Upcoming one", "upcoming", False, 0)]


def test_a_student_page_shows_best_score_and_attempts(client, admin, school, students, plan, two_tests):
    token = students["ravi"]
    number = start(client, token, two_tests["open"]["id"]).json()["number"]
    submit(client, token, two_tests["open"]["id"], number)
    data = client.get(f"{PROGRESS}/{school['cat']['id']}/students/ravi@example.com", headers=admin).json()
    open_test = next(t for t in data["tests"] if t["title"] == "Open one")
    assert open_test["attempts_used"] == 1 and open_test["best"]["percentage"] is not None


@pytest.mark.parametrize("email", ["zed@example.com", "nobody@example.com", "ritesh@example.com"])
def test_a_student_outside_the_course_or_not_a_student_is_not_found(client, admin, school, students, email):
    assert client.get(f"{PROGRESS}/{school['cat']['id']}/students/{email}", headers=admin).status_code == 404


def test_the_email_in_the_address_is_matched_without_case(client, admin, school, students):
    assert client.get(f"{PROGRESS}/{school['cat']['id']}/students/ASHA@Example.com", headers=admin).status_code == 200


def test_many_students_are_all_listed(client, admin, school, plan, repo):
    scoped = repo.scoped("aaptprep")
    from app import content

    for i in range(210):  # more than one page of members
        email = f"s{i:03d}@example.com"
        person(repo, email, f"S{i:03d}", "X")
        content.grant_access(scoped, email, school["cat"]["id"], "ritesh@example.com")
    assert rows(client, admin, school["cat"]["id"]).json()["summary"]["students"] == 210
