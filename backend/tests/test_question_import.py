"""Question bank upload: the Excel template, and checking and importing a filled-in file."""
from io import BytesIO

import pytest
from openpyxl import Workbook, load_workbook

from app import question_import as qi
from conftest import BUCKET, headers

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40

URL = "/api/admin/questions"


@pytest.fixture
def school(make_tenant, add_member):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


def good_row(**overrides) -> dict:
    row = {
        "Paper": "Physics", "Topic": "Optics", "Question": "Which colour bends the most?",
        "Option A": "Red", "Option B": "Violet", "Option C": "Green", "Option D": "Yellow",
        "Why A": "Longest wavelength.", "Why B": "Shortest wavelength.", "Why C": "In between.", "Why D": "Also in between.",
        "Correct": "B", "Difficulty": "easy", "Status": "published",
    }
    return {**row, **overrides}


def workbook(rows: list[dict], columns=None, sheet="Questions") -> bytes:
    book = Workbook()
    page = book.active
    page.title = sheet
    page.append(columns or qi.COLUMNS)
    for row in rows:
        page.append([row.get(name) for name in (columns or qi.COLUMNS)])
    out = BytesIO()
    book.save(out)
    return out.getvalue()


def post(client, admin, content: bytes, confirm=False):
    return client.post(f"{URL}/import?confirm={'true' if confirm else 'false'}", content=content, headers=admin)


# ---- The template ----

def test_the_template_has_the_columns_dropdowns_and_instructions(client, admin):
    response = client.get(f"{URL}/template", headers=admin)
    assert response.status_code == 200
    assert response.headers["content-type"] == qi.XLSX_TYPE
    assert "question-bank-template.xlsx" in response.headers["content-disposition"]
    book = load_workbook(BytesIO(response.content))
    assert book.sheetnames[0] == "Instructions"
    assert [cell.value for cell in book["Questions"][1]] == qi.COLUMNS + qi.OPTIONAL_COLUMNS
    assert len(book["Papers and topics"][1]) == 43
    assert len(book["Questions"].data_validations.dataValidation) == 8


def test_the_template_itself_is_empty_and_not_importable(client, admin):
    response = post(client, admin, client.get(f"{URL}/template", headers=admin).content)
    assert response.status_code == 422 and "no questions" in response.json()["detail"]


def test_only_an_admin_can_use_the_upload(client, school, admin, sign_in):
    student = sign_in("aaptprep", "asha@example.com")
    for method, path in [("get", f"{URL}/template"), ("post", f"{URL}/import")]:
        assert client.request(method, path, headers=headers("aaptprep")).status_code == 401
        assert client.request(method, path, headers=student).status_code == 403


# ---- Checking a file ----

def test_a_good_file_is_previewed_and_nothing_is_saved(client, admin):
    result = post(client, admin, workbook([good_row(), good_row(Question="Second question?")])).json()
    assert result["confirmed"] is False and result["imported"] == 0
    assert [r["row"] for r in result["ready"]] == [2, 3]
    assert result["ready"][0] == {"row": 2, "paper": "physics", "topic": "Optics", "text": "Which colour bends the most?", "pictures": 0, "passage": None}
    assert result["problems"] == [] and result["duplicates"] == []
    assert client.get(URL, headers=admin).json() == []


def test_confirming_saves_every_good_row_with_all_the_details(client, admin):
    result = post(client, admin, workbook([good_row(), good_row(Question="Second?", Correct="c", Status="")]), confirm=True).json()
    assert result["imported"] == 2
    saved = {q["text"]: q for q in client.get(URL, headers=admin).json()}
    first = saved["Which colour bends the most?"]
    assert first["correct"] == 1 and first["status"] == "published" and first["difficulty"] == "easy"
    assert first["options"][1] == {"text": "Violet", "why": "Shortest wavelength."}
    assert saved["Second?"]["correct"] == 2 and saved["Second?"]["status"] == "draft"


def test_difficulty_and_status_default_when_blank(client, admin):
    post(client, admin, workbook([good_row(Difficulty=None, Status=None)]), confirm=True)
    saved = client.get(URL, headers=admin).json()[0]
    assert saved["difficulty"] == "medium" and saved["status"] == "draft"


