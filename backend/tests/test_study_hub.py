"""Study Hub for students: Wren & Martin and Cambridge Maths. Notes, quizzes and tests; nothing saved."""
import pytest

WM = "/api/my/study-hub/wm"
CM = "/api/my/study-hub/cm"


@pytest.fixture
def student(make_tenant, add_member, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")
    return sign_in("aaptprep", "asha@example.com")


def test_only_a_signed_in_student_can_open_the_study_hub(client, student):
    anonymous = {"X-Tenant": "aaptprep"}
    assert client.get(f"{WM}/chapters", headers=anonymous).status_code in (401, 403)
    assert client.get(f"{CM}/chapters", headers=anonymous).status_code in (401, 403)


def test_wren_martin_notes_and_chapters_are_listed(client, student):
    notes = client.get(f"{WM}/notes", headers=student).json()["notes"]
    assert len(notes) == 43 and notes[0]["title"]
    chapters = client.get(f"{WM}/chapters", headers=student).json()["chapters"]
    assert chapters[0]["chapter"] == 1 and chapters[0]["count"] > 0


def test_wren_martin_questions_never_show_the_answer(client, student):
    body = client.get(f"{WM}/chapters/1/questions", headers=student).json()
    assert body["questions"]
    for q in body["questions"]:
        assert not {"correct", "explanation", "reasons"} & set(q)


def test_a_right_wren_martin_answer_is_marked_right_and_a_wrong_one_gets_its_reason(client, student):
    from app import study_hub_wm

    q = study_hub_wm.questions(1)[0]
    full = study_hub_wm._find_question(1, q["id"])
    right = client.post(f"{WM}/answers", json={"chapter": 1, "question_id": q["id"], "choice": full["correct"]}, headers=student).json()
    assert right["correct"] is True and right["explanation"] == full["explanation"]
    wrong_choice = (full["correct"] + 1) % len(full["options"])
    wrong = client.post(f"{WM}/answers", json={"chapter": 1, "question_id": q["id"], "choice": wrong_choice}, headers=student).json()
    assert wrong["correct"] is False and wrong["explanation"] == full["reasons"][wrong_choice]


def test_a_wren_martin_test_is_built_and_marked(client, student):
    built = client.get(f"{WM}/tests/build", params={"chapters": "1,2", "formats": "ABCD", "count": 5}, headers=student).json()["items"]
    assert 0 < len(built) <= 5
    marked = client.post(f"{WM}/tests/grade", json={"items": [{"id": i["id"], "answer": ""} for i in built]}, headers=student).json()
    assert marked["total"] == len(built) and marked["score"] == 0


def test_cambridge_quiz_never_shows_the_answer(client, student):
    body = client.get(f"{CM}/chapters/1/quiz", headers=student).json()
    assert body["questions"]
    assert all("answer" not in q and "explanation" not in q for q in body["questions"])


def test_a_cambridge_test_is_built_and_marked(client, student):
    built = client.get(f"{CM}/tests/build", params={"chapters": "1", "formats": "ABCD", "count": 4}, headers=student).json()["items"]
    assert 0 < len(built) <= 4
    marked = client.post(f"{CM}/tests/grade", json={"items": [{"id": i["id"], "answer": ""} for i in built]}, headers=student).json()
    assert marked["total"] == len(built) and marked["score"] == 0


def test_unknown_chapters_and_formats_are_refused(client, student):
    assert client.get(f"{WM}/chapters/999/questions", headers=student).status_code == 404
    assert client.get(f"{CM}/chapters/999", headers=student).status_code == 404
    assert client.get(f"{CM}/tests/build", params={"formats": "Z"}, headers=student).status_code == 400
