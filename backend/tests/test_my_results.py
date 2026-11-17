"""A student's results across tests: totals, the trend, every finished attempt, and accuracy by subject and topic."""
import pytest

from conftest import headers
from test_student_tests import (  # noqa: F401  (fixtures and helpers shared with the other student tests)
    ADMIN_TESTS, OPTS, QUESTIONS, URL, admin, answer, asha, fill_in, make_test, q, school, start, submit,
)

RESULTS = "/api/my/results"


def get(client, token):
    response = client.get(RESULTS, headers=token)
    assert response.status_code == 200, response.text
    return response.json()


def take(client, token, test, right_count, number=1):
    """Take a test, getting the first right_count questions right (option B) and the rest wrong (option A)."""
    start(client, token, test["id"])
    ids = test["question_ids"]
    answer(client, token, test["id"], number, {question_id: (1 if i < right_count else 0) for i, question_id in enumerate(ids)})
    return submit(client, token, test["id"], number).json()


@pytest.fixture
def two_tests(client, admin, school, asha):
    """An optics test (4 questions) and a reading test (2 questions), 3 marks for right and -1 for wrong, pass at 50%."""
    optics = [q(client, admin, f"Optics {i}")["id"] for i in range(4)]
    reading = [q(client, admin, f"Reading {i}", paper="english", topic="Reading comprehension")["id"] for i in range(2)]
    return (
        make_test(client, admin, school, optics, title="Optics test", max_attempts=12),
        make_test(client, admin, school, reading, title="Reading test", max_attempts=3),
    )


def test_a_student_who_has_taken_nothing_sees_empty_results(client, asha):
    data = get(client, asha)
    assert data["summary"] == {"tests_taken": 0, "attempts": 0, "in_progress": 0, "average": None, "best": None, "tests_passed": 0}
    assert data["attempts"] == [] and data["trend"] == [] and data["subjects"] == []


def test_totals_cover_every_test_and_a_test_counts_as_passed_if_any_attempt_passed(client, asha, two_tests):
    optics, reading = two_tests
    take(client, asha, optics, 1)            # 3 - 3 = 0 of 12 = 0%: not passed
    take(client, asha, optics, 4, number=2)  # 12 of 12 = 100%: passed
    take(client, asha, reading, 0)           # -2 of 6 -> 0%: not passed
    summary = get(client, asha)["summary"]
    assert summary["tests_taken"] == 2 and summary["attempts"] == 3 and summary["in_progress"] == 0
    assert summary["average"] == "33.33" and summary["best"] == "100"
    assert summary["tests_passed"] == 1  # the optics test, by its second attempt


def test_every_finished_attempt_is_listed_newest_first(client, asha, two_tests, fake_clock):
    optics, reading = two_tests
    take(client, asha, optics, 4)
    fake_clock.advance(60)
    take(client, asha, reading, 2)
    rows = get(client, asha)["attempts"]
    assert [(r["title"], r["number"]) for r in rows] == [("Reading test", 1), ("Optics test", 1)]
    first = rows[0]
    assert (first["marks"], first["total_marks"], first["percentage"], first["passed"]) == ("6", "6", "100", True)
    assert first["test_id"] == reading["id"] and first["show_answers"] is True and first["auto_submitted"] is False
    assert first["started_at"] and first["submitted_at"]


def test_the_trend_is_the_last_ten_attempts_oldest_first(client, asha, two_tests, fake_clock):
    optics, _ = two_tests
    for number in range(1, 13):
        take(client, asha, optics, number % 5, number=number)
        fake_clock.advance(60)
    data = get(client, asha)
    assert data["summary"]["attempts"] == 12 and len(data["attempts"]) == 12
    assert [t["number"] for t in data["trend"]] == list(range(3, 13))
    assert data["trend"][0]["title"] == "Optics test" and "percentage" in data["trend"][0] and "passed" in data["trend"][0]


def test_accuracy_is_worked_out_by_subject_and_topic_across_all_tests(client, asha, two_tests):
    optics, reading = two_tests
    take(client, asha, optics, 3)            # 3 right, 1 wrong
    take(client, asha, reading, 1, number=1) # 1 right, 1 wrong
    start(client, asha, optics["id"])        # a second optics attempt, nothing answered: 4 not answered
    submit(client, asha, optics["id"], 2)
    subjects = {s["id"]: s for s in get(client, asha)["subjects"]}
    physics, english = subjects["physics"], subjects["english"]
    assert (physics["correct"], physics["questions"], physics["accuracy"]) == (3, 8, "37.5")
    assert physics["topics"] == [{"topic": "Optics", "correct": 3, "wrong": 1, "unanswered": 4, "questions": 8, "accuracy": "37.5"}]
    assert (english["correct"], english["questions"], english["accuracy"], english["name"]) == (1, 2, "50", "English")
    assert english["topics"][0]["topic"] == "Reading comprehension"