def test_paper_topic_and_letters_are_matched_ignoring_capitals_and_spaces(client, admin):
    row = good_row(Paper="  physics ", Topic="OPTICS", Correct=" b ", Difficulty="EASY")
    assert post(client, admin, workbook([row]), confirm=True).json()["imported"] == 1


def test_every_problem_names_its_row_and_column(client, admin):
    rows = [
        good_row(),
        good_row(Paper="Magic"),
        good_row(Topic="Ratios", Question="Q3"),
        good_row(Question="", **{"Why C": ""}),
        good_row(Correct="E", Question="Q5"),
        good_row(**{"Option D": "red"}, Question="Q6"),
        good_row(Difficulty="insane", Status="live", Question="Q7"),
    ]
    result = post(client, admin, workbook(rows)).json()
    by_row = {p["row"]: p["errors"] for p in result["problems"]}
    assert [r["row"] for r in result["ready"]] == [2]
    assert by_row[3] == {"Paper": "Choose a paper from the list."}
    assert by_row[4] == {"Topic": "Not a topic of Physics."}
    assert set(by_row[5]) == {"Question", "Why C"}
    assert by_row[6] == {"Correct": "Choose which option is correct."}
    assert "same" in by_row[7]["Options"]
    assert set(by_row[8]) == {"Difficulty", "Status"}


def test_blank_papers_and_topics_are_asked_for(client, admin):
    by_row = {p["row"]: p["errors"] for p in post(client, admin, workbook([good_row(Paper=""), good_row(Topic="", Question="Q2")])).json()["problems"]}
    assert by_row[2] == {"Paper": "Paper is required."}
    assert by_row[3] == {"Topic": "Topic is required."}


def test_confirming_saves_the_good_rows_and_skips_the_bad_ones(client, admin):
    rows = [good_row(), good_row(Paper="Magic", Question="Bad"), good_row(Question="Fine too")]
    result = post(client, admin, workbook(rows), confirm=True).json()
    assert result["imported"] == 2 and len(result["problems"]) == 1
    assert sorted(q["text"] for q in client.get(URL, headers=admin).json()) == ["Fine too", "Which colour bends the most?"]


def test_a_question_already_in_the_bank_is_a_duplicate_so_uploading_twice_is_harmless(client, admin):
    content = workbook([good_row(), good_row(Question="Another")])
    assert post(client, admin, content, confirm=True).json()["imported"] == 2
    again = post(client, admin, content, confirm=True).json()
    assert again["imported"] == 0 and len(again["duplicates"]) == 2 and again["ready"] == []
    assert len(client.get(URL, headers=admin).json()) == 2


def test_the_same_question_twice_in_one_file_is_imported_once(client, admin):
    result = post(client, admin, workbook([good_row(), good_row(Question="  WHICH colour bends   the most? ")]), confirm=True).json()
    assert result["imported"] == 1 and [d["row"] for d in result["duplicates"]] == [3]


def test_the_same_wording_in_another_topic_is_not_a_duplicate(client, admin):
    result = post(client, admin, workbook([good_row(), good_row(Topic="Magnetism")]), confirm=True).json()
    assert result["imported"] == 2


def test_blank_rows_are_ignored_and_numbers_stay_with_the_sheet(client, admin):
    result = post(client, admin, workbook([good_row(), {}, good_row(Paper="Magic")])).json()
    assert [r["row"] for r in result["ready"]] == [2] and result["problems"][0]["row"] == 4


def test_hindi_text_and_numbers_in_cells_survive(client, admin):
    row = good_row(Paper="Hindi", Topic="Grammar", Question="सही वर्तनी चुनिए।", **{"Option A": 1, "Option B": 2.0, "Option C": 3, "Option D": 4})
    assert post(client, admin, workbook([row]), confirm=True).json()["imported"] == 1
    saved = client.get(URL, headers=admin).json()[0]
    assert saved["text"] == "सही वर्तनी चुनिए।" and [o["text"] for o in saved["options"]] == ["1", "2", "3", "4"]


# ---- Files that can't be read ----

@pytest.mark.parametrize("content,message", [
    (b"just text", "isn't an Excel"),
    (b"PK\x03\x04not really a zip", "readable Excel"),
    (b"", "isn't an Excel"),
    (b"PK" + b"x" * (qi.MAX_BYTES + 1), "too big"),
])
def test_files_that_are_not_real_workbooks_are_refused(client, admin, content, message):
    response = post(client, admin, content)
    assert response.status_code == 422 and message in response.json()["detail"]


