"""Tests built from the question bank: the fields, checks, picking questions by hand or at random, and privacy."""
import random

import pytest

from app import quizzes
from conftest import headers
from test_questions import URL, admin, question, school  # noqa: F401

TESTS = "/api/admin/tests"


@pytest.fixture
def cat(add_course, school):
    return add_course("aaptprep", "CAT")


@pytest.fixture
def clat(add_course, school):
    return add_course("aaptprep", "CLAT")


def make_q(client, admin, text, paper="physics", topic="Optics", status="published", difficulty="medium", **extra):
    made = client.post(URL, json=question(text=text, paper=paper, topic=topic, status=status, difficulty=difficulty, **extra), headers=admin)
    assert made.status_code == 201, made.text
    return made.json()


def body(cat, **overrides):
    data = {
        "title": "Mock 1", "start_at": "2027-01-10 09:00", "end_at": "2027-01-31 23:59", "duration_minutes": 60,
        "max_attempts": 2, "pass_percentage": 40, "marks_correct": 3, "marks_incorrect": -1, "show_answers": True,
        "courses": [cat["id"]], "mode": "manual", "question_ids": [], "status": "draft",
    }
    return {**data, **overrides}


def post(client, admin, data):
    return client.post(TESTS, json=data, headers=admin)


# ---- Creating ----

def test_a_test_is_saved_with_every_field_and_the_numbers_a_list_needs(client, admin, cat):
    ids = [make_q(client, admin, f"Q{i}")["id"] for i in range(3)]
    response = post(client, admin, body(cat, question_ids=ids, status="published"))
    assert response.status_code == 201, response.text
    test = response.json()
    assert test["title"] == "Mock 1" and test["start_at"] == "2027-01-10T09:00" and test["end_at"] == "2027-01-31T23:59"
    assert test["duration_minutes"] == 60 and test["max_attempts"] == 2 and test["pass_percentage"] == 40
    assert test["marks_correct"] == "3" and test["marks_incorrect"] == "-1" and test["show_answers"] is True
    assert test["courses"] == [cat["id"]] and test["mode"] == "manual" and test["status"] == "published"
    assert test["question_count"] == 3 and test["total_marks"] == "9"
    assert [q["text"] for q in test["questions"]] == ["Q0", "Q1", "Q2"]
    listed = client.get(TESTS, headers=admin).json()
    assert len(listed) == 1 and listed[0]["question_count"] == 3 and "questions" not in listed[0]


def test_a_blank_form_reports_every_mistake_together(client, admin, cat):
    response = post(client, admin, {})
    assert response.status_code == 422
    assert set(response.json()["errors"]) == {"title", "duration_minutes", "max_attempts", "pass_percentage", "marks_correct", "marks_incorrect"}


def test_dates_are_optional_and_the_time_is_tidied(client, admin, cat):
    test = post(client, admin, body(cat, start_at="", end_at=None)).json()
    assert test["start_at"] is None and test["end_at"] is None
    test = post(client, admin, body(cat, start_at="2027-03-01T08:30:45", end_at="2027-03-02 08:30")).json()
    assert test["start_at"] == "2027-03-01T08:30" and test["end_at"] == "2027-03-02T08:30"


@pytest.mark.parametrize("field,value", [
    ("start_at", "tomorrow"), ("start_at", "2027-13-01 10:00"), ("end_at", "31/01/2027"), ("end_at", 5),
])
def test_bad_dates_are_refused_next_to_the_field(client, admin, cat, field, value):
    response = post(client, admin, body(cat, **{field: value}))
    assert response.status_code == 422 and field in response.json()["errors"]


def test_the_end_must_be_after_the_start(client, admin, cat):
    for end in ("2027-01-10 09:00", "2027-01-09 10:00"):
        assert "end_at" in post(client, admin, body(cat, end_at=end)).json()["errors"]


@pytest.mark.parametrize("field,value", [
    ("duration_minutes", 0), ("duration_minutes", 601), ("duration_minutes", True), ("duration_minutes", "x"), ("duration_minutes", 1.5),
    ("max_attempts", 0), ("max_attempts", 101), ("max_attempts", True),
    ("pass_percentage", -1), ("pass_percentage", 101), ("pass_percentage", True),
    ("marks_correct", 0), ("marks_correct", -2), ("marks_correct", 101), ("marks_correct", "abc"), ("marks_correct", True), ("marks_correct", 1.234),
    ("marks_incorrect", 1), ("marks_incorrect", -101), ("marks_incorrect", True), ("marks_incorrect", "x"), ("marks_incorrect", -0.255),
    ("show_answers", "yes"), ("show_answers", 1),
    ("title", ""), ("title", "x" * 121), ("mode", "random"), ("status", "live"),
])
def test_bad_numbers_and_choices_are_refused(client, admin, cat, field, value):
    response = post(client, admin, body(cat, **{field: value}))
    assert response.status_code == 422 and field in response.json()["errors"], (field, value)


