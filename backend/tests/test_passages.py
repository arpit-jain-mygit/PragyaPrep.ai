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
    free = passage(client, admin, "Free one", "Nobody uses this.")
    assert client.delete(f"{PASSAGES}/{free['id']}", headers=admin).status_code == 204
    assert client.delete(f"{PASSAGES}/{free['id']}", headers=admin).status_code == 404
    assert client.patch(f"{PASSAGES}/{free['id']}", json={"title": "x"}, headers=admin).status_code == 404
    assert q["passage"] == p["id"]


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

def test_the_template_has_a_passage_column_for_the_text_and_no_passages_sheet(client, admin):
    book = load_workbook(BytesIO(client.get(f"{URL}/template", headers=admin).content))
    assert "Passages" not in book.sheetnames
    assert book["Questions"].cell(row=1, column=len(qi.COLUMNS) + len(qi.OPTIONAL_COLUMNS)).value == "Passage"
    guide = "".join(str(c.value) for row in book["Instructions"].iter_rows() for c in row)
    assert "Reading passages" in guide and "repeating it on each row" in guide


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


def test_a_passage_cell_that_is_not_a_known_title_is_the_passage_text(client, admin):
    result = post(client, admin, book_with([good_row(Passage="Some words that are not a title")], [("Monsoon", TEXT)]), confirm=True).json()
    assert result["imported"] == 1 and result["problems"] == []
    assert client.get(PASSAGES, headers=admin).json()[0]["text"] == "Some words that are not a title"


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


# ---- Passage text pasted on the question ----

def test_questions_with_the_same_text_share_one_passage_and_the_title_is_automatic(client, admin):
    ids = []
    for i in range(3):
        made = client.post(URL, json=question(text=f"Q{i}", passage_text=TEXT), headers=admin).json()
        ids.append(made["passage"])
    assert len(set(ids)) == 1 and ids[0]
    saved = client.get(PASSAGES, headers=admin).json()
    assert len(saved) == 1 and saved[0]["text"] == TEXT and saved[0]["questions"] == 3
    assert saved[0]["title"].startswith("The monsoon arrives in June.")


def test_capitals_and_spacing_do_not_split_a_group(client, admin):
    a = client.post(URL, json=question(text="A", passage_text="The  MONSOON arrives."), headers=admin).json()
    b = client.post(URL, json=question(text="B", passage_text="the monsoon   arrives."), headers=admin).json()
    assert a["passage"] == b["passage"]


def test_different_text_makes_a_separate_group(client, admin):
    a = client.post(URL, json=question(text="A", passage_text="One text."), headers=admin).json()
    b = client.post(URL, json=question(text="B", passage_text="Another text."), headers=admin).json()
    assert a["passage"] != b["passage"] and len(client.get(PASSAGES, headers=admin).json()) == 2


def test_empty_passage_text_means_no_passage(client, admin):
    assert client.post(URL, json=question(passage_text="  "), headers=admin).json()["passage"] is None
    assert client.get(PASSAGES, headers=admin).json() == []


def test_a_question_with_mistakes_does_not_leave_a_passage_behind(client, admin):
    response = client.post(URL, json=question(text="", passage_text=TEXT), headers=admin)
    assert response.status_code == 422 and client.get(PASSAGES, headers=admin).json() == []


@pytest.mark.parametrize("bad", [5, True, ["x"], "x" * 5001])
def test_bad_passage_text_is_refused_next_to_the_field(client, admin, bad):
    response = client.post(URL, json=question(passage_text=bad), headers=admin)
    assert response.status_code == 422 and "passage" in response.json()["errors"]


def test_editing_the_text_of_one_question_moves_only_that_question(client, admin):
    a = client.post(URL, json=question(text="A", passage_text="Shared."), headers=admin).json()
    b = client.post(URL, json=question(text="B", passage_text="Shared."), headers=admin).json()
    moved = client.patch(f"{URL}/{b['id']}", json={"passage_text": "Different."}, headers=admin).json()
    assert moved["passage"] != a["passage"]
    still = [q for q in client.get(URL, headers=admin).json() if q["id"] == a["id"]][0]
    assert still["passage"] == a["passage"]
    assert sorted(p["text"] for p in client.get(PASSAGES, headers=admin).json()) == ["Different.", "Shared."]


def test_other_edits_keep_the_passage_and_empty_text_removes_it(client, admin):
    made = client.post(URL, json=question(passage_text="Keep me."), headers=admin).json()
    assert client.patch(f"{URL}/{made['id']}", json={"text": "New wording?"}, headers=admin).json()["passage"] == made["passage"]
    assert client.patch(f"{URL}/{made['id']}", json={"passage_text": ""}, headers=admin).json()["passage"] is None