def test_a_workbook_without_the_questions_sheet_is_refused(client, admin):
    response = post(client, admin, workbook([good_row()], sheet="Sheet1"))
    assert response.status_code == 422 and "no sheet called 'Questions'" in response.json()["detail"]


def test_changed_column_headings_are_refused(client, admin):
    columns = ["Subject"] + qi.COLUMNS[1:]
    response = post(client, admin, workbook([], columns=columns))
    assert response.status_code == 422 and "column headings" in response.json()["detail"]


def test_extra_columns_after_the_template_columns_are_ignored(client, admin):
    columns = qi.COLUMNS + ["My notes"]
    assert post(client, admin, workbook([{**good_row(), "My notes": "hi"}], columns=columns)).json()["ready"][0]["row"] == 2


def test_too_many_rows_are_refused(client, admin):
    rows = [good_row(Question=f"Question {n}") for n in range(qi.MAX_ROWS + 1)]
    response = post(client, admin, workbook(rows))
    assert response.status_code == 422 and "at most 500" in response.json()["detail"]


def test_exactly_the_maximum_is_accepted(client, admin):
    rows = [good_row(Question=f"Question {n}") for n in range(qi.MAX_ROWS)]
    assert len(post(client, admin, workbook(rows)).json()["ready"]) == qi.MAX_ROWS


# ---- Privacy ----

def test_an_upload_only_goes_into_the_admins_own_institute(client, admin, make_tenant, sign_in):
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    post(client, admin, workbook([good_row()]), confirm=True)
    assert client.get(URL, headers=other).json() == []
    result = post(client, other, workbook([good_row()]), confirm=True).json()
    assert result["imported"] == 1 and result["duplicates"] == []


# ---- Pictures named in the sheet ----

PIC_COLUMNS = qi.COLUMNS + list(qi.PICTURE_COLUMNS.values())


def stage(client, admin, repo, name="circuit1.png", body=PNG, finish=True) -> str:
    """The admin's picture step: upload a picture by itself, before the Excel file."""
    started = client.post("/api/admin/question-images", json={"filename": name, "size": len(body)}, headers=admin).json()
    image = repo.scoped("aaptprep").get_image(started["id"])
    client.app.state.storage.s3.put_object(Bucket=BUCKET, Key=image["key"], Body=body)
    if finish:
        assert client.post(f"/api/admin/question-images/{started['id']}/complete", headers=admin).status_code == 200
    return started["id"]


def pic_book(rows: list[dict]) -> bytes:
    return workbook(rows, columns=PIC_COLUMNS)


def test_the_template_has_the_five_optional_picture_columns(client, admin):
    book = load_workbook(BytesIO(client.get(f"{URL}/template", headers=admin).content))
    assert [c.value for c in book["Questions"][1]][14:19] == ["Question image", "Image A", "Image B", "Image C", "Image D"]
    assert "Pictures (optional)" in "".join(str(c.value) for row in book["Instructions"].iter_rows() for c in row)


def test_a_picture_named_in_the_sheet_is_found_and_attached_on_import(client, admin, repo):
    q_id, b_id = stage(client, admin, repo, "Circuit1.PNG"), stage(client, admin, repo, "b.png")
    rows = [good_row(**{"Question image": " circuit1.png ", "Image B": "b.png"})]
    preview = post(client, admin, pic_book(rows)).json()
    assert preview["problems"] == [] and preview["ready"][0]["pictures"] == 2
    assert client.get(URL, headers=admin).json() == []

    assert post(client, admin, pic_book(rows), confirm=True).json()["imported"] == 1
    saved = client.get(URL, headers=admin).json()[0]
    assert saved["images"]["question"]["id"] == q_id and saved["images"]["B"]["id"] == b_id
    assert repo.scoped("aaptprep").get_image(q_id)["question_id"] == saved["id"]


def test_names_are_matched_ignoring_capitals_spaces_and_folders(client, admin, repo):
    stage(client, admin, repo, "diagram.png")
    row = good_row(**{"Question image": "C:\\Users\\me\\Pictures\\DIAGRAM.png"})
    assert post(client, admin, pic_book([row]), confirm=True).json()["imported"] == 1