@pytest.mark.parametrize("field,value,expected", [
    ("marks_correct", "0.5", "0.5"), ("marks_correct", 2.5, "2.5"), ("marks_incorrect", -0.25, "-0.25"), ("marks_incorrect", 0, "0"),
    ("marks_incorrect", "-1.00", "-1"), ("duration_minutes", "90", 90), ("pass_percentage", 0, 0), ("max_attempts", 100, 100),
])
def test_good_numbers_are_accepted_and_kept_tidy(client, admin, cat, field, value, expected):
    assert post(client, admin, body(cat, **{field: value})).json()[field] == expected


def test_total_marks_use_the_decimal_marks(client, admin, cat):
    ids = [make_q(client, admin, f"Q{i}")["id"] for i in range(3)]
    assert post(client, admin, body(cat, question_ids=ids, marks_correct="0.5")).json()["total_marks"] == "1.5"


def test_assigned_courses_must_be_this_institutes_courses(client, admin, cat, clat):
    assert post(client, admin, body(cat, courses=[cat["id"], clat["id"]])).json()["courses"] == [cat["id"], clat["id"]]
    for bad in (["nope"], "abc", [5], [cat["id"], "nope"]):
        assert "courses" in post(client, admin, body(cat, courses=bad)).json()["errors"], bad


def test_a_draft_may_be_saved_unfinished_but_publishing_needs_questions_and_a_course(client, admin, cat):
    assert post(client, admin, body(cat, courses=[], question_ids=[])).status_code == 201
    errors = post(client, admin, body(cat, courses=[], question_ids=[], status="published")).json()["errors"]
    assert set(errors) == {"courses", "question_ids"}


# ---- Choosing questions ----

def test_only_published_existing_questions_can_be_added(client, admin, cat):
    draft = make_q(client, admin, "Draft one", status="draft")
    real = make_q(client, admin, "Real one")
    assert "published" in post(client, admin, body(cat, question_ids=[draft["id"]])).json()["errors"]["question_ids"]
    assert "no longer exists" in post(client, admin, body(cat, question_ids=[real["id"], "gone"])).json()["errors"]["question_ids"]
    for bad in ("abc", [1], [None]):
        assert "question_ids" in post(client, admin, body(cat, question_ids=bad)).json()["errors"], bad


def test_a_repeated_question_is_kept_once_and_the_order_is_kept(client, admin, cat):
    a, b = make_q(client, admin, "A")["id"], make_q(client, admin, "B")["id"]
    assert post(client, admin, body(cat, question_ids=[b, a, b])).json()["question_ids"] == [b, a]


def test_questions_of_a_passage_always_come_together(client, admin, cat):
    one = make_q(client, admin, "P1", passage_text="A shared passage.")
    two = make_q(client, admin, "P2", passage_text="A shared passage.")
    hidden = make_q(client, admin, "P3 draft", passage_text="A shared passage.", status="draft")
    plain = make_q(client, admin, "Plain")
    test = post(client, admin, body(cat, question_ids=[one["id"], plain["id"]])).json()
    assert [q["text"] for q in test["questions"]] == ["P1", "P2", "Plain"]
    assert hidden["id"] not in test["question_ids"] and two["id"] in test["question_ids"]


def test_a_test_has_up_to_500_questions(client, admin, cat, monkeypatch):
    monkeypatch.setattr(quizzes, "MAX_QUESTIONS", 2)
    ids = [make_q(client, admin, f"Q{i}")["id"] for i in range(3)]
    assert "up to 2" in post(client, admin, body(cat, question_ids=ids)).json()["errors"]["question_ids"]


# ---- Changing and deleting ----

def test_a_test_can_be_changed_a_little_at_a_time_and_is_checked_as_a_whole(client, admin, cat):
    made = post(client, admin, body(cat)).json()
    changed = client.patch(f"{TESTS}/{made['id']}", json={"title": "Mock 2", "duration_minutes": 90}, headers=admin).json()
    assert changed["title"] == "Mock 2" and changed["duration_minutes"] == 90 and changed["marks_correct"] == "3"
    assert changed["edited_by"] == "ritesh@example.com"
    bad = client.patch(f"{TESTS}/{made['id']}", json={"marks_correct": 0, "status": "published"}, headers=admin)
    assert bad.status_code == 422 and {"marks_correct", "question_ids"} <= set(bad.json()["errors"])
    assert client.get(f"{TESTS}/{made['id']}", headers=admin).json()["marks_correct"] == "3"


