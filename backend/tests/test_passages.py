"""Reading passages: saved once, shared by many questions; the API, the link from a question, and the Excel upload."""
from io import BytesIO

import pytest
from openpyxl import Workbook, load_workbook

from app import question_import as qi
from conftest import headers
from test_question_import import good_row, post
from test_questions import URL, admin, question, school  # noqa: F401

PASSAGES = "/api/admin/passages"
TEXT = "The monsoon arrives in June.\n\nFarmers sow rice soon after."


def passage(client, admin, title="Monsoon", text=TEXT):
    response = client.post(PASSAGES, json={"title": title, "text": text}, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


def book_with(rows, passages=()):
    book = Workbook()
    page = book.active
    page.title = "Questions"
    cols = qi.COLUMNS + qi.OPTIONAL_COLUMNS
    page.append(cols)
    for row in rows:
        page.append([row.get(name) for name in cols])
    sheet = book.create_sheet("Passages")
    sheet.append(["Title", "Text"])
    for title, text in passages:
        sheet.append([title, text])
    out = BytesIO()
    book.save(out)
    return out.getvalue()


def bank(client, admin):
    return client.get(URL, headers=admin).json()


# ---- The API ----

def test_a_passage_is_saved_with_its_paragraphs_and_listed_by_title(client, admin):
    passage(client, admin, "Zebra story", "Z text")
    made = passage(client, admin)
    assert made["text"] == TEXT and made["questions"] == 0
    assert [p["title"] for p in client.get(PASSAGES, headers=admin).json()] == ["Monsoon", "Zebra story"]


def test_mistakes_are_reported_together(client, admin):
    response = client.post(PASSAGES, json={"title": " ", "text": ""}, headers=admin)
    assert response.status_code == 422
    assert set(response.json()["errors"]) == {"title", "text"}


def test_limits_on_title_and_text(client, admin):
    assert "title" in client.post(PASSAGES, json={"title": "x" * 151, "text": "a"}, headers=admin).json()["errors"]
    assert client.post(PASSAGES, json={"title": "ok", "text": "x" * 5000}, headers=admin).status_code == 201
    assert "text" in client.post(PASSAGES, json={"title": "two", "text": "x" * 5001}, headers=admin).json()["errors"]


def test_titles_are_unique_ignoring_capitals_and_spaces(client, admin):
    passage(client, admin, "Monsoon")
    response = client.post(PASSAGES, json={"title": "  monsoon ", "text": "other"}, headers=admin)
    assert response.status_code == 422 and "title" in response.json()["errors"]


def test_editing_changes_the_text_for_every_question(client, admin):
    p = passage(client, admin)
    ids = [client.post(URL, json=question(text=f"Q{i}", passage=p["id"]), headers=admin).json()["id"] for i in range(2)]
    edited = client.patch(f"{PASSAGES}/{p['id']}", json={"text": "Fixed text."}, headers=admin)
    assert edited.status_code == 200 and edited.json()["text"] == "Fixed text." and edited.json()["questions"] == 2
    assert {q["id"] for q in bank(client, admin) if q["passage"] == p["id"]} == set(ids)


def test_renaming_keeps_the_title_unique_and_the_list_in_order(client, admin):
    a, b = passage(client, admin, "Alpha"), passage(client, admin, "Beta")
    assert client.patch(f"{PASSAGES}/{b['id']}", json={"title": "alpha"}, headers=admin).status_code == 422
    assert client.patch(f"{PASSAGES}/{a['id']}", json={"title": "Alpha"}, headers=admin).status_code == 200
    client.patch(f"{PASSAGES}/{a['id']}", json={"title": "Zulu"}, headers=admin)
    assert [p["title"] for p in client.get(PASSAGES, headers=admin).json()] == ["Beta", "Zulu"]


def test_a_passage_in_use_cannot_be_deleted_but_a_free_one_can(client, admin):
    p = passage(client, admin)
    q = client.post(URL, json=question(passage=p["id"]), headers=admin).json()
    response = client.delete(f"{PASSAGES}/{p['id']}", headers=admin)
    assert response.status_code == 409 and "1 question uses" in response.json()["detail"]
    client.delete(f"{URL}/{q['id']}", headers=admin)
    assert client.delete(f"{PASSAGES}/{p['id']}", headers=admin).status_code == 204
    assert client.delete(f"{PASSAGES}/{p['id']}", headers=admin).status_code == 404
    assert client.patch(f"{PASSAGES}/{p['id']}", json={"title": "x"}, headers=admin).status_code == 404


# ---- Questions and passages ----

def test_a_question_can_point_to_a_passage_and_the_list_can_filter_on_it(client, admin):
    p = passage(client, admin)
    a = client.post(URL, json=question(text="With", passage=p["id"]), headers=admin).json()
    client.post(URL, json=question(text="Without"), headers=admin)
    assert a["passage"] == p["id"]
    assert [q["text"] for q in client.get(f"{URL}?passage={p['id']}", headers=admin).json()] == ["With"]
    assert [q["text"] for q in client.get(f"{URL}?passage=none", headers=admin).json()] == ["Without"]


def test_an_unknown_passage_is_refused_next_to_the_field(client, admin):
    for bad in ("nope", 5, True):
        response = client.post(URL, json=question(passage=bad), headers=admin)
        assert response.status_code == 422, bad
        assert "passage" in response.json()["errors"]


def test_a_question_can_move_to_another_passage_or_leave_it(client, admin):
    a, b = passage(client, admin, "A"), passage(client, admin, "B")
    q = client.post(URL, json=question(passage=a["id"]), headers=admin).json()
    assert client.patch(f"{URL}/{q['id']}", json={"text": "New wording?"}, headers=admin).json()["passage"] == a["id"]
    assert client.patch(f"{URL}/{q['id']}", json={"passage": b["id"]}, headers=admin).json()["passage"] == b["id"]
    assert client.patch(f"{URL}/{q['id']}", json={"passage": ""}, headers=admin).json()["passage"] is None


def test_a_question_without_a_passage_is_as_before(client, admin):
    assert client.post(URL, json=question(), headers=admin).json()["passage"] is None


# ---- Privacy ----

def test_passages_are_private_to_their_institute(client, admin, make_tenant, sign_in):
    p = passage(client, admin)
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    assert client.get(PASSAGES, headers=other).json() == []
    assert client.patch(f"{PASSAGES}/{p['id']}", json={"title": "x"}, headers=other).status_code == 404
    assert client.delete(f"{PASSAGES}/{p['id']}", headers=other).status_code == 404
    assert client.post(URL, json=question(passage=p["id"]), headers=other).status_code == 422
    passage(client, other, "Monsoon")  # the same title is fine in another institute


def test_only_an_admin_can_use_passages(client, admin, sign_in):
    p = passage(client, admin)
    student = sign_in("aaptprep", "asha@example.com")
    for method, path, body in (("get", PASSAGES, None), ("post", PASSAGES, {"title": "x", "text": "y"}),
                               ("patch", f"{PASSAGES}/{p['id']}", {"title": "x"}), ("delete", f"{PASSAGES}/{p['id']}", None)):
        assert client.request(method, path, json=body, headers=headers("aaptprep")).status_code == 401, path
        assert client.request(method, path, json=body, headers=student).status_code == 403, path


# ---- The Excel file ----

def test_the_template_has_a_passages_sheet_and_a_passage_column(client, admin):
    book = load_workbook(BytesIO(client.get(f"{URL}/template", headers=admin).content))
    assert "Passages" in book.sheetnames
    assert [c.value for c in book["Passages"][1]] == ["Title", "Text"]
    assert book["Questions"].cell(row=1, column=len(qi.COLUMNS) + len(qi.OPTIONAL_COLUMNS)).value == "Passage"
    assert "Reading passages" in "".join(str(c.value) for row in book["Instructions"].iter_rows() for c in row)


def test_questions_naming_a_passage_share_one_saved_passage(client, admin):
    rows = [good_row(Question=f"Question {i}", Passage="Monsoon") for i in range(3)] + [good_row(Question="No passage")]
    content = book_with(rows, [("Monsoon", TEXT)])
    preview = post(client, admin, content).json()
    assert preview["new_passages"] == 1 and [r["passage"] for r in preview["ready"]] == ["Monsoon"] * 3 + [None]
    assert client.get(PASSAGES, headers=admin).json() == []  # a preview saves nothing

    assert post(client, admin, content, confirm=True).json()["imported"] == 4
    saved = client.get(PASSAGES, headers=admin).json()
    assert len(saved) == 1 and saved[0]["text"] == TEXT and saved[0]["questions"] == 3
    assert sum(1 for q in bank(client, admin) if q["passage"] == saved[0]["id"]) == 3


def test_a_passage_already_in_the_bank_is_reused_without_repeating_its_text(client, admin):
    p = passage(client, admin)
    result = post(client, admin, book_with([good_row(Passage="monsoon")]), confirm=True).json()
    assert result["imported"] == 1 and result["new_passages"] == 0
    assert bank(client, admin)[0]["passage"] == p["id"] and len(client.get(PASSAGES, headers=admin).json()) == 1


def test_the_same_file_twice_adds_nothing_new(client, admin):
    content = book_with([good_row(Passage="Monsoon")], [("Monsoon", TEXT)])
    post(client, admin, content, confirm=True)
    again = post(client, admin, content, confirm=True).json()
    assert again["imported"] == 0 and len(again["duplicates"]) == 1
    assert len(client.get(PASSAGES, headers=admin).json()) == 1


def test_a_title_that_exists_with_different_text_is_refused_not_overwritten(client, admin):
    passage(client, admin)
    result = post(client, admin, book_with([good_row(Passage="Monsoon")], [("Monsoon", "Something else entirely.")])).json()
    assert result["ready"] == [] and "different text" in result["problems"][0]["errors"]["Passage"]
    assert client.get(PASSAGES, headers=admin).json()[0]["text"] == TEXT


def test_an_unknown_title_is_a_problem_on_the_passage_column(client, admin):
    result = post(client, admin, book_with([good_row(Passage="Nowhere")], [("Monsoon", TEXT)])).json()
    assert "isn't on the Passages sheet" in result["problems"][0]["errors"]["Passage"]


def test_a_bad_passage_row_is_reported_on_the_question_using_it(client, admin):
    result = post(client, admin, book_with([good_row(Passage="Empty")], [("Empty", "")])).json()
    assert "Passages sheet row 2" in result["problems"][0]["errors"]["Passage"]
    too_long = post(client, admin, book_with([good_row(Passage="Long")], [("Long", "x" * 5001)])).json()
    assert "5000" in too_long["problems"][0]["errors"]["Passage"]


def test_a_title_listed_twice_on_the_sheet_is_refused_when_used(client, admin):
    result = post(client, admin, book_with([good_row(Passage="Dup")], [("Dup", "a"), ("dup", "b")])).json()
    assert "more than once" in result["problems"][0]["errors"]["Passage"]


def test_a_passage_nobody_uses_is_not_saved_and_a_bad_question_does_not_create_one(client, admin):
    rows = [good_row(Passage="Used"), good_row(Question="Bad", Passage="OnlyForBad", Correct="Z")]
    post(client, admin, book_with(rows, [("Used", "u"), ("OnlyForBad", "b"), ("Unused", "n")]), confirm=True)
    assert [p["title"] for p in client.get(PASSAGES, headers=admin).json()] == ["Used"]


def test_an_older_file_without_the_passage_column_or_sheet_still_works(client, admin):
    from test_question_import import workbook
    assert post(client, admin, workbook([good_row()]), confirm=True).json()["imported"] == 1


def test_a_changed_passages_heading_is_refused(client, admin):
    book = Workbook()
    page = book.active
    page.title = "Questions"
    page.append(qi.COLUMNS)
    page.append([good_row().get(n) for n in qi.COLUMNS])
    book.create_sheet("Passages").append(["Name", "Body"])
    out = BytesIO()
    book.save(out)
    assert post(client, admin, out.getvalue()).status_code == 422