def test_the_weakest_subjects_and_topics_come_first(client, admin, school, asha):
    ids = {}
    for paper, topic in (("physics", "Optics"), ("physics", "Magnetism"), ("english", "Reading comprehension")):
        ids[(paper, topic)] = [q(client, admin, f"{topic} {i}", paper=paper, topic=topic)["id"] for i in range(2)]
    everything = [i for group in ids.values() for i in group]
    test = make_test(client, admin, school, everything, title="Everything")
    start(client, asha, test["id"])
    given = {i: 1 for i in ids[("physics", "Optics")]}                                    # optics all right
    given.update({i: 0 for i in ids[("physics", "Magnetism")]})                           # magnetism all wrong
    given.update({ids[("english", "Reading comprehension")][0]: 1, ids[("english", "Reading comprehension")][1]: 0})  # reading half
    answer(client, asha, test["id"], 1, given)
    submit(client, asha, test["id"], 1)
    subjects = get(client, asha)["subjects"]
    assert [(s["id"], s["accuracy"]) for s in subjects] == [("english", "50"), ("physics", "50")]  # equal accuracy: by name
    assert [float(s["accuracy"]) for s in subjects] == sorted(float(s["accuracy"]) for s in subjects)
    physics = [s for s in subjects if s["id"] == "physics"][0]
    assert [t["topic"] for t in physics["topics"]] == ["Magnetism", "Optics"] and [t["accuracy"] for t in physics["topics"]] == ["0", "100"]


def test_fill_in_questions_count_in_the_same_way(client, admin, school, asha):
    typed = fill_in(client, admin, "Capital?", {"type": "text", "accepted": ["Paris"]})["id"]
    test = make_test(client, admin, school, [typed], title="Typed")
    start(client, asha, test["id"])
    answer(client, asha, test["id"], 1, {typed: "paris"})
    submit(client, asha, test["id"], 1)
    topic = get(client, asha)["subjects"][0]["topics"][0]
    assert (topic["correct"], topic["questions"], topic["accuracy"]) == (1, 1, "100")


def test_an_unfinished_attempt_is_counted_apart_and_a_timed_out_one_is_finished(client, asha, two_tests, fake_clock):
    optics, reading = two_tests
    start(client, asha, optics["id"])
    assert get(client, asha)["summary"] == {"tests_taken": 0, "attempts": 0, "in_progress": 1, "average": None, "best": None, "tests_passed": 0}
    answer(client, asha, optics["id"], 1, {optics["question_ids"][0]: 1})
    fake_clock.advance(60 * 60)
    data = get(client, asha)
    assert data["summary"]["in_progress"] == 0 and data["summary"]["attempts"] == 1
    assert data["attempts"][0]["auto_submitted"] is True and data["subjects"][0]["correct"] == 1


def test_attempts_made_before_topic_counts_were_kept_still_show_up_without_a_breakdown(client, asha, two_tests, repo):
    optics, _ = two_tests
    take(client, asha, optics, 4)
    repo.scoped("aaptprep").update_attempt("asha@example.com", optics["id"], 1, {"topics": {}})
    data = get(client, asha)
    assert data["summary"]["attempts"] == 1 and data["subjects"] == []


def test_a_student_sees_only_their_own_results(client, admin, school, asha, two_tests, sign_in):
    optics, _ = two_tests
    take(client, asha, optics, 4)
    ravi = sign_in("aaptprep", "ravi@example.com")
    assert get(client, ravi)["summary"]["attempts"] == 0 and get(client, ravi)["attempts"] == []
    assert get(client, asha)["summary"]["attempts"] == 1


def test_only_students_can_use_it_and_other_institutes_have_separate_results(client, admin, asha, two_tests, make_tenant, add_member, sign_in):
    optics, _ = two_tests
    take(client, asha, optics, 4)
    assert client.get(RESULTS, headers=headers("aaptprep")).status_code == 401
    assert client.get(RESULTS, headers=admin).status_code == 403
    make_tenant("other-school", "Other", "boss@example.com")
    add_member("other-school", "asha@example.com")
    other = sign_in("other-school", "asha@example.com")
    assert get(client, other)["summary"]["attempts"] == 0


def test_the_results_stay_available_when_a_test_is_moved_to_draft(client, admin, asha, two_tests):
    optics, _ = two_tests
    take(client, asha, optics, 4)
    client.patch(f"{ADMIN_TESTS}/{optics['id']}", json={"status": "draft"}, headers=admin)
    assert get(client, asha)["attempts"][0]["title"] == "Optics test"
    assert client.get(f"{URL}/{optics['id']}/attempts/1", headers=asha).status_code == 200
