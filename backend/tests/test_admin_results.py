"""The admin's view of students' results: the summary, every attempt, how each question went, and one student's attempt."""
import pytest

from conftest import headers
from test_student_tests import (  # noqa: F401  (fixtures and helpers shared with the student tests)
    ADMIN_TESTS, QUESTIONS, URL, admin, answer, asha, basic, fill_in, make_test, q, school, start, submit,
)

RESULTS = ADMIN_TESTS


def results(client, admin, test_id):
    response = client.get(f"{RESULTS}/{test_id}/results", headers=admin)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def ravi(client, school, admin, sign_in):
    token = sign_in("aaptprep", "ravi@example.com")
    client.post("/api/admin/registrations/ravi@example.com/access", json={"course_id": school["cat"]["id"]}, headers=admin)
    return token


def play(client, token, test, picks, typed=None, minutes=0, fake_clock=None, number=1):
    """One student's attempt: start, answer the first questions with the given options, submit. Returns the result."""
    start(client, token, test["id"])
    ids = test["question_ids"]
    given = {ids[i]: option for i, option in enumerate(picks) if option is not None}
    if typed is not None:
        given[ids[3]] = typed
    if given:
        answer(client, token, test["id"], number, given)
    if fake_clock and minutes:
        fake_clock.advance(minutes * 60)
    return submit(client, token, test["id"], number).json()


# ---- The summary and the attempts ----

def test_a_test_nobody_has_taken_has_empty_results(client, admin, asha, basic):
    data = results(client, admin, basic["id"])
    assert data["attempts"] == []
    assert data["summary"] == {
        "students": 0, "attempts": 0, "submitted": 0, "in_progress": 0, "average": None, "highest": None, "lowest": None,
        "passed": 0, "pass_rate": None, "distribution": [0] * 10,
    }
    assert data["test"]["title"] == "Mock 1" and data["test"]["question_count"] == 4
    assert [question["faced"] for question in data["questions"]] == [0, 0, 0, 0]
    assert data["questions"][0]["percent_correct"] is None


def test_every_attempt_is_listed_with_the_student_and_the_score(client, admin, asha, ravi, basic, fake_clock):
    play(client, asha, basic, [1, 1, 1], typed="Paris", minutes=7, fake_clock=fake_clock)   # 4 right: 12 of 12
    play(client, ravi, basic, [0, 0, None], minutes=3, fake_clock=fake_clock)                # 0 right, 2 wrong
    data = results(client, admin, basic["id"])
    rows = {r["email"]: r for r in data["attempts"]}
    a, r = rows["asha@example.com"], rows["ravi@example.com"]
    assert a["name"] == "Asha Rao" and a["number"] == 1 and a["status"] == "submitted"
    assert (a["marks"], a["total_marks"], a["percentage"], a["passed"]) == ("12", "12", "100", True)
    assert (a["correct"], a["wrong"], a["unanswered"]) == (4, 0, 0) and a["seconds"] == 420 and a["auto_submitted"] is False
    assert (r["marks"], r["percentage"], r["passed"]) == ("-2", "0", False) and (r["correct"], r["wrong"], r["unanswered"]) == (0, 2, 2)
    assert r["seconds"] == 180


def test_the_summary_counts_students_attempts_and_scores(client, admin, asha, ravi, basic):
    play(client, asha, basic, [1, 1, 1], typed="Paris")            # 100%
    play(client, ravi, basic, [1, 1, None])                          # 6 of 12 = 50% (pass mark 50)
    start(client, asha, basic["id"])                                 # a second, unfinished attempt
    summary = results(client, admin, basic["id"])["summary"]
    assert (summary["students"], summary["attempts"], summary["submitted"], summary["in_progress"]) == (2, 3, 2, 1)
    assert (summary["average"], summary["highest"], summary["lowest"]) == ("75", "100", "50")
    assert (summary["passed"], summary["pass_rate"]) == (2, "100")
    assert summary["distribution"] == [0, 0, 0, 0, 0, 1, 0, 0, 0, 1]


