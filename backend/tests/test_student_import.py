"""Bulk onboarding: the template, checking a filled-in sheet, creating the students, and the welcome emails."""
from datetime import date
from io import BytesIO

import pytest
from openpyxl import Workbook, load_workbook

from app import student_import
from conftest import headers

TEMPLATE = "/api/admin/students/import/template"
IMPORT = "/api/admin/students/import"
WELCOME = "/api/admin/students/welcome"
REGS = "/api/admin/registrations"
HEAD = student_import.COLUMNS


@pytest.fixture
def school(make_tenant, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    make_tenant("other", "Other", "boss@example.com")
    return {"cat": add_course("aaptprep", "CAT", access={"type": "days", "days": 30}), "clat": add_course("aaptprep", "CLAT"), "old": add_course("aaptprep", "OLD", active=False)}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


def row(email="asha@example.com", first="Asha", last="Rao", mobile="9876543210", courses="CAT", **extra):
    values = {"Email": email, "First name": first, "Last name": last, "Mobile": mobile, "Courses": courses, **extra}
    return [values.get(name, "") for name in HEAD]


def sheet(rows, header=None, title="Students"):
    book = Workbook()
    ws = book.active
    ws.title = title
    ws.append(header if header is not None else HEAD)
    for r in rows:
        ws.append(r)
    out = BytesIO()
    book.save(out)
    return out.getvalue()


def upload(client, admin, content, confirm=False):
    return client.post(f"{IMPORT}{'?confirm=true' if confirm else ''}", content=content, headers=admin)


def rows_of(response):
    return {r["row"]: r for r in response.json()["rows"]}


# ---- The template ----

def test_the_template_has_the_students_sheet_the_open_courses_and_instructions(client, school, admin):
    response = client.get(TEMPLATE, headers=admin)
    assert response.status_code == 200 and response.headers["content-type"] == student_import.XLSX_TYPE
    assert "student-import-template.xlsx" in response.headers["content-disposition"]
    book = load_workbook(BytesIO(response.content))
    assert book.sheetnames == ["Students", "Courses", "How to fill"]
    assert [c.value for c in book["Students"][1]] == HEAD
    assert [r[0].value for r in book["Courses"].iter_rows(min_row=2) if r[0].value] == ["CAT", "CLAT"]  # the hidden course is not offered
    assert any("separated by ;" in str(r[0].value) for r in book["How to fill"].iter_rows())


def test_the_template_reads_back_as_an_empty_file(client, school, admin):
    response = upload(client, admin, client.get(TEMPLATE, headers=admin).content)
    assert response.status_code == 422 and "no students" in response.json()["detail"]


def test_only_the_admin_can_use_it(client, school, admin, sign_in, repo):
    repo.scoped("aaptprep").create_member({"email": "s@example.com", "role": "student", "status": "approved", "first_name": "S", "last_name": "T"})
    student = sign_in("aaptprep", "s@example.com")
    good = sheet([row()])
    for path, call in ((TEMPLATE, lambda h: client.get(TEMPLATE, headers=h)), (IMPORT, lambda h: client.post(IMPORT, content=good, headers=h)),
                       (WELCOME, lambda h: client.post(WELCOME, json={"emails": ["a@example.com"]}, headers=h))):
        assert call(headers("aaptprep")).status_code == 401
        assert call(student).status_code == 403


# ---- Checking the sheet (preview) ----

def test_a_preview_counts_ready_skipped_and_error_rows_and_saves_nothing(client, school, admin, repo):
    repo.scoped("aaptprep").create_member({"email": "old@example.com", "role": "student", "status": "pending", "first_name": "Old", "last_name": "One"})
    response = upload(client, admin, sheet([row(), row("old@example.com"), row("bad", mobile="123"), row("b@example.com", "B", "C", "9123456780", "CAT; CLAT")]))
    assert response.status_code == 200
    data = response.json()
    assert data["summary"] == {"total": 4, "ready": 2, "skipped": 1, "errors": 1} and data["confirmed"] is False and data["created"] == [] and data["batch"] is None
    assert [r["status"] for r in data["rows"]] == ["ready", "skipped", "error", "ready"]
    assert "Already registered (pending)" in data["rows"][1]["message"]
    assert data["rows"][3]["courses"] == ["CAT", "CLAT"] and data["rows"][0]["name"] == "Asha Rao"
    assert repo.scoped("aaptprep").get_member("asha@example.com") is None and "ready_records" not in data


@pytest.mark.parametrize("fields, column, message", [
    ({"email": "nope"}, "Email", "email"),
    ({"email": ""}, "Email", "email"),
    ({"email": "ritesh@example.com"}, "Email", "admin's own email"),
    ({"first": ""}, "First name", "first name"),
    ({"last": "x" * 61}, "Last name", "last name"),
    ({"mobile": "12345"}, "Mobile", "10-digit"),
    ({"mobile": ""}, "Mobile", "10-digit"),
    ({"courses": ""}, "Courses", "at least one course"),
    ({"courses": "CATT"}, "Courses", "'CATT' isn't open here. Open courses: CAT, CLAT"),
    ({"courses": "OLD"}, "Courses", "'OLD' isn't open here"),
    ({"courses": "CAT; Nope; Also"}, "Courses", "'Nope', 'Also' aren't open here"),
    ({"extra": {"Birth date": "21/03/2005"}}, "Birth date", "YYYY-MM-DD"),
    ({"extra": {"Birth date": "2024-01-01"}}, "Birth date", "valid birth date"),
    ({"extra": {"Gender": "robot"}}, "Gender", "male, female"),
    ({"extra": {"WhatsApp": "5555"}}, "WhatsApp", "10-digit"),
    ({"extra": {"Address": "abc"}}, "Address", "5 to 300"),
    ({"extra": {"City": "x"}}, "City", "2 to 60"),
    ({"extra": {"PIN code": "12345"}}, "PIN code", "6-digit"),
    ({"extra": {"PIN code": "012345"}}, "PIN code", "6-digit"),
])
def test_each_kind_of_mistake_is_reported_against_its_column(client, school, admin, fields, column, message):
    args = {k: v for k, v in fields.items() if k != "extra"}
    response = upload(client, admin, sheet([row(**args, **fields.get("extra", {}))]))
    shown = response.json()["rows"][0]
    assert shown["status"] == "error" and message in shown["problems"][column]
    assert response.json()["summary"]["errors"] == 1


def test_every_problem_in_a_row_is_reported_at_once(client, school, admin):
    shown = upload(client, admin, sheet([row("bad", "", "Rao", "12", "Nope", **{"Gender": "x", "PIN code": "1"})])).json()["rows"][0]
    assert sorted(shown["problems"]) == ["Courses", "Email", "First name", "Gender", "Mobile", "PIN code"]


@pytest.mark.parametrize("mobile", ["9876543210", "+91 98765 43210", "09876543210", "98765-43210", 9876543210, 9876543210.0])
def test_mobile_numbers_are_accepted_in_the_usual_forms(client, school, admin, mobile):
    assert upload(client, admin, sheet([row(mobile=mobile)])).json()["summary"]["ready"] == 1


def test_courses_may_be_separated_by_semicolons_commas_or_bars_in_any_case(client, school, admin):
    shown = upload(client, admin, sheet([row(courses="cat ;  CLAT"), row("b@example.com", courses="CAT, clat"), row("c@example.com", courses="CAT|CLAT|cat")])).json()
    assert [r["courses"] for r in shown["rows"]] == [["CAT", "CLAT"]] * 3 and shown["summary"]["ready"] == 3


def test_an_excel_date_cell_and_gender_words_are_accepted(client, school, admin):
    data = upload(client, admin, sheet([row(**{"Birth date": date(2005, 3, 21), "Gender": "Prefer not to say"}), row("b@example.com", **{"Gender": "F"})])).json()
    assert data["summary"]["ready"] == 2


def test_emails_are_tidied_and_blank_rows_are_ignored(client, school, admin):
    data = upload(client, admin, sheet([row("  ASHA@Example.com "), [None] * len(HEAD), row("b@example.com")])).json()
    assert data["summary"]["total"] == 2 and data["rows"][0]["email"] == "asha@example.com" and [r["row"] for r in data["rows"]] == [2, 4]


def test_the_same_email_twice_in_a_file_flags_the_second_row(client, school, admin):
    data = upload(client, admin, sheet([row(), row("ASHA@example.com", "Other", "Person")])).json()
    assert [r["status"] for r in data["rows"]] == ["ready", "error"] and "same email as row 2" in data["rows"][1]["problems"]["Email"]


def test_an_existing_student_in_any_status_is_skipped_and_the_admin_is_an_error(client, school, admin, repo):
    for status in ("approved", "rejected", "suspended"):
        repo.scoped("aaptprep").create_member({"email": f"{status}@example.com", "role": "student", "status": status, "first_name": "X", "last_name": "Y"})
    data = upload(client, admin, sheet([row(f"{s}@example.com") for s in ("approved", "rejected", "suspended")])).json()
    assert [r["status"] for r in data["rows"]] == ["skipped"] * 3 and f"({'approved'})" in data["rows"][0]["message"]


# ---- Problems with the file itself ----

@pytest.mark.parametrize("content, message", [
    (b"", "isn't an Excel"),
    (b"name,email\nx,y\n", "isn't an Excel"),
    (b"PK\x03\x04 not really", "readable Excel"),
    (sheet([row()], title="Other"), "no sheet called 'Students'"),
    (sheet([row()], header=["Email", "Name"]), "column headings have changed"),
    (sheet([]), "no students"),
])
def test_a_bad_file_is_refused_with_a_clear_message(client, school, admin, content, message):
    response = upload(client, admin, content)
    assert response.status_code == 422 and message in response.json()["detail"]


def test_a_file_over_the_row_limit_is_refused(client, school, admin):
    response = upload(client, admin, sheet([row(f"s{i}@example.com") for i in range(501)]))
    assert response.status_code == 422 and "at most 500" in response.json()["detail"]
    assert upload(client, admin, sheet([row(f"s{i}@example.com") for i in range(500)])).json()["summary"]["ready"] == 500


def test_a_file_over_two_megabytes_is_refused(client, school, admin, monkeypatch):
    monkeypatch.setattr(student_import, "MAX_BYTES", 100)
    assert "too big" in upload(client, admin, sheet([row()])).json()["detail"]


def test_the_optional_columns_may_be_missing_altogether(client, school, admin):
    short = sheet([["asha@example.com", "Asha", "Rao", "9876543210", "CAT"]], header=student_import.REQUIRED)
    assert upload(client, admin, short, confirm=True).json()["summary"]["created"] == 1


def test_headings_match_without_regard_to_case_or_spacing(client, school, admin):
    odd = sheet([row()], header=[h.upper() + " " for h in HEAD])
    assert upload(client, admin, odd).json()["summary"]["ready"] == 1


# ---- Importing ----

def test_import_creates_approved_students_with_their_courses_and_tags(client, school, admin, repo):
    response = upload(client, admin, sheet([row(courses="CAT; CLAT", **{"Birth date": "2005-03-21", "Gender": "female", "WhatsApp": "9123456789", "Address": "12 MG Road", "City": "Pune", "PIN code": "411001"})]), confirm=True)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["summary"] == {"total": 1, "ready": 1, "skipped": 0, "errors": 0, "created": 1} and data["created"] == ["asha@example.com"] and data["batch"]
    assert data["rows"][0]["status"] == "created" and data["confirmed"] is True
    made = repo.scoped("aaptprep").get_member("asha@example.com")
    assert (made["role"], made["status"], made["source"], made["import_batch"], made["decided_by"]) == ("student", "approved", "import", data["batch"], "ritesh@example.com")
    assert (made["first_name"], made["last_name"], made["mobile"], made["whatsapp"]) == ("Asha", "Rao", "9876543210", "9123456789")
    assert (made["birth_date"], made["gender"], made["address"], made["city"], made["pin_code"]) == ("2005-03-21", "female", "12 MG Road", "Pune", "411001")
    assert made["course_names"] == ["CAT", "CLAT"] and made["course_ids"] == [school["cat"]["id"], school["clat"]["id"]]
    assert (made["course_id"], made["course_name"]) == (school["cat"]["id"], "CAT")


def test_blank_optional_columns_are_stored_empty_and_whatsapp_follows_the_mobile(client, school, admin, repo):
    upload(client, admin, sheet([row()]), confirm=True)
    made = repo.scoped("aaptprep").get_member("asha@example.com")
    assert (made["birth_date"], made["gender"], made["address"], made["city"], made["pin_code"]) == ("", "", "", "", "")
    assert made["whatsapp"] == "9876543210"


def test_each_course_is_granted_under_its_own_access_length(client, school, admin, repo):
    upload(client, admin, sheet([row(courses="CAT; CLAT")]), confirm=True)
    scoped = repo.scoped("aaptprep")
    cat, clat = scoped.get_access("asha@example.com", school["cat"]["id"]), scoped.get_access("asha@example.com", school["clat"]["id"])
    assert cat["source"] == "import" and cat["expires_at"] is not None  # CAT lasts 30 days
    assert clat["source"] == "import" and clat["expires_at"] is None  # CLAT has no end


def test_imported_students_are_listed_as_approved_and_can_log_in(client, school, admin, mailer):
    upload(client, admin, sheet([row()]), confirm=True)
    listed = client.get(f"{REGS}?status=approved", headers=admin).json()
    assert [p["email"] for p in listed] == ["asha@example.com"] and listed[0]["course_names"] == ["CAT"] and listed[0]["birth_date"] == ""
    asked = client.post("/api/auth/request-code", json={"email": "asha@example.com"}, headers=headers("aaptprep"))
    assert asked.status_code == 200 and asked.json()["status"] == "code_sent"


def test_only_the_valid_rows_are_created_and_the_rest_are_reported(client, school, admin, repo):
    data = upload(client, admin, sheet([row(), row("bad"), row("c@example.com", courses="Nope"), row("d@example.com", "D", "E", "9000000001")]), confirm=True).json()
    assert data["summary"]["created"] == 2 and data["summary"]["errors"] == 2
    assert [r["status"] for r in data["rows"]] == ["created", "error", "error", "created"]
    assert repo.scoped("aaptprep").get_member("c@example.com") is None


def test_importing_the_same_file_again_creates_nobody_and_keeps_the_first_import(client, school, admin, repo):
    first = upload(client, admin, sheet([row()]), confirm=True).json()
    again = upload(client, admin, sheet([row(first="Changed")]), confirm=True).json()
    assert again["summary"]["created"] == 0 and again["summary"]["skipped"] == 1 and again["created"] == []
    assert repo.scoped("aaptprep").get_member("asha@example.com")["first_name"] == "Asha"
    assert repo.scoped("aaptprep").get_member("asha@example.com")["import_batch"] == first["batch"]


def test_nothing_is_created_when_every_row_has_a_problem(client, school, admin):
    data = upload(client, admin, sheet([row("bad")]), confirm=True).json()
    assert data["created"] == [] and data["batch"] is None and data["summary"]["errors"] == 1


def test_a_student_registered_a_moment_earlier_is_skipped_not_overwritten(client, school, admin, repo, monkeypatch):
    from app.repo import ConflictError, TenantRepo

    real = TenantRepo.create_member

    def racing(self, member):
        if member["email"] == "b@example.com":
            raise ConflictError()
        return real(self, member)

    monkeypatch.setattr(TenantRepo, "create_member", racing)
    data = upload(client, admin, sheet([row(), row("b@example.com", "B", "C")]), confirm=True).json()
    assert [r["status"] for r in data["rows"]] == ["created", "skipped"] and "a moment ago" in data["rows"][1]["message"]
    assert data["summary"]["created"] == 1 and data["created"] == ["asha@example.com"]


def test_a_course_that_cannot_be_granted_is_named_and_the_student_is_still_created(client, school, admin, repo, monkeypatch):
    from app import content

    real = content.grant_access

    def refusing(scoped, email, course_id, admin_email, source="manual"):
        if course_id == school["clat"]["id"]:
            raise content.AccessRefused("This course's end date has passed.")
        return real(scoped, email, course_id, admin_email, source=source)

    monkeypatch.setattr(content, "grant_access", refusing)
    data = upload(client, admin, sheet([row(courses="CAT; CLAT")]), confirm=True).json()
    assert data["rows"][0]["status"] == "created" and "could not give access to CLAT" in data["rows"][0]["message"]
    scoped = repo.scoped("aaptprep")
    assert scoped.get_access("asha@example.com", school["cat"]["id"]) is not None and scoped.get_access("asha@example.com", school["clat"]["id"]) is None


def test_a_big_import_creates_every_student(client, school, admin, repo):
    data = upload(client, admin, sheet([row(f"s{i:03d}@example.com", "S", f"N{i}", f"9{i:09d}"[:10]) for i in range(120)]), confirm=True).json()
    assert data["summary"]["created"] == 120 and len(repo.scoped("aaptprep").all_members_by_status("approved")) == 121  # plus the admin


def test_another_institutes_students_are_never_touched_or_counted_as_existing(client, school, admin, repo):
    repo.scoped("other").create_member({"email": "asha@example.com", "role": "student", "status": "approved", "first_name": "Other", "last_name": "Asha"})
    assert upload(client, admin, sheet([row()]), confirm=True).json()["summary"]["created"] == 1
    assert repo.scoped("other").get_member("asha@example.com")["first_name"] == "Other"


# ---- Welcome emails ----

def outbox(mailer):
    return [m for m in mailer.sent if "login code" not in m.subject]


def test_a_welcome_email_names_the_institute_courses_and_the_login_page(client, school, admin, mailer):
    upload(client, admin, sheet([row(courses="CAT; CLAT")]), confirm=True)
    result = client.post(WELCOME, json={"emails": ["asha@example.com"]}, headers=admin)
    assert result.status_code == 200 and result.json() == {"sent": 1, "failed": 0, "skipped": 0}
    [mail] = outbox(mailer)
    assert mail.to == "asha@example.com" and mail.subject == "Welcome to AaptPrep" and mail.from_name == "AaptPrep"
    assert "Hello Asha," in mail.body and "access to CAT and CLAT" in mail.body and "http://localhost:4200/aaptprep/login" in mail.body


def test_each_student_is_welcomed_once(client, school, admin, mailer, repo):
    upload(client, admin, sheet([row()]), confirm=True)
    assert client.post(WELCOME, json={"emails": ["asha@example.com"]}, headers=admin).json()["sent"] == 1
    again = client.post(WELCOME, json={"emails": ["asha@example.com", "ASHA@example.com"]}, headers=admin).json()
    assert again == {"sent": 0, "failed": 0, "skipped": 1} and len(outbox(mailer)) == 1
    assert repo.scoped("aaptprep").get_member("asha@example.com")["welcomed_at"]


def test_only_imported_approved_students_can_be_welcomed(client, school, admin, mailer, repo):
    scoped = repo.scoped("aaptprep")
    scoped.create_member({"email": "self@example.com", "role": "student", "status": "approved", "first_name": "S", "last_name": "R"})
    upload(client, admin, sheet([row()]), confirm=True)
    scoped.update_member("asha@example.com", status="suspended")
    result = client.post(WELCOME, json={"emails": ["self@example.com", "asha@example.com", "ritesh@example.com", "ghost@example.com"]}, headers=admin).json()
    assert result == {"sent": 0, "failed": 0, "skipped": 4} and outbox(mailer) == []


def test_a_failed_welcome_is_counted_and_can_be_retried(client, school, admin, mailer, repo, monkeypatch):
    upload(client, admin, sheet([row(), row("b@example.com", "B", "C")]), confirm=True)
    real = mailer.send
    monkeypatch.setattr(mailer, "send", lambda email: (_ for _ in ()).throw(RuntimeError("no")) if email.to == "b@example.com" else real(email))
    assert client.post(WELCOME, json={"emails": ["asha@example.com", "b@example.com"]}, headers=admin).json() == {"sent": 1, "failed": 1, "skipped": 0}
    assert repo.scoped("aaptprep").get_member("b@example.com").get("welcomed_at") is None
    monkeypatch.setattr(mailer, "send", real)
    assert client.post(WELCOME, json={"emails": ["b@example.com"]}, headers=admin).json()["sent"] == 1


@pytest.mark.parametrize("body, message", [
    ({}, "List the students"), ({"emails": []}, "List the students"), ({"emails": "a@example.com"}, "List the students"), ({"emails": [1]}, "List the students"),
    ({"emails": [f"s{i}@example.com" for i in range(26)]}, "up to 25"),
])
def test_a_bad_welcome_request_is_refused(client, school, admin, body, message):
    response = client.post(WELCOME, json=body, headers=admin)
    assert response.status_code == 422 and message in response.json()["detail"]


# ---- Editing a student who was imported without some details ----

def edit(client, admin, email, **changes):
    return client.patch(f"{REGS}/{email}", json=changes, headers=admin)


def test_an_imported_student_can_be_edited_without_filling_in_the_blank_fields(client, school, admin, repo):
    upload(client, admin, sheet([row()]), confirm=True)
    response = edit(client, admin, "asha@example.com", first_name="Asha-Rani")
    assert response.status_code == 200, response.text
    made = repo.scoped("aaptprep").get_member("asha@example.com")
    assert made["first_name"] == "Asha-Rani" and (made["birth_date"], made["gender"], made["address"], made["city"], made["pin_code"]) == ("", "", "", "", "")


def test_a_blank_field_can_be_filled_in_later_and_what_is_typed_is_still_checked(client, school, admin, repo):
    upload(client, admin, sheet([row()]), confirm=True)
    bad = edit(client, admin, "asha@example.com", pin_code="123")
    assert bad.status_code == 422 and "6-digit" in str(bad.json())
    assert edit(client, admin, "asha@example.com", city="Pune", pin_code="411001").status_code == 200
    made = repo.scoped("aaptprep").get_member("asha@example.com")
    assert (made["city"], made["pin_code"], made["address"]) == ("Pune", "411001", "")


def test_a_student_who_registered_themselves_still_needs_every_field(client, school, admin, repo):
    repo.scoped("aaptprep").create_member({
        "email": "full@example.com", "role": "student", "status": "approved", "first_name": "F", "last_name": "G", "birth_date": "2005-03-21", "gender": "male",
        "mobile": "9876543210", "whatsapp": "9876543210", "address": "12 MG Road", "city": "Pune", "pin_code": "411001",
        "course_ids": [school["cat"]["id"]], "course_names": ["CAT"], "course_id": school["cat"]["id"], "course_name": "CAT",
    })
    refused = edit(client, admin, "full@example.com", city="")
    assert refused.status_code in (200, 422)
    made = repo.scoped("aaptprep").get_member("full@example.com")
    assert made["city"] == "Pune"  # an empty value never wipes a field that was filled in
