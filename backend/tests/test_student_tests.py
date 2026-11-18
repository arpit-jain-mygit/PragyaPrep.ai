"""A student taking tests: what they can see, starting and resuming, saving answers, the clock, scoring and review."""
import json

import pytest

from conftest import headers

URL = "/api/my/tests"
ADMIN_TESTS = "/api/admin/tests"
QUESTIONS = "/api/admin/questions"
OPTS = [{"text": t, "why": f"Reason for {t}"} for t in ("Alpha", "Beta", "Gamma", "Delta")]


@pytest.fixture
def school(make_tenant, add_member, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")
    add_member("aaptprep", "ravi@example.com")
    return {"cat": add_course("aaptprep", "CAT"), "clat": add_course("aaptprep", "CLAT")}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


@pytest.fixture
def asha(school, admin, client, sign_in):
    token = sign_in("aaptprep", "asha@example.com")
    client.post("/api/admin/registrations/asha@example.com/access", json={"course_id": school["cat"]["id"]}, headers=admin)
    return token


def q(client, admin, text, **extra):
    body = {"paper": "physics", "topic": "Optics", "text": text, "options": OPTS, "correct": 1, "status": "published", "difficulty": "easy", **extra}
    made = client.post(QUESTIONS, json=body, headers=admin)
    assert made.status_code == 201, made.text
    return made.json()


def fill_in(client, admin, text, answer, explanation="Because."):
    body = {"paper": "physics", "topic": "Optics", "text": text, "kind": "fill_in", "answer": answer, "explanation": explanation, "status": "published"}
    made = client.post(QUESTIONS, json=body, headers=admin)
    assert made.status_code == 201, made.text
    return made.json()


def make_test(client, admin, school, ids, **overrides):
    body = {
        "title": "Mock 1", "start_at": "2027-01-10 09:00", "end_at": "2027-01-31 23:59", "duration_minutes": 30, "max_attempts": 2,
        "pass_percentage": 50, "marks_correct": 3, "marks_incorrect": -1, "show_answers": True, "courses": [school["cat"]["id"]],
        "mode": "manual", "question_ids": ids, "status": "published",
    }
    made = client.post(ADMIN_TESTS, json={**body, **overrides}, headers=admin)
    assert made.status_code == 201, made.text
    return made.json()


@pytest.fixture
def basic(client, admin, school, asha):
    """A published test of three multiple-choice questions (right answer is B) and one fill-in."""
    ids = [q(client, admin, f"Question {i}")["id"] for i in range(3)]
    ids.append(fill_in(client, admin, "Capital of France?", {"type": "text", "accepted": ["Paris"]})["id"])
    return make_test(client, admin, school, ids)


def start(client, token, test_id):
    return client.post(f"{URL}/{test_id}/start", headers=token)


def answer(client, token, test_id, number, given):
    return client.put(f"{URL}/{test_id}/attempts/{number}/answers", json={"answers": given}, headers=token)


def submit(client, token, test_id, number):
    return client.post(f"{URL}/{test_id}/attempts/{number}/submit", headers=token)


# ---- Which tests a student sees ----

def test_a_student_sees_published_tests_for_the_courses_they_can_open(client, school, admin, asha, basic):
    draft = make_test(client, admin, school, basic["question_ids"], title="Draft one", status="draft")
    other = make_test(client, admin, school, basic["question_ids"], title="Other course", courses=[school["clat"]["id"]])
    listed = client.get(URL, headers=asha).json()
    assert [t["title"] for t in listed] == ["Mock 1"]
    card = listed[0]
    assert card["question_count"] == 4 and card["total_marks"] == "12" and card["state"] == "open"
    assert card["attempts_used"] == 0 and card["attempts_left"] == 2 and card["in_progress"] is None and card["best"] is None
    assert card["duration_minutes"] == 30 and card["pass_percentage"] == 50 and card["show_answers"] is True
    assert "question_ids" not in card and draft["id"] != other["id"]


def test_a_student_without_access_sees_nothing_and_cannot_open_a_test(client, school, admin, asha, basic, sign_in):
    ravi = sign_in("aaptprep", "ravi@example.com")  # approved, but no course access
    assert client.get(URL, headers=ravi).json() == []
    assert client.get(f"{URL}/{basic['id']}", headers=ravi).status_code == 404
    assert start(client, ravi, basic["id"]).status_code == 404


def test_ended_access_hides_the_tests(client, school, admin, asha, basic, sign_in, fake_clock):
    client.post("/api/admin/courses", json={"name": "Short", "access": {"type": "days", "days": 1}}, headers=admin)
    short = [c for c in client.get("/api/admin/courses", headers=admin).json() if c["name"] == "Short"][0]
    ravi = sign_in("aaptprep", "ravi@example.com")
    client.post("/api/admin/registrations/ravi@example.com/access", json={"course_id": short["id"]}, headers=admin)
    made = make_test(client, admin, school, basic["question_ids"], title="Short course test", courses=[short["id"]])
    assert [t["title"] for t in client.get(URL, headers=ravi).json()] == ["Short course test"]
    assert start(client, ravi, made["id"]).status_code == 201
    fake_clock.advance(60 * 60 * 24 * 2)
    assert client.get(URL, headers=ravi).json() == []
    assert start(client, ravi, made["id"]).status_code == 404


def test_the_state_follows_the_window(client, school, admin, asha, basic, fake_clock):
    soon = make_test(client, admin, school, basic["question_ids"], title="Soon", start_at="2027-02-01 09:00", end_at="2027-02-28 18:00")
    gone = make_test(client, admin, school, basic["question_ids"], title="Gone", start_at="2027-01-01 09:00", end_at="2027-01-14 18:00")
    free = make_test(client, admin, school, basic["question_ids"], title="Any time", start_at="", end_at="")
    states = {t["title"]: t["state"] for t in client.get(URL, headers=asha).json()}
    assert states == {"Mock 1": "open", "Soon": "upcoming", "Gone": "ended", "Any time": "open"}
    assert start(client, asha, soon["id"]).status_code == 409 and "isn't open yet" in start(client, asha, soon["id"]).json()["detail"]
    assert "has ended" in start(client, asha, gone["id"]).json()["detail"]
    assert start(client, asha, free["id"]).status_code == 201


def test_the_window_uses_india_time(client, school, admin, asha, basic, fake_clock):
    from datetime import datetime, timedelta

    from app import clock

    now = datetime.fromtimestamp(fake_clock.time, tz=clock.INDIA).replace(tzinfo=None)
    stamp = lambda moment: moment.strftime("%Y-%m-%d %H:%M")
    make_test(client, admin, school, basic["question_ids"], title="Over", start_at="", end_at=stamp(now - timedelta(minutes=1)))
    make_test(client, admin, school, basic["question_ids"], title="Still", start_at="", end_at=stamp(now))
    make_test(client, admin, school, basic["question_ids"], title="Later", start_at=stamp(now + timedelta(minutes=1)), end_at="")
    states = {t["title"]: t["state"] for t in client.get(URL, headers=asha).json()}
    assert states["Over"] == "ended" and states["Still"] == "open" and states["Later"] == "upcoming"


# ---- Starting ----

def test_starting_gives_the_questions_without_any_answers_or_reasons(client, asha, basic):
    response = start(client, asha, basic["id"])
    assert response.status_code == 201
    attempt = response.json()
    assert attempt["status"] == "in_progress" and attempt["number"] == 1 and attempt["remaining_seconds"] == 1800
    assert [item["text"] for item in attempt["questions"]] == ["Question 0", "Question 1", "Question 2", "Capital of France?"]
    mcq, fill = attempt["questions"][0], attempt["questions"][3]
    assert [o["text"] for o in mcq["options"]] == ["Alpha", "Beta", "Gamma", "Delta"] and all(set(o) == {"text"} for o in mcq["options"])
    assert fill["kind"] == "fill_in" and fill["options"] == []
    text = json.dumps(attempt)
    for leak in ("Reason for", "Because.", "Paris", '"correct"', '"why"', '"explanation"', '"answer"'):
        assert leak not in text, leak


def test_starting_again_carries_on_with_the_same_attempt(client, asha, basic, fake_clock):
    first = start(client, asha, basic["id"]).json()
    answer(client, asha, basic["id"], 1, {basic["question_ids"][0]: 1})
    fake_clock.advance(600)
    again = start(client, asha, basic["id"])
    assert again.status_code == 201 and again.json()["number"] == 1
    assert again.json()["remaining_seconds"] == 1200 and again.json()["answers"] == {basic["question_ids"][0]: 1}
    assert first["started_at"] == again.json()["started_at"]
    assert client.get(f"{URL}/{basic['id']}", headers=asha).json()["in_progress"] == 1


def test_attempts_are_limited_and_counted_from_the_start(client, asha, basic):
    for number in (1, 2):
        assert start(client, asha, basic["id"]).json()["number"] == number
        assert submit(client, asha, basic["id"], number).status_code == 200
    third = start(client, asha, basic["id"])
    assert third.status_code == 409 and "all your attempts" in third.json()["detail"]
    card = client.get(f"{URL}/{basic['id']}", headers=asha).json()
    assert card["attempts_used"] == 2 and card["attempts_left"] == 0


# ---- Answering ----

def test_answers_are_saved_replaced_and_cleared(client, asha, basic):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    assert answer(client, asha, basic["id"], 1, {ids[0]: 1, ids[3]: "  Paris "}).json()["saved"] == 2
    assert client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()["answers"] == {ids[0]: 1, ids[3]: "Paris"}
    answer(client, asha, basic["id"], 1, {ids[0]: 2})
    answer(client, asha, basic["id"], 1, {ids[3]: None})
    assert client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()["answers"] == {ids[0]: 2}
    answer(client, asha, basic["id"], 1, {ids[0]: ""})
    assert client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()["answers"] == {}


@pytest.mark.parametrize("given", [{"x": 1}, {}, None, "abc", [1], {"Q0": 4}, {"Q0": -1}, {"Q0": True}, {"Q0": "1"}, {"Q0": 1.5}, {"Q0": [1]}, {"Q3": "x" * 201}, {"Q3": True}, {"Q3": ["a"]}])
def test_unusable_answers_are_refused_and_nothing_is_saved(client, asha, basic, given):
    ids = basic["question_ids"]
    if isinstance(given, dict):
        given = {{"Q0": ids[0], "Q3": ids[3]}.get(k, k): v for k, v in given.items()}
    start(client, asha, basic["id"])
    assert answer(client, asha, basic["id"], 1, given).status_code == 422
    assert client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()["answers"] == {}


def test_the_seconds_left_come_from_the_servers_clock(client, asha, basic, fake_clock):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    fake_clock.advance(125)
    assert answer(client, asha, basic["id"], 1, {ids[0]: 1}).json()["remaining_seconds"] == 1675
    assert client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()["remaining_seconds"] == 1675


# ---- The clock ----

def test_an_answer_just_after_the_deadline_still_counts_but_a_late_one_submits_the_test(client, asha, basic, fake_clock):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {ids[0]: 1})
    fake_clock.advance(1800 + 2)
    assert answer(client, asha, basic["id"], 1, {ids[1]: 1}).status_code == 200  # within the few seconds of grace
    fake_clock.advance(10)
    late = answer(client, asha, basic["id"], 1, {ids[2]: 1})
    assert late.status_code == 409 and late.json()["finished"] is True
    result = late.json()["result"]
    assert result["status"] == "submitted" and result["auto_submitted"] is True and result["correct"] == 2 and result["marks"] == "6"


