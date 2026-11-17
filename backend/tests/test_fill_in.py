"""Fill-in questions: one box the student types the answer into. Rules, marking, the admin API and the Excel upload."""
from io import BytesIO

import pytest
from openpyxl import load_workbook

from app import answers, question_import as qi
from app.tenants import ValidationError
from conftest import headers
from test_question_import import PNG, good_row, post as import_post, stage, workbook
from test_question_images import ready_picture

URL = "/api/admin/questions"


@pytest.fixture
def school(make_tenant, add_member):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


@pytest.fixture
def s3(client):
    return client.app.state.storage.s3


def fill_in(**overrides) -> dict:
    body = {
        "kind": "fill_in", "paper": "geography", "topic": "Map work", "text": "What is the capital of Maharashtra?",
        "answer": {"type": "text", "accepted": ["Mumbai", "Bombay"]},
        "explanation": "Mumbai is the capital. It was called Bombay until 1995.",
        "difficulty": "easy", "status": "published",
    }
    return {**body, **overrides}


# ---- Checking the answer a student types (the marking rules) ----

def text_q(*accepted):
    return {"kind": "fill_in", "answer": {"type": "text", "accepted": list(accepted)}}


def number_q(value, tolerance="0"):
    return {"kind": "fill_in", "answer": {"type": "number", "value": value, "tolerance": tolerance}}


@pytest.mark.parametrize("given,expected", [
    ("Mumbai", True), ("  mumbai ", True), ("MUMBAI", True), ("Bombay", True), ("mum  bai", False),
    ("Delhi", False), ("", False), (None, False), ("Mumbai city", False),
])
def test_text_answers_ignore_capitals_and_extra_spaces_and_accept_alternatives(given, expected):
    assert answers.is_correct(text_q("Mumbai", "Bombay"), given) is expected


def test_spaces_inside_a_text_answer_are_squeezed_not_removed():
    assert answers.is_correct(text_q("New Delhi"), "new    delhi") is True
    assert answers.is_correct(text_q("New Delhi"), "newdelhi") is False


@pytest.mark.parametrize("given,expected", [
    ("2.5", True), ("2.50", True), (" 2.5 ", True), (2.5, True), ("2.51", False), ("abc", False), ("", False),
    (None, False), ("NaN", False), ("Infinity", False), ("2,5", False), (True, False),
])
def test_number_answers_compare_as_numbers(given, expected):
    assert answers.is_correct(number_q("2.5"), given) is expected


def test_a_number_may_have_a_tolerance_and_commas_in_thousands_are_fine():
    close = number_q("100", "0.5")
    assert [answers.is_correct(close, v) for v in ("99.5", "100.5", "100.51", "99.49")] == [True, True, False, False]
    assert answers.is_correct(number_q("1000"), "1,000") is True
    assert answers.is_correct(number_q("0.3"), "0.30") is True  # exact decimals, no 0.1+0.2 surprises


def test_multiple_choice_marking_compares_the_option_number():
    q = {"kind": "mcq", "correct": 2}
    assert answers.is_correct(q, 2) is True and answers.is_correct(q, 1) is False
    assert answers.is_correct(q, "2") is False and answers.is_correct(q, True) is False
    assert answers.is_correct({"correct": 0}, 0) is True  # an old question with no kind is multiple choice


# ---- Checking what the admin types ----

@pytest.mark.parametrize("raw,expected", [
    ({"type": "text", "accepted": ["Mumbai"]}, {"type": "text", "accepted": ["Mumbai"]}),
    ({"type": "text", "accepted": " Mumbai | Bombay |  "}, {"type": "text", "accepted": ["Mumbai", "Bombay"]}),
    ({"type": "text", "accepted": ["Mumbai", "mumbai", " MUMBAI "]}, {"type": "text", "accepted": ["Mumbai"]}),
    ({"type": "number", "value": 2.5}, {"type": "number", "value": "2.5", "tolerance": "0"}),
    ({"type": "number", "value": "2.50", "tolerance": "0.010"}, {"type": "number", "value": "2.5", "tolerance": "0.01"}),
    ({"type": "number", "value": "1,000", "tolerance": ""}, {"type": "number", "value": "1000", "tolerance": "0"}),
    ({"type": "number", "value": "-0"}, {"type": "number", "value": "0", "tolerance": "0"}),
    ({"type": "number", "value": "1E+3"}, {"type": "number", "value": "1000", "tolerance": "0"}),
])
def test_the_answer_is_tidied_into_its_stored_form(raw, expected):
    assert answers.clean_answer(raw) == expected