def test_a_picture_that_was_not_uploaded_is_a_problem_in_its_column(client, admin, repo):
    result = post(client, admin, pic_book([good_row(**{"Image C": "missing.png"})])).json()
    assert result["ready"] == []
    assert result["problems"] == [{"row": 2, "errors": {"Image C": "The picture 'missing.png' hasn't been uploaded."}}]


def test_a_picture_that_was_started_but_not_finished_does_not_count(client, admin, repo):
    stage(client, admin, repo, "half.png", finish=False)
    errors = post(client, admin, pic_book([good_row(**{"Question image": "half.png"})])).json()["problems"][0]["errors"]
    assert "hasn't been uploaded" in errors["Question image"]


def test_a_picture_can_only_go_on_one_question_in_a_file(client, admin, repo):
    stage(client, admin, repo, "shared.png")
    rows = [good_row(**{"Question image": "shared.png"}), good_row(Question="Second?", **{"Image A": "shared.png"})]
    result = post(client, admin, pic_book(rows)).json()
    assert [r["row"] for r in result["ready"]] == [2]
    assert "already used by row 2" in result["problems"][0]["errors"]["Image A"]


def test_the_newest_of_two_pictures_with_the_same_name_is_used(client, admin, repo, fake_clock):
    stage(client, admin, repo, "same.png")
    fake_clock.advance(5)
    newer = stage(client, admin, repo, "same.png")
    # created_at comes from the real clock in now_iso, so make the second one clearly newer
    repo.scoped("aaptprep").table.update_item(
        Key=repo.scoped("aaptprep")._image_key(newer), UpdateExpression="SET created_at = :c", ExpressionAttributeValues={":c": "2999-01-01"}
    )
    post(client, admin, pic_book([good_row(**{"Question image": "same.png"})]), confirm=True)
    assert client.get(URL, headers=admin).json()[0]["images"]["question"]["id"] == newer


def test_a_picture_only_option_may_have_empty_text_in_the_sheet(client, admin, repo):
    stage(client, admin, repo, "opt.png")
    row = good_row(**{"Option A": "", "Image A": "opt.png"})
    assert post(client, admin, pic_book([row]), confirm=True).json()["imported"] == 1
    assert client.get(URL, headers=admin).json()[0]["options"][0]["text"] == ""


def test_an_empty_option_without_a_picture_is_still_a_problem(client, admin):
    errors = post(client, admin, pic_book([good_row(**{"Option A": ""})])).json()["problems"][0]["errors"]
    assert errors == {"Option A": "Option 1 is required."}


def test_a_picture_for_a_row_that_is_already_in_the_bank_is_not_a_problem_the_second_time(client, admin, repo):
    stage(client, admin, repo, "once.png")
    rows = [good_row(**{"Question image": "once.png"})]
    assert post(client, admin, pic_book(rows), confirm=True).json()["imported"] == 1
    again = post(client, admin, pic_book(rows), confirm=True).json()
    assert again["imported"] == 0 and len(again["duplicates"]) == 1 and again["problems"] == []


def test_a_picture_belonging_to_another_institute_cannot_be_named(client, admin, repo, make_tenant, sign_in):
    stage(client, admin, repo, "private.png")
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    result = post(client, other, pic_book([good_row(**{"Question image": "private.png"})])).json()
    assert result["ready"] == [] and "hasn't been uploaded" in result["problems"][0]["errors"]["Question image"]


def test_a_picture_taken_between_preview_and_import_is_reported_not_crashed(client, admin, repo, monkeypatch):
    stage(client, admin, repo, "race.png")
    from app import questions

    def taken(scoped, data, email):
        raise questions.QuestionErrors({"images": "A picture isn't ready or is already used. Upload it again."})

    monkeypatch.setattr(questions, "create_question", taken)
    result = post(client, admin, pic_book([good_row(**{"Question image": "race.png"})]), confirm=True).json()
    assert result["imported"] == 0 and result["ready"] == []
    assert result["problems"][0]["errors"]["Pictures"].startswith("A picture isn't ready")


def test_a_sheet_without_the_picture_columns_still_works(client, admin):
    assert post(client, admin, workbook([good_row()]), confirm=True).json()["imported"] == 1


def test_a_blank_picture_cell_means_no_picture(client, admin):
    assert post(client, admin, pic_book([good_row(**{"Question image": None, "Image A": ""})]), confirm=True).json()["imported"] == 1
    assert client.get(URL, headers=admin).json()[0]["images"] == {}
