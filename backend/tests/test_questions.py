"""Question bank: the paper list, adding and checking questions, editing, filtering, deleting, and privacy."""
import pytest

from app.papers import BY_ID, PAPERS
from conftest import headers

URL = "/api/admin/questions"


@pytest.fixture
def school(make_tenant, add_member):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


def question(**overrides) -> dict:
    body = {
        "paper": "physics",
        "topic": "Optics",
        "text": "Which colour bends the most in a prism?",
        "options": [
            {"text": "Red", "why": "Red has the longest wavelength, so it bends the least."},
            {"text": "Violet", "why": "Violet has the shortest wavelength, so it bends the most."},
            {"text": "Green", "why": "Green bends more than red but less than violet."},
            {"text": "Yellow", "why": "Yellow sits in the middle of the spectrum, not at the end."},
        ],
        "correct": 1,
        "difficulty": "easy",
        "status": "published",
    }
    return {**body, **overrides}


# ---- The paper list ----

def test_the_paper_list_has_the_37_cuet_papers_and_6_entrance_exam_papers_in_four_sections():
    assert len(PAPERS) == 43
    assert len({paper["id"] for paper in PAPERS}) == 43
    sections = [paper["section"] for paper in PAPERS]
    assert sections.count("I: Language") == 13
    assert sections.count("II: Domain") == 23
    assert sections.count("III: General") == 1
    assert sections.count("IV: Management and law entrance") == 6
    assert all(paper["topics"] for paper in PAPERS)


def test_the_admin_can_fetch_the_papers(client, admin):
    response = client.get("/api/admin/papers", headers=admin)
    assert response.status_code == 200
    assert len(response.json()) == 43
    assert "Optics" in {p["id"]: p for p in response.json()}["physics"]["topics"]


# ---- Who can use it ----

def test_only_an_admin_can_use_the_question_bank(client, school, admin, sign_in):
    made = client.post(URL, json=question(), headers=admin).json()
    student = sign_in("aaptprep", "asha@example.com")
    calls = [
        ("get", "/api/admin/papers", None),
        ("get", URL, None),
        ("post", URL, question()),
        ("patch", f"{URL}/{made['id']}", {"text": "x"}),
        ("delete", f"{URL}/{made['id']}", None),
    ]
    for method, path, json in calls:
        assert client.request(method, path, json=json, headers=headers("aaptprep")).status_code == 401, path
        assert client.request(method, path, json=json, headers=student).status_code == 403, path


# ---- Adding ----

def test_adding_a_question_saves_everything(client, admin):
    response = client.post(URL, json=question(), headers=admin)
    assert response.status_code == 201
    saved = response.json()
    assert saved["paper"] == "physics" and saved["topic"] == "Optics"
    assert saved["correct"] == 1
    assert saved["options"][1]["why"].startswith("Violet has the shortest")
    assert saved["status"] == "published" and saved["difficulty"] == "easy"
    assert client.get(URL, headers=admin).json()[0]["id"] == saved["id"]


def test_difficulty_and_status_default_to_medium_and_draft(client, admin):
    body = question()
    del body["difficulty"], body["status"]
    saved = client.post(URL, json=body, headers=admin).json()
    assert saved["difficulty"] == "medium" and saved["status"] == "draft"


def test_a_missing_question_is_refused_with_a_message_next_to_the_field(client, admin):
    response = client.post(URL, json={}, headers=admin)
    assert response.status_code == 422
    errors = response.json()["errors"]
    assert set(errors) == {"paper", "text", "options", "correct"}


def test_a_topic_from_another_paper_is_refused(client, admin):
    response = client.post(URL, json=question(topic="Ratios"), headers=admin)
    assert response.status_code == 422
    assert response.json()["errors"] == {"topic": "Choose a topic that belongs to this paper."}


def test_an_unknown_paper_is_refused(client, admin):
    errors = client.post(URL, json=question(paper="magic"), headers=admin).json()["errors"]
    assert errors["paper"] == "Choose a paper from the list."


@pytest.mark.parametrize("count", [0, 2, 3, 5])
def test_there_must_be_exactly_four_options(client, admin, count):
    options = question()["options"][:count] if count < 4 else question()["options"] + [{"text": "E", "why": "e"}]
    errors = client.post(URL, json=question(options=options), headers=admin).json()["errors"]
    assert errors == {"options": "Give exactly 4 options."}


def test_every_option_needs_text_and_a_reason(client, admin):
    options = question()["options"]
    options[2]["why"] = "  "
    errors = client.post(URL, json=question(options=options), headers=admin).json()["errors"]
    assert errors["options"] == "The reason for option 3 is required."

    options = question()["options"]
    options[0]["text"] = ""
    errors = client.post(URL, json=question(options=options), headers=admin).json()["errors"]
    assert errors["options"] == "Option 1 is required."


def test_two_equal_options_are_refused(client, admin):
    options = question()["options"]
    options[3]["text"] = " violet "
    errors = client.post(URL, json=question(options=options), headers=admin).json()["errors"]
    assert "same" in errors["options"]