@pytest.mark.parametrize("raw,message", [
    (None, "text or a number"), ({}, "text or a number"), ({"type": "other"}, "text or a number"),
    ({"type": "text", "accepted": []}, "Give the correct answer."),
    ({"type": "text", "accepted": [" ", "|"]}, "Give the correct answer."),
    ({"type": "text", "accepted": ["x" * 201]}, "at most 200"),
    ({"type": "text", "accepted": [f"a{n}" for n in range(11)]}, "at most 10"),
    ({"type": "number", "value": "abc"}, "must be a number"),
    ({"type": "number", "value": None}, "must be a number"),
    ({"type": "number", "value": True}, "must be a number"),
    ({"type": "number", "value": "NaN"}, "must be a number"),
    ({"type": "number", "value": "1e99"}, "must be a number"),
    ({"type": "number", "value": "1", "tolerance": "-1"}, "tolerance"),
    ({"type": "number", "value": "1", "tolerance": "x"}, "tolerance"),
])
def test_a_bad_answer_is_refused_with_a_message(raw, message):
    with pytest.raises(ValidationError, match=message):
        answers.clean_answer(raw)


# ---- The admin API ----

def test_a_fill_in_question_is_saved_with_its_answer_and_explanation_and_no_options(client, admin):
    response = client.post(URL, json=fill_in(), headers=admin)
    assert response.status_code == 201, response.text
    saved = response.json()
    assert saved["kind"] == "fill_in" and saved["options"] == [] and saved["correct"] is None
    assert saved["answer"] == {"type": "text", "accepted": ["Mumbai", "Bombay"]}
    assert saved["explanation"].startswith("Mumbai is the capital")
    assert client.get(URL, headers=admin).json()[0] == saved


def test_a_number_answer_is_saved_as_text_the_database_can_hold(client, admin):
    saved = client.post(URL, json=fill_in(answer={"type": "number", "value": 3.14, "tolerance": 0.01}), headers=admin).json()
    assert saved["answer"] == {"type": "number", "value": "3.14", "tolerance": "0.01"}


def test_options_sent_with_a_fill_in_question_are_ignored(client, admin):
    junk = [{"text": "x", "why": "y"}]
    saved = client.post(URL, json=fill_in(options=junk, correct=2), headers=admin).json()
    assert saved["options"] == [] and saved["correct"] is None


def test_a_fill_in_question_needs_an_answer_and_an_explanation(client, admin):
    errors = client.post(URL, json=fill_in(answer=None, explanation=""), headers=admin).json()["errors"]
    assert set(errors) == {"answer", "explanation"}


def test_a_multiple_choice_question_still_needs_options_and_has_no_answer_field(client, admin):
    mcq = {"paper": "physics", "topic": "Optics", "text": "Q?", "options": [{"text": f"O{n}", "why": "r"} for n in "ABCD"], "correct": 1}
    saved = client.post(URL, json=mcq, headers=admin).json()
    assert saved["kind"] == "mcq" and saved["answer"] is None and saved["explanation"] is None
    errors = client.post(URL, json={**mcq, "kind": "mcq", "options": []}, headers=admin).json()["errors"]
    assert errors == {"options": "Give exactly 4 options."}


def test_an_unknown_type_is_refused(client, admin):
    assert "kind" in client.post(URL, json=fill_in(kind="essay"), headers=admin).json()["errors"]


def test_the_list_can_be_filtered_by_type(client, admin, fake_clock):
    mcq = {"paper": "physics", "topic": "Optics", "text": "Q?", "options": [{"text": f"O{n}", "why": "r"} for n in "ABCD"], "correct": 1}
    a = client.post(URL, json=mcq, headers=admin).json()
    fake_clock.advance(1)
    b = client.post(URL, json=fill_in(), headers=admin).json()
    ids = lambda p: [q["id"] for q in client.get(URL, params=p, headers=admin).json()]
    assert ids({"kind": "fill_in"}) == [b["id"]] and ids({"kind": "mcq"}) == [a["id"]] and len(ids({})) == 2