def test_a_test_can_be_published_once_complete_and_taken_back_to_draft(client, admin, cat):
    ids = [make_q(client, admin, "Q")["id"]]
    made = post(client, admin, body(cat, question_ids=ids)).json()
    assert client.patch(f"{TESTS}/{made['id']}", json={"status": "published"}, headers=admin).json()["status"] == "published"
    assert client.patch(f"{TESTS}/{made['id']}", json={"status": "draft"}, headers=admin).json()["status"] == "draft"


def test_a_missing_test_is_404_and_a_test_can_be_deleted(client, admin, cat):
    assert client.get(f"{TESTS}/nope", headers=admin).status_code == 404
    assert client.patch(f"{TESTS}/nope", json={"title": "x"}, headers=admin).status_code == 404
    assert client.delete(f"{TESTS}/nope", headers=admin).status_code == 404
    made = post(client, admin, body(cat)).json()
    assert client.delete(f"{TESTS}/{made['id']}", headers=admin).status_code == 204
    assert client.get(TESTS, headers=admin).json() == []


# ---- Picking at random ----

def seeded(monkeypatch, seed=1):
    monkeypatch.setattr(quizzes, "rng", random.Random(seed))


def pick(client, admin, rules, exclude=None):
    return client.post(f"{TESTS}/auto-pick", json={"rules": rules, "exclude": exclude or []}, headers=admin)


def test_it_picks_the_asked_number_for_each_rule_from_published_questions_only(client, admin, cat, monkeypatch):
    seeded(monkeypatch)
    phys = [make_q(client, admin, f"P{i}")["id"] for i in range(6)]
    [make_q(client, admin, f"C{i}", paper="chemistry", topic="Solutions")["id"] for i in range(4)]
    make_q(client, admin, "Draft", status="draft")
    result = pick(client, admin, [{"paper": "physics", "count": 4}, {"paper": "chemistry", "count": 2}]).json()
    assert result["picked"] == 6 and len(result["question_ids"]) == 6 and result["short"] == []
    assert len([i for i in result["question_ids"] if i in phys]) == 4
    assert len(set(result["question_ids"])) == 6


def test_a_rule_can_name_a_topic_and_a_level(client, admin, cat, monkeypatch):
    seeded(monkeypatch)
    easy = make_q(client, admin, "Easy optics", difficulty="easy")["id"]
    make_q(client, admin, "Hard optics", difficulty="hard")
    make_q(client, admin, "Easy magnetism", topic="Magnetism", difficulty="easy")
    result = pick(client, admin, [{"paper": "physics", "topic": "Optics", "difficulty": "easy", "count": 5}]).json()
    assert result["question_ids"] == [easy] and result["short"] == [{"rule": 1, "wanted": 5, "found": 1}]


def test_questions_already_in_the_test_or_picked_by_an_earlier_rule_are_not_picked_again(client, admin, cat, monkeypatch):
    seeded(monkeypatch)
    ids = [make_q(client, admin, f"Q{i}")["id"] for i in range(4)]
    result = pick(client, admin, [{"paper": "physics", "count": 2}, {"paper": "physics", "count": 2}], exclude=[ids[0]]).json()
    assert len(result["question_ids"]) == 3 and ids[0] not in result["question_ids"]
    assert result["short"] == [{"rule": 2, "wanted": 2, "found": 1}]


def test_a_picked_passage_question_brings_its_passage_along(client, admin, cat, monkeypatch):
    seeded(monkeypatch)
    for i in range(3):
        make_q(client, admin, f"R{i}", paper="english", topic="Reading comprehension", passage_text="Reading text.")
    result = pick(client, admin, [{"paper": "english", "count": 1}]).json()
    assert result["picked"] == 1 and len(result["question_ids"]) == 3 and result["added_for_passages"] == 2


def test_the_pick_can_be_repeated_with_the_same_seed_and_changes_with_another(client, admin, cat, monkeypatch):
    for i in range(12):
        make_q(client, admin, f"Q{i}")
    seeded(monkeypatch, 5)
    a = pick(client, admin, [{"paper": "physics", "count": 4}]).json()["question_ids"]
    seeded(monkeypatch, 5)
    assert pick(client, admin, [{"paper": "physics", "count": 4}]).json()["question_ids"] == a
    seeded(monkeypatch, 6)
    assert pick(client, admin, [{"paper": "physics", "count": 4}]).json()["question_ids"] != a


def test_it_saves_nothing_by_itself(client, admin, cat):
    make_q(client, admin, "Q")
    pick(client, admin, [{"paper": "physics", "count": 1}])
    assert client.get(TESTS, headers=admin).json() == []