@pytest.mark.parametrize("correct", [-1, 4, True, "1", None])
def test_the_correct_answer_must_be_one_of_the_options(client, admin, correct):
    errors = client.post(URL, json=question(correct=correct), headers=admin).json()["errors"]
    assert errors == {"correct": "Choose which option is correct."}


def test_bad_difficulty_and_status_are_refused(client, admin):
    errors = client.post(URL, json=question(difficulty="insane", status="live"), headers=admin).json()["errors"]
    assert set(errors) == {"difficulty", "status"}


def test_text_that_is_too_long_is_refused(client, admin):
    errors = client.post(URL, json=question(text="x" * 2001), headers=admin).json()["errors"]
    assert "at most 2000" in errors["text"]


def test_language_papers_work_with_other_scripts(client, admin):
    body = question(paper="hindi", topic="Grammar", text="सही वर्तनी चुनिए।")
    assert client.post(URL, json=body, headers=admin).status_code == 201


def test_extra_spaces_are_tidied(client, admin):
    saved = client.post(URL, json=question(text="  Which   colour?  "), headers=admin).json()
    assert saved["text"] == "Which colour?"


# ---- Listing and filtering ----

def test_the_list_is_newest_first_and_can_be_filtered(client, admin, fake_clock):
    first = client.post(URL, json=question(), headers=admin).json()
    fake_clock.advance(1)
    second = client.post(URL, json=question(paper="chemistry", topic="Solutions", status="draft", difficulty="hard"), headers=admin).json()
    fake_clock.advance(1)
    third = client.post(URL, json=question(topic="Magnetism"), headers=admin).json()

    ids = lambda params: [q["id"] for q in client.get(URL, params=params, headers=admin).json()]
    assert ids({}) == [third["id"], second["id"], first["id"]]
    assert ids({"paper": "physics"}) == [third["id"], first["id"]]
    assert ids({"paper": "physics", "topic": "Magnetism"}) == [third["id"]]
    assert ids({"status": "draft"}) == [second["id"]]
    assert ids({"difficulty": "hard"}) == [second["id"]]
    assert ids({"paper": "biology"}) == []


# ---- Editing ----

def test_editing_changes_only_what_was_sent_and_records_who(client, admin):
    made = client.post(URL, json=question(), headers=admin).json()
    response = client.patch(f"{URL}/{made['id']}", json={"status": "draft", "correct": 2}, headers=admin)
    assert response.status_code == 200
    edited = response.json()
    assert edited["status"] == "draft" and edited["correct"] == 2
    assert edited["text"] == made["text"] and edited["options"] == made["options"]
    assert edited["edited_by"] == "ritesh@example.com" and edited["edited_at"]


def test_changing_the_paper_alone_is_refused_when_the_topic_no_longer_fits(client, admin):
    made = client.post(URL, json=question(), headers=admin).json()
    response = client.patch(f"{URL}/{made['id']}", json={"paper": "chemistry"}, headers=admin)
    assert response.status_code == 422 and "topic" in response.json()["errors"]
    assert client.get(URL, headers=admin).json()[0]["paper"] == "physics"


def test_paper_and_topic_can_change_together(client, admin):
    made = client.post(URL, json=question(), headers=admin).json()
    response = client.patch(f"{URL}/{made['id']}", json={"paper": "chemistry", "topic": "Solutions"}, headers=admin)
    assert response.status_code == 200 and response.json()["paper"] == "chemistry"


def test_edited_options_are_checked_as_a_whole(client, admin):
    made = client.post(URL, json=question(), headers=admin).json()
    response = client.patch(f"{URL}/{made['id']}", json={"options": made["options"][:3]}, headers=admin)
    assert response.status_code == 422


def test_editing_a_missing_question_is_404(client, admin):
    assert client.patch(f"{URL}/nope", json={"text": "x"}, headers=admin).status_code == 404


# ---- Deleting ----

def test_a_question_can_be_deleted(client, admin):
    made = client.post(URL, json=question(), headers=admin).json()
    assert client.delete(f"{URL}/{made['id']}", headers=admin).status_code == 204
    assert client.get(URL, headers=admin).json() == []
    assert client.delete(f"{URL}/{made['id']}", headers=admin).status_code == 404


# ---- Privacy between institutes ----

def test_another_institute_cannot_see_change_or_delete_a_question(client, admin, make_tenant, sign_in):
    made = client.post(URL, json=question(), headers=admin).json()
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")

    assert client.get(URL, headers=other).json() == []
    assert client.patch(f"{URL}/{made['id']}", json={"text": "hacked"}, headers=other).status_code == 404
    assert client.delete(f"{URL}/{made['id']}", headers=other).status_code == 404
    assert client.get(URL, headers=admin).json()[0]["text"] == made["text"]


def test_every_listed_topic_is_accepted_for_its_paper(client, admin):
    paper = BY_ID["general-aptitude"]
    for topic in paper["topics"]:
        assert client.post(URL, json=question(paper=paper["id"], topic=topic), headers=admin).status_code == 201