def test_the_pass_rate_and_buckets_follow_the_scores(client, admin, asha, ravi, basic):
    play(client, asha, basic, [None, None, None])                    # 0%
    play(client, ravi, basic, [1, 1, 1], typed="Paris")              # 100%
    summary = results(client, admin, basic["id"])["summary"]
    assert summary["distribution"][0] == 1 and summary["distribution"][9] == 1 and sum(summary["distribution"]) == 2
    assert summary["pass_rate"] == "50" and summary["average"] == "50"


def test_an_unfinished_attempt_is_listed_as_in_progress_without_a_score(client, admin, asha, basic):
    start(client, asha, basic["id"])
    row = results(client, admin, basic["id"])["attempts"][0]
    assert row["status"] == "in_progress" and "marks" not in row and row["submitted_at"] is None


def test_an_attempt_that_ran_out_of_time_is_counted_as_handed_in_by_the_system(client, admin, asha, basic, fake_clock):
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {basic["question_ids"][0]: 1})
    fake_clock.advance(60 * 60)
    data = results(client, admin, basic["id"])
    row = data["attempts"][0]
    assert row["status"] == "submitted" and row["auto_submitted"] is True and row["correct"] == 1
    assert data["summary"]["in_progress"] == 0 and data["summary"]["submitted"] == 1


def test_several_attempts_by_one_student_count_once_as_a_student(client, admin, asha, basic):
    play(client, asha, basic, [1, 0, 0])
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 2, {basic["question_ids"][0]: 1})
    submit(client, asha, basic["id"], 2)
    summary = results(client, admin, basic["id"])["summary"]
    assert (summary["students"], summary["attempts"]) == (1, 2)


# ---- How each question went ----

def test_each_question_shows_how_many_got_it_right_and_the_most_chosen_wrong_option(client, admin, asha, ravi, basic):
    play(client, asha, basic, [1, 0, 0], typed="Paris")
    play(client, ravi, basic, [1, 0, 2], typed="Rome")
    stats = {item["text"]: item for item in results(client, admin, basic["id"])["questions"]}
    first, second, third, typed = stats["Question 0"], stats["Question 1"], stats["Question 2"], stats["Capital of France?"]
    assert (first["faced"], first["correct"], first["percent_correct"]) == (2, 2, "100")
    assert (second["correct"], second["percent_correct"]) == (0, "0")
    assert second["most_chosen_wrong"] == {"option": 0, "count": 2, "text": "Alpha"}
    assert (third["correct"], third["percent_correct"]) == (0, "0") and third["most_chosen_wrong"]["option"] in (0, 2)
    assert (typed["correct"], typed["percent_correct"], typed["kind"]) == (1, "50", "fill_in") and typed["most_chosen_wrong"] is None
    assert first["topic"] == "Optics" and first["difficulty"] == "easy"


def test_unanswered_questions_are_faced_but_not_answered_and_unfinished_attempts_do_not_count(client, admin, asha, ravi, basic):
    play(client, asha, basic, [1, None, None])
    start(client, ravi, basic["id"])
    answer(client, ravi, basic["id"], 1, {basic["question_ids"][0]: 0})
    stats = results(client, admin, basic["id"])["questions"]
    assert (stats[0]["faced"], stats[0]["answered"], stats[0]["correct"]) == (1, 1, 1)
    assert (stats[1]["faced"], stats[1]["answered"], stats[1]["percent_correct"]) == (1, 0, "0")
    assert stats[1]["most_chosen_wrong"] is None


# ---- One student's attempt ----