def test_a_test_left_open_is_submitted_by_the_system_with_what_was_saved(client, asha, basic, fake_clock):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {ids[0]: 1, ids[1]: 0})
    fake_clock.advance(1900)
    result = client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()
    assert result["status"] == "submitted" and result["auto_submitted"] is True
    assert (result["correct"], result["wrong"], result["unanswered"]) == (1, 1, 2) and result["marks"] == "2"
    assert client.get(f"{URL}/{basic['id']}", headers=asha).json()["attempts_used"] == 1
    assert start(client, asha, basic["id"]).json()["number"] == 2  # the next attempt


def test_a_finished_attempt_cannot_be_answered_again(client, asha, basic):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    submit(client, asha, basic["id"], 1)
    late = answer(client, asha, basic["id"], 1, {ids[0]: 1})
    assert late.status_code == 409 and late.json()["finished"] is True


def test_the_deadline_is_fixed_when_the_attempt_starts_even_if_the_window_closes(client, asha, basic, fake_clock):
    start(client, asha, basic["id"])
    fake_clock.advance(60 * 60 * 24 * 30)  # long after the end date
    result = client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()
    assert result["status"] == "submitted" and result["auto_submitted"] is True
    assert "has ended" in start(client, asha, basic["id"]).json()["detail"]


