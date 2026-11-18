"""The demo student-data script: students per course, their access and test results, and removing them again."""
import time
from datetime import date

import pytest

from app import clock
from conftest import headers
from scripts.student_data import names, seed_students as seed
from test_student_tests import ADMIN_TESTS, admin, make_test, q, school  # noqa: F401

BATCH = "demo-students-test"


@pytest.fixture
def tests_for_courses(client, admin, school):
    """Two published tests for CAT (6 questions each, different ones) and one for CLAT, all open any time."""
    ids = [q(client, admin, f"Question {i}", difficulty=("easy", "medium", "hard")[i % 3])["id"] for i in range(12)]
    cat1 = make_test(client, admin, school, ids[:6], title="CAT test 1", start_at="", end_at="", max_attempts=3)
    cat2 = make_test(client, admin, school, ids[6:], title="CAT test 2", start_at="", end_at="", max_attempts=3)
    clat = make_test(client, admin, school, ids[3:9], title="CLAT test", start_at="", end_at="", max_attempts=3, courses=[school["clat"]["id"]])
    return [cat1, cat2, clat]


def run(repo, per_course=3, seed_value=7, batch=BATCH):
    return seed.create(repo, "aaptprep", per_course, seed_value, batch, log=lambda *_: None)


def members(repo):
    return [m for m in seed._tagged_members(repo, "aaptprep", BATCH)]


# ---- Making the students ----

def test_the_plan_writes_nothing(repo, school, tests_for_courses, capsys):
    students = seed.plan(repo, "aaptprep", 3, 7, BATCH)
    assert len(students) == 6 and members(repo) == []
    assert "Nothing has been written" in capsys.readouterr().out


def test_every_course_gets_the_asked_number_of_students_with_genuine_looking_details(school):
    courses = sorted([school["cat"], school["clat"]], key=lambda c: c["name"])
    students = seed.make_students(courses, 10, 2026, BATCH, "ritesh@example.com", time.time())
    assert len(students) == 20
    for name in ("CAT", "CLAT"):
        assert sum(1 for s in students if s["course_name"] == name) == 10
    emails = [s["email"] for s in students]
    assert len(set(emails)) == 20 and all(e.endswith("@example.com") for e in emails)
    assert len({(s["first_name"], s["last_name"]) for s in students}) == 20
    for s in students:
        pool = names.FEMALE if s["gender"] == "female" else names.MALE
        assert s["first_name"] in pool and s["last_name"] in names.SURNAMES
        assert s["email"].startswith(f"{s['first_name']}.{s['last_name']}".lower())
        assert len(s["mobile"]) == 10 and s["mobile"][0] == "9" and s["whatsapp"] == s["mobile"] and s["mobile"].isdigit()
        assert (s["city"], s["pin_code"]) in {(c, p) for _, c, p in names.PLACES} and len(s["pin_code"]) == 6
        age = (date.today() - date.fromisoformat(s["birth_date"])).days / 365.25
        assert 16 <= age <= 28
        assert s["status"] == "approved" and s["role"] == "student" and s["demo_seed"] == BATCH and s["decided_by"] == "ritesh@example.com"
        assert s["course_ids"][0] == s["course_id"] and s["course_names"][0] == s["course_name"]
        assert len(s["address"]) >= 5 and s["created_at"] < s["decided_at"]


def test_a_few_students_chose_two_courses_and_the_same_seed_gives_the_same_students(school):
    courses = sorted([school["cat"], school["clat"]], key=lambda c: c["name"])
    first = seed.make_students(courses, 5, 11, BATCH, "a@example.com", 1_800_000_000.0)
    again = seed.make_students(courses, 5, 11, BATCH, "a@example.com", 1_800_000_000.0)
    other = seed.make_students(courses, 5, 12, BATCH, "a@example.com", 1_800_000_000.0)
    assert first == again and [s["email"] for s in first] != [s["email"] for s in other]
    two = [s for s in first if len(s["course_ids"]) == 2]
    assert len(two) == seed.TWO_COURSE_STUDENTS and all(len(set(s["course_ids"])) == 2 for s in two)


# ---- Creating them, with results ----