def test_editing_a_fill_in_answer_keeps_the_rest(client, admin):
    saved = client.post(URL, json=fill_in(), headers=admin).json()
    edited = client.patch(f"{URL}/{saved['id']}", json={"answer": {"type": "number", "value": "7"}}, headers=admin).json()
    assert edited["answer"]["value"] == "7" and edited["text"] == saved["text"] and edited["explanation"] == saved["explanation"]


def test_a_bad_edit_is_refused_and_nothing_changes(client, admin):
    saved = client.post(URL, json=fill_in(), headers=admin).json()
    response = client.patch(f"{URL}/{saved['id']}", json={"answer": {"type": "number", "value": "abc"}}, headers=admin)
    assert response.status_code == 422 and "answer" in response.json()["errors"]
    assert client.get(URL, headers=admin).json()[0]["answer"] == saved["answer"]


def test_switching_a_fill_in_question_to_multiple_choice_needs_options_and_clears_the_answer(client, admin):
    saved = client.post(URL, json=fill_in(), headers=admin).json()
    assert client.patch(f"{URL}/{saved['id']}", json={"kind": "mcq"}, headers=admin).status_code == 422
    options = [{"text": f"O{n}", "why": "r"} for n in "ABCD"]
    edited = client.patch(f"{URL}/{saved['id']}", json={"kind": "mcq", "options": options, "correct": 3}, headers=admin).json()
    assert edited["kind"] == "mcq" and edited["correct"] == 3 and edited["answer"] is None and edited["explanation"] is None


def test_switching_multiple_choice_to_fill_in_clears_the_options(client, admin):
    mcq = {"paper": "geography", "topic": "Map work", "text": "Q?", "options": [{"text": f"O{n}", "why": "r"} for n in "ABCD"], "correct": 1}
    saved = client.post(URL, json=mcq, headers=admin).json()
    edited = client.patch(
        f"{URL}/{saved['id']}",
        json={"kind": "fill_in", "answer": {"type": "text", "accepted": ["A"]}, "explanation": "Because."}, headers=admin,
    ).json()
    assert edited["kind"] == "fill_in" and edited["options"] == [] and edited["correct"] is None


def test_a_fill_in_question_can_have_a_question_picture_but_not_option_pictures(client, admin, repo, s3):
    q_pic, d_pic = ready_picture(client, s3, repo, admin), ready_picture(client, s3, repo, admin)
    assert client.post(URL, json=fill_in(images={"question": q_pic}), headers=admin).status_code == 201
    response = client.post(URL, json=fill_in(text="Another?", images={"D": d_pic}), headers=admin)
    assert response.status_code == 422 and "no options" in response.json()["errors"]["images"]


def test_a_stored_answer_is_marked_correctly_end_to_end(client, admin, repo):
    saved = client.post(URL, json=fill_in(), headers=admin).json()
    stored = repo.scoped("aaptprep").get_question(saved["id"])
    assert answers.is_correct(stored, " bombay ") is True and answers.is_correct(stored, "Pune") is False
    num = repo.scoped("aaptprep").get_question(
        client.post(URL, json=fill_in(text="Pi?", answer={"type": "number", "value": "3.14", "tolerance": "0.01"}), headers=admin).json()["id"]
    )
    assert answers.is_correct(num, "3.15") is True and answers.is_correct(num, "3.2") is False


def test_another_institute_never_sees_the_answer(client, admin, make_tenant, sign_in):
    client.post(URL, json=fill_in(), headers=admin)
    make_tenant("other-school", "Other", "boss@example.com")
    assert client.get(URL, headers=sign_in("other-school", "boss@example.com")).json() == []


# ---- The Excel upload ----

COLS = qi.COLUMNS + qi.OPTIONAL_COLUMNS


def fill_row(**overrides) -> dict:
    row = {
        "Subject": "Geography / Geology", "Topic": "Map work", "Question": "What is the capital of Maharashtra?",
        "Type": "fill_in", "Answer": "Mumbai|Bombay", "Answer type": "text", "Explanation": "Mumbai is the capital.",
        "Difficulty": "easy", "Status": "published",
    }
    return {**row, **overrides}


def upload(client, admin, rows, confirm=False):
    return import_post(client, admin, workbook(rows, columns=COLS), confirm=confirm)