# ---- Scoring ----

def test_marks_follow_the_tests_rules(client, asha, basic):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {ids[0]: 1, ids[1]: 1, ids[2]: 0, ids[3]: "paris"})
    result = submit(client, asha, basic["id"], 1).json()
    assert (result["correct"], result["wrong"], result["unanswered"]) == (3, 1, 0)
    assert result["marks"] == "8" and result["total_marks"] == "12" and result["percentage"] == "66.67" and result["passed"] is True
    assert result["auto_submitted"] is False and result["pass_percentage"] == 50


def test_unanswered_questions_score_nothing_and_a_low_score_fails(client, asha, basic):
    start(client, asha, basic["id"])
    result = submit(client, asha, basic["id"], 1).json()
    assert (result["correct"], result["wrong"], result["unanswered"]) == (0, 0, 4)
    assert result["marks"] == "0" and result["percentage"] == "0" and result["passed"] is False


def test_negative_marks_can_take_the_total_below_zero_but_the_percentage_stops_at_zero(client, asha, basic):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {ids[0]: 0, ids[1]: 0, ids[2]: 0, ids[3]: "London"})
    result = submit(client, asha, basic["id"], 1).json()
    assert result["marks"] == "-4" and result["percentage"] == "0" and result["passed"] is False


def test_decimal_marks_and_the_pass_line_are_exact(client, admin, school, asha):
    ids = [q(client, admin, f"D{i}")["id"] for i in range(4)]
    test = make_test(client, admin, school, ids, title="Decimals", marks_correct="0.5", marks_incorrect="-0.25", pass_percentage=50)
    start(client, asha, test["id"])
    answer(client, asha, test["id"], 1, {ids[0]: 1, ids[1]: 1, ids[2]: 0, ids[3]: 0})
    result = submit(client, asha, test["id"], 1).json()
    assert result["marks"] == "0.5" and result["total_marks"] == "2" and result["percentage"] == "25" and result["passed"] is False
    start(client, asha, test["id"])
    answer(client, asha, test["id"], 2, {ids[0]: 1, ids[1]: 1})
    assert submit(client, asha, test["id"], 2).json()["passed"] is True  # exactly 50%


