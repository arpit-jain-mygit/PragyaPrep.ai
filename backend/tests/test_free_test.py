"""The one free test: a free student takes the picked course's first published test, once, with no access to anything else."""
import pytest

from test_signup import LEARNER, finish, platform  # noqa: F401  (platform is an autouse fixture the sign-up helpers need)
from test_coursework import sub, topic
from test_student_tests import fill_in, make_test, q

FREE = "/api/free"


@pytest.fixture
def school(make_tenant, add_course, client, sign_in, fake_clock):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    admin = sign_in("aaptprep", "ritesh@example.com")
    cat, clat = add_course("aaptprep", "CAT"), add_course("aaptprep", "CLAT")
    for course in (cat, clat):  # a course is on offer once it has a published sub-topic
        sub(client, admin, course["id"], topic(client, admin, course["id"], "Percentages")["id"], "Concepts", note="Free note", status="published")
    ids = [q(client, admin, f"Question {i}")["id"] for i in range(3)]
    ids.append(fill_in(client, admin, "Capital of France?", {"type": "text", "accepted": ["Paris"]})["id"])
    first = make_test(client, admin, {"cat": cat}, ids, title="Free mock", start_at="2027-01-10 09:00", end_at="2027-01-12 09:00", max_attempts=3, show_answers=True)
    fake_clock.advance(60)
    make_test(client, admin, {"cat": cat}, ids, title="Second mock")
    clat_ids = [q(client, admin, "CLAT question")["id"]]
    other = make_test(client, admin, {"cat": clat}, clat_ids, title="CLAT mock")
    make_test(client, admin, {"cat": cat}, ids, title="A draft", status="draft")
    return {"admin": admin, "first": first, "other": other, "ids": ids}


@pytest.fixture
def learner(client, mailer, school):
    token = finish(client, mailer, LEARNER).json()["access_token"]
    return {"X-Tenant": "free", "Authorization": f"Bearer {token}"}


@pytest.fixture
def picked(client, learner):
    client.put(f"{FREE}/pick", json={"course": "CAT"}, headers=learner)
    return learner


def test_there_is_no_free_test_until_a_course_is_picked(client, learner):
    assert client.get(f"{FREE}/test", headers=learner).json() == {"test": None}


def test_the_free_test_is_the_courses_first_published_test_with_one_attempt(client, picked, school):
    card = client.get(f"{FREE}/test", headers=picked).json()["test"]
    assert card["id"] == school["first"]["id"] and card["title"] == "Free mock" and card["question_count"] == 4
    assert card["max_attempts"] == 1 and card["state"] == "open" and card["attempts_left"] == 1  # the test's own limit and window don't apply


def test_the_learner_takes_the_free_test_start_to_finish(client, picked, school):
    test_id = school["first"]["id"]
    started = client.post(f"{FREE}/tests/{test_id}/start", headers=picked)
    assert started.status_code == 201
    questions = started.json()["questions"]
    assert len(questions) == 4 and "correct" not in str(questions) and "Reason for" not in str(questions)
    ids = [x["id"] for x in questions]
    mcq = [i for i, x in zip(ids, questions) if x["kind"] == "mcq"]
    saved = client.put(f"{FREE}/tests/{test_id}/attempts/1/answers", json={"answers": {mcq[0]: 1, mcq[1]: 0}}, headers=picked)
    assert saved.status_code == 200 and saved.json()["saved"] == 2
    again = client.post(f"{FREE}/tests/{test_id}/start", headers=picked)
    assert again.status_code == 201 and again.json()["answers"][mcq[0]] == 1  # carries on with the same attempt
    done = client.post(f"{FREE}/tests/{test_id}/attempts/1/submit", headers=picked).json()
    assert done["status"] == "submitted" and done["correct"] == 1 and done["wrong"] == 1 and done["unanswered"] == 2
    assert done["review"] is not None and len(done["review"]) == 4
    assert client.get(f"{FREE}/tests/{test_id}/attempts/1", headers=picked).json()["status"] == "submitted"


def test_a_second_attempt_is_refused(client, picked, school):
    test_id = school["first"]["id"]
    client.post(f"{FREE}/tests/{test_id}/start", headers=picked)
    client.post(f"{FREE}/tests/{test_id}/attempts/1/submit", headers=picked)
    again = client.post(f"{FREE}/tests/{test_id}/start", headers=picked)
    assert again.status_code == 409 and "all your attempts" in again.json()["detail"]
    assert client.get(f"{FREE}/test", headers=picked).json()["test"]["attempts_left"] == 0


def test_no_other_test_opens(client, picked, school):
    for test_id in (school["other"]["id"], "nope"):
        assert client.get(f"{FREE}/tests/{test_id}", headers=picked).status_code == 404
        assert client.post(f"{FREE}/tests/{test_id}/start", headers=picked).status_code == 404


def test_a_learner_cannot_save_an_answer_to_a_question_outside_the_free_test(client, picked, school):
    test_id = school["first"]["id"]
    client.post(f"{FREE}/tests/{test_id}/start", headers=picked)
    outside = client.get("/api/admin/questions", headers=school["admin"]).json()
    other = next(x["id"] for x in (outside if isinstance(outside, list) else outside.get("questions", [])) if x["id"] not in school["ids"])
    assert client.put(f"{FREE}/tests/{test_id}/attempts/1/answers", json={"answers": {other: 1}}, headers=picked).status_code == 422


def test_the_attempt_belongs_to_the_free_account_not_the_sample_institute(client, picked, school, repo):
    test_id = school["first"]["id"]
    client.post(f"{FREE}/tests/{test_id}/start", headers=picked)
    assert repo.scoped("free").list_attempts("kid@example.com", test_id)
    assert repo.scoped("aaptprep").list_attempts("kid@example.com", test_id) == []
    assert client.get(f"/api/admin/tests/{test_id}/results", headers=school["admin"]).json()["summary"]["attempts"] == 0


def test_the_free_test_is_for_signed_in_free_students_only(client, picked, school, mailer):
    test_id = school["first"]["id"]
    assert client.get(f"{FREE}/test", headers={"X-Tenant": "free"}).status_code == 401
    parent = finish(client, mailer, {"kind": "parent", "email": "mum@example.com", "name": "Meena Shah"}).json()["access_token"]
    assert client.get(f"{FREE}/test", headers={"X-Tenant": "free", "Authorization": f"Bearer {parent}"}).status_code == 403
    assert client.get(f"{FREE}/tests/{test_id}", headers=school["admin"]).status_code in (403, 404)


def test_the_time_limit_still_applies(client, picked, school, fake_clock):
    test_id = school["first"]["id"]
    client.post(f"{FREE}/tests/{test_id}/start", headers=picked)
    fake_clock.advance(31 * 60)
    late = client.put(f"{FREE}/tests/{test_id}/attempts/1/answers", json={"answers": {school["ids"][0]: 1}}, headers=picked)
    assert late.status_code == 409 and late.json()["finished"] is True