def test_create_saves_students_gives_access_and_has_them_take_tests(client, repo, admin, school, tests_for_courses, fake_clock):
    before = clock.now
    result = run(repo)
    assert result["students"] == 6 and result["skipped"] == 0 and result["attempts"] > 6
    assert clock.now is before  # the clock is put back
    saved = members(repo)
    assert len(saved) == 6 and all(m["status"] == "approved" and m["demo_seed"] == BATCH for m in saved)
    scoped = repo.scoped("aaptprep")
    for m in saved:
        access = {a["course_id"] for a in scoped.list_access(m["email"])}
        assert access == set(m["course_ids"])
        assert all(a["source"] == "seed" for a in scoped.list_access(m["email"]))
        assert len(scoped.list_attempts(m["email"])) >= 1


def test_the_attempts_are_ordinary_scored_attempts_in_the_past(client, repo, admin, school, tests_for_courses):
    now = time.time()
    run(repo)
    scoped = repo.scoped("aaptprep")
    seen = 0
    for m in members(repo):
        for a in scoped.list_attempts(m["email"]):
            seen += 1
            assert a["status"] == "submitted" and a["started_at"] < a["submitted_at"]
            started = __import__("datetime").datetime.fromisoformat(a["started_at"]).timestamp()
            assert now - 29 * 86400 < started < now
            assert a["correct"] + a["wrong"] + a["unanswered"] == len(a["question_ids"])
            assert float(a["marks"]) == a["correct"] * float(a["marks_correct"]) + a["wrong"] * float(a["marks_incorrect"])
            assert 0 <= float(a["percentage"]) <= 100 and isinstance(a["passed"], bool)
            assert sum(sum(c) for c in a["topics"].values()) == len(a["question_ids"])
    assert seen > 0


def test_students_attempt_only_tests_of_their_own_courses_and_never_more_than_the_limit(client, repo, admin, school, tests_for_courses):
    run(repo)
    scoped = repo.scoped("aaptprep")
    by_id = {t["id"]: t for t in tests_for_courses}
    for m in members(repo):
        per_test = {}
        for a in scoped.list_attempts(m["email"]):
            test = by_id[a["test_id"]]
            assert set(m["course_ids"]) & set(test["courses"])
            per_test[a["test_id"]] = per_test.get(a["test_id"], 0) + 1
        assert all(count <= 3 for count in per_test.values())


def test_scores_vary_between_students_and_most_but_not_all_pass(client, repo, admin, school, tests_for_courses):
    run(repo, per_course=10)
    scoped = repo.scoped("aaptprep")
    marks = [float(a["percentage"]) for m in members(repo) for a in scoped.list_attempts(m["email"])]
    assert len(set(round(x) for x in marks)) > 5 and min(marks) < max(marks)
    assert 0 < sum(1 for m in members(repo) for a in scoped.list_attempts(m["email"]) if a["passed"]) < len(marks)


def test_each_tests_attempt_count_matches_the_attempts(client, repo, admin, school, tests_for_courses):
    run(repo)
    scoped = repo.scoped("aaptprep")
    counted = {}
    for m in members(repo):
        for a in scoped.list_attempts(m["email"]):
            counted[a["test_id"]] = counted.get(a["test_id"], 0) + 1
    for test in tests_for_courses:
        assert scoped.get_test(test["id"]).get("attempt_count", 0) == counted.get(test["id"], 0)


def test_running_it_again_skips_students_that_exist(client, repo, admin, school, tests_for_courses):
    run(repo)
    count = sum(len(repo.scoped("aaptprep").list_attempts(m["email"])) for m in members(repo))
    again = run(repo)
    assert again["students"] == 0 and again["skipped"] == 6 and again["attempts"] == 0
    assert sum(len(repo.scoped("aaptprep").list_attempts(m["email"])) for m in members(repo)) == count


def test_a_course_with_no_tests_still_gets_its_students(client, repo, admin, school, add_course):
    add_course("aaptprep", "CUET")
    result = run(repo, per_course=2)
    assert result["students"] == 6 and result["attempts"] == 0
    assert sum(1 for m in members(repo) if m["course_name"] == "CUET") == 2


def test_an_existing_email_is_never_overwritten(client, repo, admin, school, tests_for_courses):
    courses = sorted(seed.open_courses(repo.scoped("aaptprep")), key=lambda c: c["name"])
    first = seed.make_students(courses, 3, 7, BATCH, "ritesh@example.com", time.time())[0]
    repo.scoped("aaptprep").create_member({"email": first["email"], "role": "student", "status": "approved", "first_name": "Someone", "last_name": "Real"})
    result = run(repo)
    assert result["skipped"] == 1 and result["students"] == 5
    assert repo.scoped("aaptprep").get_member(first["email"])["first_name"] == "Someone"