def test_fill_in_answers_are_marked_by_the_rules_for_text_and_numbers(client, admin, school, asha):
    a = fill_in(client, admin, "City?", {"type": "text", "accepted": ["Mumbai", "Bombay"]})["id"]
    b = fill_in(client, admin, "Pi?", {"type": "number", "value": "3.14", "tolerance": "0.01"})["id"]
    c = fill_in(client, admin, "Ten?", {"type": "number", "value": "10", "tolerance": "0"})["id"]
    test = make_test(client, admin, school, [a, b, c], title="Typed")
    start(client, asha, test["id"])
    answer(client, asha, test["id"], 1, {a: "  BOMBAY ", b: "3.145", c: "10.0"})
    result = submit(client, asha, test["id"], 1).json()
    assert (result["correct"], result["wrong"]) == (3, 0)
    start(client, asha, test["id"])
    answer(client, asha, test["id"], 2, {a: "Delhi", b: "3.2", c: "ten"})
    assert submit(client, asha, test["id"], 2).json()["wrong"] == 3


def test_submitting_twice_gives_the_same_result(client, asha, basic):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {ids[0]: 1})
    first = submit(client, asha, basic["id"], 1).json()
    second = submit(client, asha, basic["id"], 1).json()
    assert first["submitted_at"] == second["submitted_at"] and first["marks"] == second["marks"] == "3"


def test_the_best_score_shows_in_the_list(client, asha, basic):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {ids[0]: 1})
    submit(client, asha, basic["id"], 1)
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 2, {ids[0]: 1, ids[1]: 1, ids[2]: 1})
    submit(client, asha, basic["id"], 2)
    card = client.get(f"{URL}/{basic['id']}", headers=asha).json()
    assert card["best"] == {"marks": "9", "percentage": "75", "passed": True}
    assert [(a["number"], a["marks"]) for a in card["attempts"]] == [(1, "3"), (2, "9")]


# ---- Result and review ----