def test_a_passage_no_question_uses_any_more_is_removed(client, admin):
    a = client.post(URL, json=question(text="A", passage_text="Only A."), headers=admin).json()
    b = client.post(URL, json=question(text="B", passage_text="Only A."), headers=admin).json()
    client.delete(f"{URL}/{a['id']}", headers=admin)
    assert len(client.get(PASSAGES, headers=admin).json()) == 1  # B still uses it
    client.patch(f"{URL}/{b['id']}", json={"passage_text": "Now B's own."}, headers=admin)
    assert [p["text"] for p in client.get(PASSAGES, headers=admin).json()] == ["Now B's own."]
    client.post(f"{URL}/delete", json={"ids": [b["id"]], "confirm": "DELETE"}, headers=admin)
    assert client.get(PASSAGES, headers=admin).json() == []


def test_editing_a_passage_changes_every_question_in_its_group(client, admin):
    a = client.post(URL, json=question(text="A", passage_text="Old text."), headers=admin).json()
    client.post(URL, json=question(text="B", passage_text="Old text."), headers=admin)
    client.patch(f"{PASSAGES}/{a['passage']}", json={"text": "New text."}, headers=admin)
    assert {client.get(PASSAGES, headers=admin).json()[0]["text"]} == {"New text."}
    assert client.get(PASSAGES, headers=admin).json()[0]["questions"] == 2


def test_the_list_can_filter_on_having_a_passage(client, admin):
    client.post(URL, json=question(text="With", passage_text=TEXT), headers=admin)
    client.post(URL, json=question(text="Without"), headers=admin)
    assert [q["text"] for q in client.get(f"{URL}?passage=any", headers=admin).json()] == ["With"]


def test_passage_text_is_private_to_the_institute(client, admin, make_tenant, sign_in):
    client.post(URL, json=question(passage_text=TEXT), headers=admin)
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    made = client.post(URL, json=question(passage_text=TEXT), headers=other).json()
    assert client.get(PASSAGES, headers=other).json()[0]["id"] == made["passage"]
    assert len(client.get(PASSAGES, headers=admin).json()) == 1


# ---- Excel: the text repeated on each row ----

def test_excel_rows_with_the_same_passage_text_share_one_passage(client, admin):
    rows = [good_row(Question=f"Question {i}", Passage=TEXT) for i in range(3)] + [good_row(Question="Plain")]
    preview = post(client, admin, book_with(rows)).json()
    assert preview["new_passages"] == 1 and len(preview["ready"]) == 4
    assert client.get(PASSAGES, headers=admin).json() == []
    assert post(client, admin, book_with(rows), confirm=True).json()["imported"] == 4
    saved = client.get(PASSAGES, headers=admin).json()
    assert len(saved) == 1 and saved[0]["questions"] == 3 and saved[0]["text"] == TEXT


def test_excel_passage_text_matching_a_saved_passage_is_reused(client, admin):
    p = passage(client, admin)
    result = post(client, admin, book_with([good_row(Passage="  THE MONSOON arrives in June.\n\nFarmers sow rice soon after.")]), confirm=True).json()
    assert result["imported"] == 1 and result["new_passages"] == 0
    assert bank(client, admin)[0]["passage"] == p["id"]


def test_excel_passage_text_that_is_too_long_is_a_problem_on_its_column(client, admin):
    result = post(client, admin, book_with([good_row(Passage="x" * 5001)])).json()
    assert "5000" in result["problems"][0]["errors"]["Passage"]


def test_excel_a_bad_row_does_not_create_its_passage(client, admin):
    post(client, admin, book_with([good_row(Passage="Only for a bad row.", Correct="Z")]), confirm=True)
    assert client.get(PASSAGES, headers=admin).json() == []


def test_every_question_comes_back_with_its_passage_text(client, admin):
    made = client.post(URL, json=question(text="A", passage_text=TEXT), headers=admin).json()
    assert made["passage_text"] == TEXT
    plain = client.post(URL, json=question(text="B"), headers=admin).json()
    assert plain["passage_text"] is None
    listed = {q["text"]: q["passage_text"] for q in client.get(URL, headers=admin).json()}
    assert listed == {"A": TEXT, "B": None}
    edited = client.patch(f"{URL}/{plain['id']}", json={"passage_text": "Other."}, headers=admin).json()
    assert edited["passage_text"] == "Other."
    client.patch(f"{PASSAGES}/{made['passage']}", json={"text": "Fixed."}, headers=admin)
    assert {q["text"]: q["passage_text"] for q in client.get(URL, headers=admin).json()}["A"] == "Fixed."