def test_the_admin_can_open_an_attempt_with_every_answer_even_when_students_cannot(client, admin, school, asha, basic):
    hidden = make_test(client, admin, school, basic["question_ids"], title="Private", show_answers=False)
    start(client, asha, hidden["id"])
    answer(client, asha, hidden["id"], 1, {hidden["question_ids"][0]: 0})
    student_view = submit(client, asha, hidden["id"], 1).json()
    assert student_view["review"] is None
    detail = client.get(f"{RESULTS}/{hidden['id']}/results/asha@example.com/1", headers=admin).json()
    assert detail["student"] == {"email": "asha@example.com", "name": "Asha Rao"}
    assert detail["status"] == "submitted" and detail["marks"] == student_view["marks"]
    review = detail["review"]
    assert [r["result"] for r in review] == ["w", "u", "u", "u"]
    assert review[0]["given"] == 0 and review[0]["correct"] == 1 and review[0]["reasons"][1] == "Reason for Beta"
    assert review[3]["answer"] == "Paris"


def test_an_attempt_in_progress_shows_only_how_far_the_student_has_got(client, admin, asha, basic):
    start(client, asha, basic["id"])
    answer(client, asha, basic["id"], 1, {basic["question_ids"][0]: 1})
    detail = client.get(f"{RESULTS}/{basic['id']}/results/asha@example.com/1", headers=admin).json()
    assert detail["status"] == "in_progress" and detail["answered"] == 1 and detail["questions"] == 4
    assert "review" not in detail


def test_the_email_in_the_address_may_be_in_capitals_and_unknown_attempts_are_404(client, admin, asha, basic):
    play(client, asha, basic, [1])
    assert client.get(f"{RESULTS}/{basic['id']}/results/ASHA@example.com/1", headers=admin).status_code == 200
    assert client.get(f"{RESULTS}/{basic['id']}/results/asha@example.com/9", headers=admin).status_code == 404
    assert client.get(f"{RESULTS}/{basic['id']}/results/nobody@example.com/1", headers=admin).status_code == 404
    assert client.get(f"{RESULTS}/nope/results", headers=admin).status_code == 404


# ---- The attempt counter and deleting ----

def test_the_test_list_counts_attempts_started_and_resuming_does_not_add_one(client, admin, asha, ravi, basic):
    assert client.get(ADMIN_TESTS, headers=admin).json()[0]["attempt_count"] == 0
    start(client, asha, basic["id"])
    start(client, asha, basic["id"])  # carries on with the same attempt
    start(client, ravi, basic["id"])
    assert client.get(ADMIN_TESTS, headers=admin).json()[0]["attempt_count"] == 2
    assert client.get(f"{ADMIN_TESTS}/{basic['id']}", headers=admin).json()["attempt_count"] == 2


def test_a_test_with_attempts_cannot_be_deleted_but_one_without_can(client, admin, school, asha, basic):
    spare = make_test(client, admin, school, basic["question_ids"], title="Spare")
    assert client.delete(f"{ADMIN_TESTS}/{spare['id']}", headers=admin).status_code == 204
    start(client, asha, basic["id"])
    response = client.delete(f"{ADMIN_TESTS}/{basic['id']}", headers=admin)
    assert response.status_code == 409 and "Move it to draft" in response.json()["detail"] and "1 attempt has" in response.json()["detail"]
    assert client.get(f"{ADMIN_TESTS}/{basic['id']}", headers=admin).status_code == 200
    assert client.patch(f"{ADMIN_TESTS}/{basic['id']}", json={"status": "draft"}, headers=admin).json()["status"] == "draft"


# ---- Who may, and privacy ----

def test_only_an_admin_can_see_results(client, admin, asha, basic):
    play(client, asha, basic, [1])
    for path in (f"{RESULTS}/{basic['id']}/results", f"{RESULTS}/{basic['id']}/results/asha@example.com/1"):
        assert client.get(path, headers=headers("aaptprep")).status_code == 401
        assert client.get(path, headers=asha).status_code == 403


def test_another_institute_cannot_see_our_results(client, admin, asha, basic, make_tenant, sign_in):
    play(client, asha, basic, [1])
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    assert client.get(f"{RESULTS}/{basic['id']}/results", headers=other).status_code == 404
    assert client.get(f"{RESULTS}/{basic['id']}/results/asha@example.com/1", headers=other).status_code == 404