def test_the_review_shows_right_answers_and_reasons_when_the_test_allows_it(client, asha, basic):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {ids[0]: 0, ids[1]: 1, ids[3]: "Rome"})
    result = submit(client, asha, basic["id"], 1).json()
    review = result["review"]
    assert [r["result"] for r in review] == ["w", "c", "u", "w"]
    assert review[0]["given"] == 0 and review[0]["correct"] == 1 and review[0]["reasons"] == [f"Reason for {t}" for t in ("Alpha", "Beta", "Gamma", "Delta")]
    assert review[2]["given"] is None
    assert review[3]["answer"] == "Paris" and review[3]["explanation"] == "Because." and review[3]["given"] == "Rome"
    assert client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()["review"] == review


def test_without_permission_the_result_has_a_score_and_no_answers_at_all(client, admin, school, asha, basic):
    test = make_test(client, admin, school, basic["question_ids"], title="Private", show_answers=False)
    start(client, asha, test["id"])
    answer(client, asha, test["id"], 1, {basic["question_ids"][0]: 1})
    result = submit(client, asha, test["id"], 1).json()
    assert result["review"] is None and result["show_answers"] is False and result["correct"] == 1
    for leak in ("Reason for", "Paris", "Because.", '"why"'):
        assert leak not in json.dumps(result)
    assert client.get(f"{URL}/{test['id']}/attempts/1", headers=asha).json()["review"] is None


# ---- The attempt keeps the rules it started with ----

def test_later_changes_to_the_test_do_not_change_a_running_attempt(client, admin, asha, basic):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    client.patch(f"{ADMIN_TESTS}/{basic['id']}", json={"marks_correct": 10, "marks_incorrect": -5, "pass_percentage": 99, "duration_minutes": 5, "show_answers": False, "question_ids": ids[:1]}, headers=admin)
    attempt = client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()
    assert len(attempt["questions"]) == 4 and attempt["remaining_seconds"] == 1800
    answer(client, asha, basic["id"], 1, {ids[0]: 1, ids[1]: 0})
    result = submit(client, asha, basic["id"], 1).json()
    assert result["marks"] == "2" and result["total_marks"] == "12" and result["pass_percentage"] == 50 and result["show_answers"] is True


def test_an_edited_question_is_shown_as_it_is_now(client, admin, asha, basic):
    ids = basic["question_ids"]
    start(client, asha, basic["id"])
    client.patch(f"{QUESTIONS}/{ids[0]}", json={"text": "Question 0, fixed"}, headers=admin)
    assert client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()["questions"][0]["text"] == "Question 0, fixed"


def test_passages_come_with_their_questions(client, admin, school, asha):
    ids = [q(client, admin, f"P{i}", paper="english", topic="Reading comprehension", passage_text="The monsoon arrives in June.")["id"] for i in range(2)]
    test = make_test(client, admin, school, ids, title="Reading")
    attempt = start(client, asha, test["id"]).json()
    assert [item["passage_text"] for item in attempt["questions"]] == ["The monsoon arrives in June."] * 2
    assert attempt["questions"][0]["passage"] == attempt["questions"][1]["passage"]


# ---- Who may ----

def test_other_students_cannot_see_or_change_an_attempt(client, school, admin, asha, basic, sign_in):
    ravi = sign_in("aaptprep", "ravi@example.com")
    client.post("/api/admin/registrations/ravi@example.com/access", json={"course_id": school["cat"]["id"]}, headers=admin)
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {basic["question_ids"][0]: 1})
    assert client.get(f"{URL}/{basic['id']}/attempts/1", headers=ravi).status_code == 404
    assert answer(client, ravi, basic["id"], 1, {basic["question_ids"][0]: 0}).status_code == 404
    assert submit(client, ravi, basic["id"], 1).status_code == 404
    assert client.get(f"{URL}/{basic['id']}/attempts/1", headers=asha).json()["answers"] == {basic["question_ids"][0]: 1}
    assert start(client, ravi, basic["id"]).json()["number"] == 1  # their own, separate attempt


def test_only_students_can_use_these_screens_and_they_need_to_be_signed_in(client, admin, asha, basic):
    for method, path in (("get", URL), ("get", f"{URL}/{basic['id']}"), ("post", f"{URL}/{basic['id']}/start"), ("get", f"{URL}/{basic['id']}/attempts/1")):
        assert client.request(method, path, headers=headers("aaptprep")).status_code == 401, path
        assert client.request(method, path, headers=admin).status_code == 403, path


