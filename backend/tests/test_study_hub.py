"""Study Hub for students: Wren & Martin, Cambridge Maths, and the wizard (points, candies, shop, board)."""
import pytest

from app import study_hub_wm as wren_martin

BASE = "/api/my/study-hub"
WM = f"{BASE}/wm"
CM = f"{BASE}/cm"


@pytest.fixture
def student(make_tenant, add_member, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")
    add_member("aaptprep", "ravi@example.com")
    return sign_in("aaptprep", "asha@example.com")


@pytest.fixture
def other_student(student, sign_in):
    return sign_in("aaptprep", "ravi@example.com")


def make_wizard(client, token, name="Maya"):
    return client.post(f"{BASE}/players", json={"name": name}, headers=token).json()


def right_choice(chapter, question_id):
    return wren_martin.question_with_answer(chapter, question_id)["correct"]


def answer_right(client, token, code, chapter, question_id):
    choice = right_choice(chapter, question_id)
    return client.post(f"{BASE}/players/{code}/wm/answers",
                       json={"chapter": chapter, "question_id": question_id, "choice": choice}, headers=token).json()


def test_only_a_signed_in_student_can_open_the_study_hub(client, student):
    anonymous = {"X-Tenant": "aaptprep"}
    assert client.get(f"{WM}/chapters", headers=anonymous).status_code in (401, 403)
    assert client.get(f"{CM}/chapters", headers=anonymous).status_code in (401, 403)
    assert client.get(f"{BASE}/shop", headers=anonymous).status_code in (401, 403)


def test_wren_martin_notes_and_chapters_are_listed(client, student):
    notes = client.get(f"{WM}/notes", headers=student).json()["notes"]
    assert len(notes) == 43 and notes[0]["title"]
    chapters = client.get(f"{WM}/chapters", headers=student).json()["chapters"]
    assert chapters[0]["chapter"] == 1 and chapters[0]["count"] > 0


def test_a_wizard_gets_a_code_and_starts_with_nothing(client, student):
    body = make_wizard(client, student, "Maya")
    assert len(body["code"]) == 6
    assert body["name"] == "Maya"
    assert body["points"] == 0 and body["candies"] == 0 and body["streak"] == 0
    assert body["owned"] == [] and body["equipped"] == {}


def test_an_unknown_wizard_code_is_not_found(client, student):
    assert client.get(f"{BASE}/players/ZZZZZZ", headers=student).status_code == 404


def test_wizard_code_brings_the_same_wizard_back(client, student):
    body = make_wizard(client, student, "Maya")
    again = client.get(f"{BASE}/players/{body['code']}", headers=student).json()
    assert again["code"] == body["code"] and again["name"] == "Maya"


def test_wren_martin_questions_never_show_the_answer(client, student):
    code = make_wizard(client, student)["code"]
    body = client.get(f"{BASE}/players/{code}/wm/chapters/1/questions", headers=student).json()
    assert body["questions"] and body["done"] == 0
    for q in body["questions"]:
        assert not {"correct", "explanation", "reasons"} & set(q)
        assert q["done"] is False


def test_a_right_answer_pays_points_and_candies_once(client, student):
    code = make_wizard(client, student)["code"]
    qid = wren_martin.questions(1)[0]["id"]
    first = answer_right(client, student, code, 1, qid)
    assert first["correct"] is True and first["already_answered"] is False
    assert first["points_awarded"] > 0 and first["candies_awarded"] == 1
    again = answer_right(client, student, code, 1, qid)
    assert again["already_answered"] is True and again["points_awarded"] == 0 and again["candies_awarded"] == 0
    assert client.get(f"{BASE}/players/{code}", headers=student).json()["candies"] == 1


def test_a_wrong_answer_gets_its_reason_and_resets_the_streak(client, student):
    code = make_wizard(client, student)["code"]
    qid = wren_martin.questions(1)[0]["id"]
    answer_right(client, student, code, 1, qid)
    other = next(qq["id"] for qq in wren_martin.questions(1) if qq["id"] != qid)
    wrong_choice = (right_choice(1, other) + 1) % 4
    wrong = client.post(f"{BASE}/players/{code}/wm/answers",
                        json={"chapter": 1, "question_id": other, "choice": wrong_choice}, headers=student).json()
    assert wrong["correct"] is False and wrong["points_awarded"] == 0
    assert wrong["explanation"] == wren_martin.question_with_answer(1, other)["reasons"][wrong_choice]
    assert wrong["streak"] == 0


def test_progress_counts_the_questions_answered_in_each_chapter(client, student):
    code = make_wizard(client, student)["code"]
    for q in wren_martin.questions(1)[:2]:
        answer_right(client, student, code, 1, q["id"])
    progress = client.get(f"{BASE}/players/{code}/wm/progress", headers=student).json()
    assert progress["done"] == {"1": 2}


def test_the_shop_needs_candies_then_buy_and_wear(client, student):
    code = make_wizard(client, student)["code"]
    poor = client.post(f"{BASE}/players/{code}/shop/buy", json={"item_id": "hat-cap"}, headers=student)
    assert poor.status_code == 400
    assert client.post(f"{BASE}/players/{code}/shop/equip", json={"item_id": "hat-cap"}, headers=student).status_code == 403
    for q in wren_martin.questions(1)[:10]:
        answer_right(client, student, code, 1, q["id"])
    bought = client.post(f"{BASE}/players/{code}/shop/buy", json={"item_id": "hat-cap"}, headers=student)
    assert bought.status_code == 200 and "hat-cap" in bought.json()["owned"]
    assert client.post(f"{BASE}/players/{code}/shop/buy", json={"item_id": "hat-cap"}, headers=student).status_code == 409
    worn = client.post(f"{BASE}/players/{code}/shop/equip", json={"item_id": "hat-cap"}, headers=student).json()
    assert worn["equipped"] == {"hat": "hat-cap"}


def test_the_board_shows_names_and_points_highest_first(client, student, other_student):
    maya = make_wizard(client, student, "Maya")["code"]
    make_wizard(client, other_student, "Ravi")
    for q in wren_martin.questions(1)[:2]:
        answer_right(client, student, maya, 1, q["id"])
    rows = client.get(f"{BASE}/leaderboard", headers=student).json()["rows"]
    assert rows[0]["name"] == "Maya" and rows[0]["points"] > 0
    assert set(rows[0].keys()) == {"name", "points"}


def test_cambridge_quiz_never_shows_the_answer(client, student):
    body = client.get(f"{CM}/chapters/1/quiz", headers=student).json()
    assert body["questions"]
    assert all("answer" not in q and "explanation" not in q for q in body["questions"])


def test_a_wren_martin_test_is_built_and_marked(client, student):
    built = client.get(f"{WM}/tests/build", params={"chapters": "1,2", "formats": "ABCD", "count": 5}, headers=student).json()["items"]
    assert 0 < len(built) <= 5
    marked = client.post(f"{WM}/tests/grade", json={"items": [{"id": i["id"], "answer": ""} for i in built]}, headers=student).json()
    assert marked["total"] == len(built) and marked["score"] == 0


def test_a_cambridge_test_is_built_and_marked(client, student):
    built = client.get(f"{CM}/tests/build", params={"chapters": "1", "formats": "ABCD", "count": 4}, headers=student).json()["items"]
    assert 0 < len(built) <= 4
    marked = client.post(f"{CM}/tests/grade", json={"items": [{"id": i["id"], "answer": ""} for i in built]}, headers=student).json()
    assert marked["total"] == len(built) and marked["score"] == 0


def test_unknown_chapters_and_formats_are_refused(client, student):
    code = make_wizard(client, student)["code"]
    assert client.get(f"{BASE}/players/{code}/wm/chapters/999/questions", headers=student).status_code == 404
    assert client.get(f"{CM}/chapters/999", headers=student).status_code == 404
    assert client.get(f"{CM}/tests/build", params={"formats": "Z"}, headers=student).status_code == 400