# ---- The results show up in the app ----

def test_the_admins_results_and_a_students_my_results_show_the_seeded_attempts(client, repo, admin, school, tests_for_courses, sign_in):
    run(repo)
    test = tests_for_courses[0]
    results = client.get(f"{ADMIN_TESTS}/{test['id']}/results", headers=admin).json()
    assert results["summary"]["attempts"] == len(results["attempts"]) > 0
    assert all(r["email"].endswith("@example.com") and r["name"] for r in results["attempts"])
    assert any(len(r["questions"]) for r in [results]) and results["summary"]["average"] is not None
    seeded = [m for m in members(repo) if repo.scoped("aaptprep").list_attempts(m["email"])][0]
    student = sign_in("aaptprep", seeded["email"])
    mine = client.get("/api/my/results", headers=student).json()
    assert mine["summary"]["attempts"] >= 1 and mine["attempts"] and mine["subjects"]


# ---- Status and removing ----

def test_status_counts_the_students_and_their_attempts(client, repo, admin, school, tests_for_courses, capsys):
    run(repo)
    info = seed.status(repo, "aaptprep", BATCH)
    assert info["students"] == 6 and info["attempts"] > 6
    assert "demo students" in capsys.readouterr().out
    assert seed.status(repo, "aaptprep", "some-other-batch")["students"] == 0


def test_a_dry_run_removes_nothing(client, repo, admin, school, tests_for_courses):
    run(repo)
    info = seed.remove(repo, "aaptprep", BATCH, dry_run=True)
    assert info["students"] == 6 and len(members(repo)) == 6


def test_remove_deletes_the_students_their_access_and_attempts_and_fixes_the_counts(client, repo, admin, school, tests_for_courses, sign_in):
    real = sign_in("aaptprep", "asha@example.com")  # a real student, not tagged
    client.post("/api/admin/registrations/asha@example.com/access", json={"course_id": school["cat"]["id"]}, headers=admin)
    client.post(f"/api/my/tests/{tests_for_courses[0]['id']}/start", headers=real)
    run(repo)
    scoped = repo.scoped("aaptprep")
    emails = [m["email"] for m in members(repo)]
    info = seed.remove(repo, "aaptprep", BATCH)
    assert info["students"] == 6 and info["records"] > 12
    assert members(repo) == []
    for email in emails:
        assert scoped.get_member(email) is None and scoped.list_access(email) == [] and scoped.list_attempts(email) == []
    # Only the real student's one attempt is left on the counts.
    assert [scoped.get_test(t["id"]).get("attempt_count", 0) for t in tests_for_courses] == [1, 0, 0]
    assert scoped.get_member("asha@example.com") is not None and len(scoped.list_attempts("asha@example.com")) == 1
    assert client.get(f"{ADMIN_TESTS}/{tests_for_courses[0]['id']}/results", headers=admin).json()["summary"]["attempts"] == 1


def test_removing_another_batch_touches_nothing(client, repo, admin, school, tests_for_courses):
    run(repo)
    assert seed.remove(repo, "aaptprep", "not-this-batch")["students"] == 0
    assert len(members(repo)) == 6


def test_an_unknown_institute_is_refused(repo):
    with pytest.raises(SystemExit):
        seed.plan(repo, "nope", 1, 1, BATCH)


def test_the_command_line_runs_each_command(client, repo, admin, school, tests_for_courses, capsys):
    assert seed.main(["plan", "--slug", "aaptprep", "--per-course", "1"], repo=repo) == 0
    assert seed.main(["create", "--slug", "aaptprep", "--per-course", "2", "--batch", BATCH, "--seed", "3"], repo=repo) == 0
    assert seed.main(["status", "--slug", "aaptprep", "--batch", BATCH], repo=repo) == 0
    assert seed.main(["remove", "--slug", "aaptprep", "--batch", BATCH, "--dry-run"], repo=repo) == 0
    assert seed.main(["remove", "--slug", "aaptprep", "--batch", BATCH], repo=repo) == 0
    out = capsys.readouterr().out
    assert "Made 4 students" in out and "Removed 4 demo students" in out and "Would remove 4" in out