def test_another_institute_never_sees_our_tests(client, school, admin, asha, basic, make_tenant, add_member, sign_in):
    make_tenant("other-school", "Other", "boss@example.com")
    add_member("other-school", "asha@example.com")
    other = sign_in("other-school", "asha@example.com")
    assert client.get(URL, headers=other).json() == []
    assert client.get(f"{URL}/{basic['id']}", headers=other).status_code == 404


def test_an_unknown_attempt_is_404(client, asha, basic):
    assert client.get(f"{URL}/{basic['id']}/attempts/9", headers=asha).status_code == 404
    assert answer(client, asha, basic["id"], 9, {"x": 1}).status_code == 404
    assert submit(client, asha, basic["id"], 9).status_code == 404


# ---- The schedule: closing soon, opening soon, overdue ----

def test_the_card_says_how_long_an_open_test_has_left_and_how_soon_an_upcoming_one_opens(client, school, admin, asha, basic, fake_clock):
    make_test(client, admin, school, basic["question_ids"], title="Soon", start_at="2027-01-16 09:00", end_at="2027-02-28 18:00")
    make_test(client, admin, school, basic["question_ids"], title="Any time", start_at="", end_at="")
    from datetime import datetime
    from math import ceil

    from app import clock

    now = datetime.fromtimestamp(fake_clock.time, tz=clock.INDIA).replace(tzinfo=None)
    until = lambda stamp, extra=0: ceil(((datetime.strptime(stamp, "%Y-%m-%d %H:%M") - now).total_seconds() + extra) / 60)
    cards = {t["title"]: t for t in client.get(URL, headers=asha).json()}
    # The closing minute counts, so a test ending at 23:59 has until midnight.
    assert cards["Mock 1"]["minutes_left"] == until("2027-01-31 23:59", 60) and cards["Mock 1"]["opens_in_minutes"] is None
    assert cards["Soon"]["opens_in_minutes"] == until("2027-01-16 09:00") and cards["Soon"]["minutes_left"] is None
    assert cards["Any time"]["minutes_left"] is None and cards["Any time"]["opens_in_minutes"] is None
    assert not any(c["overdue"] for c in cards.values())


def test_the_last_minute_still_counts_as_open(client, school, admin, asha, basic, fake_clock):
    from datetime import datetime

    from app import clock

    now = datetime.fromtimestamp(fake_clock.time, tz=clock.INDIA).replace(tzinfo=None)
    make_test(client, admin, school, basic["question_ids"], title="Last", start_at="", end_at=now.strftime("%Y-%m-%d %H:%M"))
    card = next(t for t in client.get(URL, headers=asha).json() if t["title"] == "Last")
    assert card["state"] == "open" and card["minutes_left"] == 1
    fake_clock.advance(60)
    card = next(t for t in client.get(URL, headers=asha).json() if t["title"] == "Last")
    assert card["state"] == "ended" and card["minutes_left"] is None


def test_a_closed_test_the_student_never_took_is_overdue(client, school, admin, asha, basic, fake_clock):
    gone = make_test(client, admin, school, basic["question_ids"], title="Gone", start_at="2027-01-01 09:00", end_at="2027-01-14 18:00")
    card = next(t for t in client.get(URL, headers=asha).json() if t["id"] == gone["id"])
    assert card["state"] == "ended" and card["overdue"] is True


def test_a_closed_test_the_student_took_is_not_overdue(client, school, admin, asha, basic, fake_clock):
    window = make_test(client, admin, school, basic["question_ids"], title="Window", start_at="2027-01-10 09:00", end_at="2027-01-15 14:00")
    number = start(client, asha, window["id"]).json()["number"]
    submit(client, asha, window["id"], number)
    fake_clock.advance(3 * 3600)
    card = next(t for t in client.get(URL, headers=asha).json() if t["id"] == window["id"])
    assert card["state"] == "ended" and card["overdue"] is False


def test_a_test_left_running_past_the_window_counts_as_taken(client, school, admin, asha, basic, fake_clock):
    window = make_test(client, admin, school, basic["question_ids"], title="Window", start_at="2027-01-10 09:00", end_at="2027-01-15 14:00")
    start(client, asha, window["id"])
    fake_clock.advance(5 * 3600)
    card = next(t for t in client.get(URL, headers=asha).json() if t["id"] == window["id"])
    assert card["state"] == "ended" and card["overdue"] is False