def test_the_template_has_the_fill_in_columns_and_dropdowns(client, admin):
    book = load_workbook(BytesIO(client.get(f"{URL}/template", headers=admin).content))
    assert [c.value for c in book["Questions"][1]][19:24] == ["Type", "Answer", "Answer type", "Tolerance", "Explanation"]
    assert len(book["Questions"].data_validations.dataValidation) == 8
    assert "Fill-in questions" in "".join(str(c.value) for row in book["Instructions"].iter_rows() for c in row)


def test_a_fill_in_row_needs_no_options_and_is_imported(client, admin):
    result = upload(client, admin, [fill_row()], confirm=True).json()
    assert result["imported"] == 1 and result["problems"] == []
    saved = client.get(URL, headers=admin).json()[0]
    assert saved["kind"] == "fill_in" and saved["answer"] == {"type": "text", "accepted": ["Mumbai", "Bombay"]}
    assert saved["options"] == [] and saved["explanation"] == "Mumbai is the capital."


def test_a_number_row_with_a_tolerance_is_imported(client, admin):
    row = fill_row(Question="Value of pi?", Answer=3.14, **{"Answer type": "number", "Tolerance": 0.01})
    upload(client, admin, [row], confirm=True)
    assert client.get(URL, headers=admin).json()[0]["answer"] == {"type": "number", "value": "3.14", "tolerance": "0.01"}


def test_a_blank_answer_type_means_text_and_the_type_is_forgiving(client, admin):
    rows = [fill_row(**{"Answer type": ""}), fill_row(Question="Two?", Type="Fill-in")]
    assert upload(client, admin, rows, confirm=True).json()["imported"] == 2


def test_option_cells_on_a_fill_in_row_are_ignored(client, admin):
    row = fill_row(**{"Option A": "stray", "Why A": "stray", "Correct": "B"})
    assert upload(client, admin, [row], confirm=True).json()["imported"] == 1
    assert client.get(URL, headers=admin).json()[0]["options"] == []


def test_fill_in_problems_name_their_columns(client, admin):
    rows = [
        fill_row(Answer=""),
        fill_row(Question="Q3", Explanation=""),
        fill_row(Question="Q4", Answer="abc", **{"Answer type": "number"}),
        fill_row(Question="Q5", Answer="1", **{"Answer type": "number", "Tolerance": "-2"}),
        fill_row(Question="Q6", **{"Answer type": "maybe"}),
        fill_row(Question="Q7", Type="essay"),
    ]
    by_row = {p["row"]: p["errors"] for p in upload(client, admin, rows).json()["problems"]}
    assert by_row[2] == {"Answer": "Give the correct answer."}
    assert by_row[3] == {"Explanation": "The explanation is required."}
    assert by_row[4] == {"Answer": "The answer must be a number."}
    assert "Tolerance" in by_row[5]
    assert "Answer type" in by_row[6]
    assert by_row[7] == {"Type": "Type must be mcq or fill_in."}


def test_a_multiple_choice_row_in_a_file_with_fill_in_columns_still_works(client, admin):
    assert upload(client, admin, [good_row()], confirm=True).json()["imported"] == 1
    assert client.get(URL, headers=admin).json()[0]["kind"] == "mcq"


def test_an_old_file_without_the_fill_in_columns_still_works(client, admin):
    assert import_post(client, admin, workbook([good_row()]), confirm=True).json()["imported"] == 1


def test_a_question_picture_is_allowed_on_a_fill_in_row_but_an_option_picture_is_not(client, admin, repo):
    stage(client, admin, repo, "map.png")
    stage(client, admin, repo, "opt.png")
    good = upload(client, admin, [fill_row(**{"Question image": "map.png"})], confirm=True).json()
    assert good["imported"] == 1
    bad = upload(client, admin, [fill_row(Question="Another?", **{"Image A": "opt.png"})]).json()
    assert "no options" in bad["problems"][0]["errors"]["Image A"]


def test_the_same_fill_in_question_twice_is_a_duplicate(client, admin):
    upload(client, admin, [fill_row()], confirm=True)
    again = upload(client, admin, [fill_row()], confirm=True).json()
    assert again["imported"] == 0 and len(again["duplicates"]) == 1