@pytest.mark.parametrize("rules", [
    [], None, "x", [5], [{"count": 1}], [{"paper": "nope", "count": 1}], [{"paper": "physics", "topic": "Solutions", "count": 1}],
    [{"paper": "physics", "difficulty": "extreme", "count": 1}], [{"paper": "physics", "count": 0}], [{"paper": "physics", "count": 201}],
    [{"paper": "physics", "count": True}], [{"paper": "physics", "count": 1}] * 21,
])
def test_bad_rules_are_refused(client, admin, cat, rules):
    assert pick(client, admin, rules).status_code == 422


def test_auto_mode_keeps_its_rules_with_the_test(client, admin, cat):
    ids = [make_q(client, admin, "Q")["id"]]
    rules = [{"paper": "physics", "topic": "Optics", "difficulty": "easy", "count": 1}]
    test = post(client, admin, body(cat, mode="auto", rules=rules, question_ids=ids)).json()
    assert test["mode"] == "auto" and test["rules"] == rules
    assert "rules" in post(client, admin, body(cat, mode="auto", rules=[{"paper": "nope", "count": 1}])).json()["errors"]


# ---- Questions used by tests ----

def test_a_question_in_a_published_test_cannot_be_deleted(client, admin, cat):
    qid = make_q(client, admin, "Q")["id"]
    post(client, admin, body(cat, title="Final", question_ids=[qid], status="published"))
    response = client.delete(f"{URL}/{qid}", headers=admin)
    assert response.status_code == 409 and "'Final'" in response.json()["detail"]
    assert len(client.get(URL, headers=admin).json()) == 1


def test_bulk_delete_skips_questions_in_published_tests_and_counts_them(client, admin, cat):
    used, free = make_q(client, admin, "Used")["id"], make_q(client, admin, "Free")["id"]
    post(client, admin, body(cat, question_ids=[used], status="published"))
    result = client.post(f"{URL}/delete", json={"ids": [used, free], "confirm": "DELETE"}, headers=admin).json()
    assert result == {"deleted": 1, "missing": 0, "blocked": 1}
    assert [q["id"] for q in client.get(URL, headers=admin).json()] == [used]


def test_deleting_a_question_takes_it_out_of_draft_tests(client, admin, cat):
    a, b = make_q(client, admin, "A")["id"], make_q(client, admin, "B")["id"]
    test = post(client, admin, body(cat, question_ids=[a, b])).json()
    assert client.delete(f"{URL}/{a}", headers=admin).status_code == 204
    assert client.get(f"{TESTS}/{test['id']}", headers=admin).json()["question_ids"] == [b]


def test_after_the_test_is_deleted_its_questions_can_be_deleted_again(client, admin, cat):
    qid = make_q(client, admin, "Q")["id"]
    test = post(client, admin, body(cat, question_ids=[qid], status="published")).json()
    client.delete(f"{TESTS}/{test['id']}", headers=admin)
    assert client.delete(f"{URL}/{qid}", headers=admin).status_code == 204


# ---- Who may, and privacy ----

def test_only_an_admin_can_use_tests(client, admin, cat, sign_in):
    made = post(client, admin, body(cat)).json()
    student = sign_in("aaptprep", "asha@example.com")
    calls = [("get", TESTS, None), ("post", TESTS, body(cat)), ("get", f"{TESTS}/{made['id']}", None),
             ("patch", f"{TESTS}/{made['id']}", {"title": "x"}), ("delete", f"{TESTS}/{made['id']}", None),
             ("post", f"{TESTS}/auto-pick", {"rules": [{"paper": "physics", "count": 1}]})]
    for method, path, payload in calls:
        assert client.request(method, path, json=payload, headers=headers("aaptprep")).status_code == 401, path
        assert client.request(method, path, json=payload, headers=student).status_code == 403, path


def test_another_institute_cannot_see_use_or_change_our_tests(client, admin, cat, make_tenant, sign_in):
    qid = make_q(client, admin, "Q")["id"]
    made = post(client, admin, body(cat, question_ids=[qid])).json()
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    assert client.get(TESTS, headers=other).json() == []
    for method, payload in (("get", None), ("patch", {"title": "x"}), ("delete", None)):
        assert client.request(method, f"{TESTS}/{made['id']}", json=payload, headers=other).status_code == 404
    errors = post(client, other, body(cat, question_ids=[qid])).json()["errors"]
    assert "question_ids" in errors and "courses" in errors  # our question and our course mean nothing there
    assert pick(client, other, [{"paper": "physics", "count": 5}]).json()["question_ids"] == []
    assert len(client.get(TESTS, headers=admin).json()) == 1
