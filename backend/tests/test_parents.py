"""Parents: the admin adds them (one by one or from a sheet) and links them to students; they sign in like anyone else."""
from io import BytesIO

import pytest
from openpyxl import Workbook, load_workbook

from app import parent_import
from conftest import headers

PARENTS = "/api/admin/parents"


@pytest.fixture
def school(make_tenant, add_member, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")
    add_member("aaptprep", "ravi@example.com")
    return {"cat": add_course("aaptprep", "CAT")}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


def body(**extra):
    return {"first_name": "Meena", "last_name": "Rao", "email": "meena@example.com", "mobile": "9876543210", "student_email": "asha@example.com", **extra}


def add(client, admin, **extra):
    return client.post(PARENTS, json=body(**extra), headers=admin)


def test_only_the_admin_can_use_it(client, school, admin, sign_in):
    student = sign_in("aaptprep", "asha@example.com")
    for call in (lambda h: client.get(PARENTS, headers=h), lambda h: client.post(PARENTS, json=body(), headers=h), lambda h: client.get(PARENTS + "/template", headers=h),
                 lambda h: client.post(PARENTS + "/import", content=b"x", headers=h), lambda h: client.delete(PARENTS + "/x@y.com", headers=h)):
        assert call(headers("aaptprep")).status_code == 401
        assert call(student).status_code == 403


def test_adding_a_parent_links_the_student_and_emails_a_welcome(client, admin, mailer):
    before = len(mailer.sent)
    response = add(client, admin)
    assert response.status_code == 201
    assert response.json() == [{"email": "meena@example.com", "name": "Meena Rao", "mobile": "9876543210", "children": [{"email": "asha@example.com", "name": "Asha Rao"}], "created_at": response.json()[0]["created_at"]}]
    mail = mailer.sent[before:][0]
    assert mail.to == "meena@example.com" and "parent of" in mail.body and "/aaptprep/login" in mail.body


def test_a_second_child_is_added_to_the_same_parent_and_a_repeat_is_refused(client, admin):
    add(client, admin)
    two = add(client, admin, student_email="ravi@example.com").json()
    assert [c["email"] for c in two[0]["children"]] == ["asha@example.com", "ravi@example.com"]
    again = add(client, admin, student_email="ravi@example.com")
    assert again.status_code == 422 and "already linked" in again.json()["detail"]


def test_every_mistake_is_reported_at_once(client, admin):
    response = client.post(PARENTS, json={"first_name": "", "last_name": "R", "email": "nope", "mobile": "12", "student_email": "ghost@example.com"}, headers=admin)
    assert response.status_code == 422
    assert set(response.json()["errors"]) == {"first_name", "email", "mobile", "student_email"}
    assert "no student" in response.json()["errors"]["student_email"].lower()


def test_an_email_that_belongs_to_a_student_or_the_admin_cannot_be_a_parent(client, admin):
    taken = add(client, admin, email="ravi@example.com")
    assert taken.status_code == 422 and "already registered here as a student" in taken.json()["detail"]
    assert "email" in add(client, admin, email="ritesh@example.com").json()["errors"]


def test_a_parent_signs_in_with_a_code_and_gets_the_parent_role(client, admin, sign_in):
    add(client, admin)
    token = sign_in("aaptprep", "meena@example.com")
    assert token["Authorization"]


def test_parents_are_not_counted_as_students(client, admin):
    add(client, admin)
    assert client.get("/api/admin/registrations?status=approved", headers=admin).json() and all(r["email"] != "meena@example.com" for r in client.get("/api/admin/registrations?status=approved", headers=admin).json())
    assert client.get("/api/admin/home", headers=admin).json()["students"] == 2


def test_listing_removing_and_unlinking(client, admin):
    add(client, admin)
    add(client, admin, student_email="ravi@example.com")
    assert [p["email"] for p in client.get(PARENTS, headers=admin).json()] == ["meena@example.com"]
    after = client.delete(f"{PARENTS}/meena@example.com/children/asha@example.com", headers=admin).json()
    assert [c["email"] for c in after[0]["children"]] == ["ravi@example.com"]
    assert client.delete(f"{PARENTS}/meena@example.com/children/asha@example.com", headers=admin).status_code == 404
    assert client.delete(f"{PARENTS}/meena@example.com", headers=admin).json() == []
    assert client.delete(f"{PARENTS}/meena@example.com", headers=admin).status_code == 404
    assert client.delete(f"{PARENTS}/asha@example.com", headers=admin).status_code == 404  # a student is not a parent


def test_the_students_new_email_is_followed_by_the_parents_link(client, admin, school):
    add(client, admin)
    edit = client.patch("/api/admin/registrations/asha@example.com", json={"email": "asha.new@example.com", "mobile": "9123456789", "course_ids": [school["cat"]["id"]]}, headers=admin)
    assert edit.status_code == 200, edit.text
    assert [c["email"] for c in client.get(PARENTS, headers=admin).json()[0]["children"]] == ["asha.new@example.com"]


# ---- The Excel sheet ----

def sheet(*rows, headings=parent_import.COLUMNS):
    book = Workbook()
    ws = book.active
    ws.title = parent_import.SHEET
    ws.append(headings)
    for row in rows:
        ws.append(row)
    out = BytesIO()
    book.save(out)
    return out.getvalue()


def upload(client, admin, data, confirm=False):
    return client.post(f"{PARENTS}/import?confirm={'true' if confirm else 'false'}", content=data, headers={**admin, "Content-Type": "application/octet-stream"})


def test_the_template_has_the_sheet_and_the_columns(client, admin):
    response = client.get(PARENTS + "/template", headers=admin)
    assert response.status_code == 200 and "attachment" in response.headers["content-disposition"]
    book = load_workbook(BytesIO(response.content))
    assert [c.value for c in book["Parents"][1]] == parent_import.COLUMNS
    assert "How to fill" in book.sheetnames


def test_a_sheet_is_checked_first_and_nothing_is_saved_until_confirmed(client, admin, mailer):
    data = sheet(["meena@example.com", "Meena", "Rao", "asha@example.com; ravi@example.com", "9876543210"], ["bad", "", "X", "ghost@example.com", "1"])
    before = len(mailer.sent)
    check = upload(client, admin, data).json()
    assert check["summary"] == {"total": 2, "ready": 1, "skipped": 0, "errors": 1} and check["confirmed"] is False
    assert check["rows"][0]["children"] == ["asha@example.com", "ravi@example.com"]
    assert set(check["rows"][1]["problems"]) == {"Email", "First name", "Student email", "Mobile"}
    assert client.get(PARENTS, headers=admin).json() == [] and len(mailer.sent) == before
    done = upload(client, admin, data, confirm=True).json()
    assert done["summary"]["created"] == 1 and done["rows"][0]["status"] == "created"
    assert [c["email"] for c in client.get(PARENTS, headers=admin).json()[0]["children"]] == ["asha@example.com", "ravi@example.com"]
    assert mailer.sent[before:][0].to == "meena@example.com"


def test_an_existing_parent_gets_new_children_and_unchanged_links_are_skipped(client, admin):
    add(client, admin)
    skipped = upload(client, admin, sheet(["meena@example.com", "Meena", "Rao", "asha@example.com", ""])).json()
    assert skipped["rows"][0]["status"] == "skipped"
    linked = upload(client, admin, sheet(["meena@example.com", "Meena", "Rao", "ravi@example.com", ""]), confirm=True).json()
    assert linked["summary"]["linked"] == 1 and linked["summary"]["created"] == 0
    assert len(client.get(PARENTS, headers=admin).json()[0]["children"]) == 2


def test_the_same_parent_twice_in_a_file_and_a_student_email_are_flagged(client, admin):
    check = upload(client, admin, sheet(["a@example.com", "A", "B", "asha@example.com", ""], ["a@example.com", "A", "B", "ravi@example.com", ""], ["ravi@example.com", "R", "S", "asha@example.com", ""])).json()
    assert [r["status"] for r in check["rows"]] == ["ready", "error", "error"]
    assert "row 2" in check["rows"][1]["problems"]["Email"]
    assert "student" in check["rows"][2]["problems"]["Email"]


@pytest.mark.parametrize("data,problem", [
    (b"not excel", "isn't an Excel"), (b"PK" + b"0" * 10, "readable Excel"), (b"x" * (2 * 1024 * 1024 + 1), "too big"),
    (sheet(), "no parents"), (sheet(["a", "b"], headings=["Email", "Nope"]), "headings have changed"),
])
def test_bad_files_are_refused(client, admin, data, problem):
    response = upload(client, admin, data)
    assert response.status_code == 422 and problem in response.json()["detail"]


def test_a_sheet_without_the_parents_tab_is_refused(client, admin):
    book = Workbook()
    book.active.title = "Other"
    out = BytesIO()
    book.save(out)
    assert "no sheet called 'Parents'" in upload(client, admin, out.getvalue()).json()["detail"]


def test_a_welcome_email_failure_does_not_stop_the_import(client, admin, mailer, monkeypatch):
    monkeypatch.setattr(mailer, "send", lambda email: (_ for _ in ()).throw(RuntimeError("down")))
    done = upload(client, admin, sheet(["meena@example.com", "Meena", "Rao", "asha@example.com", ""]), confirm=True).json()
    assert done["summary"]["created"] == 1 and done["summary"]["emailed"] == 0
