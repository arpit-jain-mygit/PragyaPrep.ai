"""Live classes of a course: one by one, and many at once from an Excel sheet naming the uploaded files."""
from datetime import date
from io import BytesIO

import pytest
from openpyxl import Workbook, load_workbook

from app import live_import
from conftest import headers

HEAD = live_import.COLUMNS


@pytest.fixture
def school(make_tenant, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    make_tenant("other", "Other", "boss@example.com")
    return {"cat": add_course("aaptprep", "CAT"), "clat": add_course("aaptprep", "CLAT"), "theirs": add_course("other", "CAT")}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


@pytest.fixture
def cid(school):
    return school["cat"]["id"]


def url(cid, tail=""):
    return f"/api/admin/courses/{cid}/live-classes{tail}"


def add_file(repo, cid, file_id, filename, kind="mp4", title=None, status="ready"):
    repo.scoped("aaptprep").create_file({
        "id": file_id, "course_id": cid, "title": title or filename.rsplit(".", 1)[0], "filename": filename, "kind": kind,
        "content_type": "video/mp4" if kind == "mp4" else "application/pdf", "size": 100, "status": status, "key": f"k/{file_id}", "created_at": "2027-01-01T00:00:00Z",
    })
    return file_id


def make(client, admin, cid, **overrides):
    body = {"title": "Algebra live", "held_on": "2027-02-10", "paper_id": "quantitative-ability", **overrides}
    return client.post(url(cid), json=body, headers=admin)


# ---- Who can use it ----

def test_only_the_admin_can_use_it(client, school, admin, cid, sign_in, repo):
    repo.scoped("aaptprep").create_member({"email": "s@example.com", "role": "student", "status": "approved", "first_name": "S", "last_name": "T"})
    student = sign_in("aaptprep", "s@example.com")
    for call in (lambda h: client.get(url(cid), headers=h), lambda h: client.post(url(cid), json={}, headers=h), lambda h: client.get(url(cid, "/template"), headers=h),
                 lambda h: client.post(url(cid, "/import"), content=b"x", headers=h), lambda h: client.patch(url(cid, "/x"), json={}, headers=h), lambda h: client.delete(url(cid, "/x"), headers=h)):
        assert call(headers("aaptprep")).status_code == 401
        assert call(student).status_code == 403


def test_another_institutes_or_an_unknown_course_is_not_found(client, school, admin):
    for course in (school["theirs"]["id"], "nope"):
        assert client.get(url(course), headers=admin).status_code == 404
        assert make(client, admin, course).status_code == 404
        assert client.get(url(course, "/template"), headers=admin).status_code == 404
        assert client.post(url(course, "/import"), content=b"x", headers=admin).status_code == 404


# ---- One by one ----

def test_a_course_starts_with_no_live_classes(client, admin, cid):
    assert client.get(url(cid), headers=admin).json() == []


def test_a_live_class_keeps_its_details_and_resolves_its_material(client, admin, cid, repo):
    video, pdf = add_file(repo, cid, "v1", "Class 1.mp4", "mp4", "Algebra recording"), add_file(repo, cid, "p1", "slides.pdf", "pdf", "Algebra slides")
    response = make(client, admin, cid, held_time="18:30", description="Chapter 1", status="published",
                    materials=[{"type": "file", "file_id": video}, {"type": "file", "file_id": pdf}, {"type": "link", "url": "https://youtu.be/x", "title": "Backup"}])
    assert response.status_code == 201, response.text
    [made] = response.json()
    assert (made["title"], made["held_on"], made["held_time"], made["description"], made["status"]) == ("Algebra live", "2027-02-10", "18:30", "Chapter 1", "published")
    assert made["materials"] == [
        {"type": "file", "file_id": "v1", "title": "Algebra recording", "kind": "mp4", "size": 100},
        {"type": "file", "file_id": "p1", "title": "Algebra slides", "kind": "pdf", "size": 100},
        {"type": "link", "url": "https://youtu.be/x", "title": "Backup"},
    ]


def test_a_new_class_is_a_draft_unless_published(client, admin, cid):
    assert make(client, admin, cid).json()[0]["status"] == "draft"


def test_classes_are_listed_newest_first_by_date_then_time(client, admin, cid):
    for title, day, hour in (("Old", "2027-01-05", ""), ("Newest evening", "2027-02-10", "19:00"), ("Newest morning", "2027-02-10", "09:00"), ("Middle", "2027-01-20", "")):
        make(client, admin, cid, title=title, held_on=day, held_time=hour)
    assert [c["title"] for c in client.get(url(cid), headers=admin).json()] == ["Newest evening", "Newest morning", "Middle", "Old"]


@pytest.mark.parametrize("overrides, message", [
    ({"title": ""}, "1 to 120"), ({"title": "x" * 121}, "1 to 120"), ({"title": None}, "1 to 120"),
    ({"held_on": "10/02/2027"}, "YYYY-MM-DD"), ({"held_on": "2027-13-40"}, "YYYY-MM-DD"), ({"held_on": None}, "YYYY-MM-DD"),
    ({"held_time": "6pm"}, "HH:MM"), ({"held_time": "25:00"}, "HH:MM"), ({"held_time": "18:60"}, "HH:MM"),
    ({"description": "x" * 2001}, "2000"), ({"status": "live"}, "draft or published"),
    ({"status": "published"}, "before publishing"),
    ({"materials": [{"type": "file", "file_id": "missing"}]}, "this course's Files"),
    ({"materials": [{"type": "link", "url": "javascript:alert(1)"}]}, "http://"),
])
def test_a_bad_live_class_is_refused_and_nothing_is_saved(client, admin, cid, overrides, message):
    response = make(client, admin, cid, **overrides)
    assert response.status_code == 422 and message in response.json()["detail"]
    assert client.get(url(cid), headers=admin).json() == []


def test_a_file_still_uploading_or_from_another_course_cannot_be_used(client, admin, school, cid, repo):
    add_file(repo, cid, "half", "half.mp4", status="uploading")
    assert make(client, admin, cid, materials=[{"type": "file", "file_id": "half"}]).status_code == 422
    add_file(repo, school["clat"]["id"], "elsewhere", "e.mp4")
    assert make(client, admin, cid, materials=[{"type": "file", "file_id": "elsewhere"}]).status_code == 422


def test_editing_changes_only_what_is_sent_and_publishing_needs_something_to_show(client, admin, cid, repo):
    video = add_file(repo, cid, "v1", "c.mp4")
    [made] = make(client, admin, cid, description="Notes", held_time="18:00").json()
    after = client.patch(url(cid, f"/{made['id']}"), json={"title": "Renamed"}, headers=admin).json()[0]
    assert (after["title"], after["held_on"], after["description"], after["held_time"]) == ("Renamed", "2027-02-10", "Notes", "18:00")
    cleared = client.patch(url(cid, f"/{made['id']}"), json={"held_time": ""}, headers=admin).json()[0]
    assert cleared["held_time"] == ""
    assert client.patch(url(cid, f"/{made['id']}"), json={"status": "published"}, headers=admin).json()[0]["status"] == "published"
    refused = client.patch(url(cid, f"/{made['id']}"), json={"description": "", "materials": []}, headers=admin)
    assert refused.status_code == 422 and "before publishing" in refused.json()["detail"]
    with_video = client.patch(url(cid, f"/{made['id']}"), json={"materials": [{"type": "file", "file_id": video}], "description": ""}, headers=admin).json()[0]
    assert with_video["status"] == "published" and len(with_video["materials"]) == 1
    assert client.patch(url(cid, f"/{made['id']}"), json={"status": "draft"}, headers=admin).json()[0]["status"] == "draft"


def test_editing_with_a_bad_value_is_refused(client, admin, cid):
    [made] = make(client, admin, cid).json()
    assert client.patch(url(cid, f"/{made['id']}"), json={"held_on": "soon"}, headers=admin).status_code == 422
    assert client.patch(url(cid, "/nope"), json={"title": "X"}, headers=admin).status_code == 404


def test_deleting_a_live_class_removes_it_and_a_second_delete_is_not_found(client, admin, cid):
    [made] = make(client, admin, cid).json()
    assert client.delete(url(cid, f"/{made['id']}"), headers=admin).json() == []
    assert client.delete(url(cid, f"/{made['id']}"), headers=admin).status_code == 404


def test_deleting_a_course_file_takes_it_out_of_its_live_classes(client, admin, cid, repo):
    from app.content import delete_file

    class Storage:
        def delete(self, key):
            pass

    one, two = add_file(repo, cid, "v1", "a.mp4"), add_file(repo, cid, "v2", "b.mp4")
    make(client, admin, cid, materials=[{"type": "file", "file_id": one}, {"type": "file", "file_id": two}])
    delete_file(repo.scoped("aaptprep"), Storage(), cid, one)
    assert [m["file_id"] for m in client.get(url(cid), headers=admin).json()[0]["materials"]] == ["v2"]


def test_classes_of_two_courses_do_not_mix(client, admin, school, cid):
    make(client, admin, cid)
    assert client.get(url(school["clat"]["id"]), headers=admin).json() == []


def test_an_uploaded_file_remembers_its_original_file_name(client, admin, cid, repo):
    start = client.post(f"/api/admin/courses/{cid}/files", json={"filename": "folder/Class 1.MP4", "size": 100, "title": "Class one"}, headers=admin)
    assert start.status_code == 201, start.text
    assert repo.scoped("aaptprep").get_file(cid, start.json()["file"]["id"])["filename"] == "Class 1.MP4"


# ---- The template ----

def sheet(rows, header=None, title="Live classes"):
    book = Workbook()
    ws = book.active
    ws.title = title
    ws.append(header if header is not None else HEAD)
    for r in rows:
        ws.append(r)
    out = BytesIO()
    book.save(out)
    return out.getvalue()


def row(title="Algebra live", day="2027-02-10", **extra):
    values = {"Title": title, "Date": day, **extra}
    return [values.get(name, "Quantitative Ability" if name == "Subject" else "") for name in HEAD]


def upload(client, admin, cid, content, confirm=False):
    return client.post(url(cid, "/import") + ("?confirm=true" if confirm else ""), content=content, headers=admin)


def test_the_template_has_the_sheet_the_courses_uploaded_files_and_instructions(client, admin, cid, repo):
    add_file(repo, cid, "v1", "Class 1.mp4", "mp4", "Algebra recording")
    add_file(repo, cid, "p1", "slides.pdf", "pdf")
    add_file(repo, cid, "half", "half.mp4", status="uploading")
    response = client.get(url(cid, "/template"), headers=admin)
    assert response.status_code == 200 and "live-classes-template.xlsx" in response.headers["content-disposition"]
    book = load_workbook(BytesIO(response.content))
    assert book.sheetnames == ["Live classes", "Uploaded files", "Plan", "How to fill"]
    assert [c.value for c in book["Live classes"][1]] == HEAD
    listed = [[c.value for c in r] for r in book["Uploaded files"].iter_rows(min_row=2) if r[0].value]
    assert listed == [["Class 1.mp4", "Video", "Algebra recording"], ["slides.pdf", "PDF", "slides"]]  # the unfinished upload is not listed
    assert "CAT" in str(book["How to fill"]["A1"].value)


def test_the_blank_template_reads_back_as_empty(client, admin, cid):
    response = upload(client, admin, cid, client.get(url(cid, "/template"), headers=admin).content)
    assert response.status_code == 422 and "no live classes" in response.json()["detail"]


# ---- Checking a sheet ----

@pytest.fixture
def files(repo, cid):
    return {
        "v1": add_file(repo, cid, "v1", "Class 1.mp4", "mp4", "Algebra recording"),
        "v2": add_file(repo, cid, "v2", "Class 2.mp4", "mp4"),
        "p1": add_file(repo, cid, "p1", "slides-1.pdf", "pdf", "Algebra slides"),
    }


def test_a_preview_counts_ready_skipped_and_problem_rows_and_saves_nothing(client, admin, cid, files):
    make(client, admin, cid, title="Already there", held_on="2027-03-01")
    data = upload(client, admin, cid, sheet([row(Video="Class 1.mp4"), row("Already there", "2027-03-01"), row("Bad", "soon")])).json()
    assert data["summary"] == {"total": 3, "ready": 1, "skipped": 1, "errors": 1} and data["confirmed"] is False
    assert [r["status"] for r in data["rows"]] == ["ready", "skipped", "error"]
    assert "already there" in data["rows"][1]["message"] and data["rows"][0]["files"] == 1
    assert len(client.get(url(cid), headers=admin).json()) == 1 and "ready_records" not in data


@pytest.mark.parametrize("name", ["Class 1.mp4", "CLASS 1.MP4", "  class   1.mp4 ", "Class 1", "Algebra recording", "algebra recording.mp4"])
def test_files_are_found_by_file_name_with_or_without_the_ending_or_by_title(client, admin, cid, files, name):
    data = upload(client, admin, cid, sheet([row(Video=name)])).json()
    assert data["rows"][0]["status"] == "ready" and data["rows"][0]["files"] == 1


def test_several_files_in_one_cell_are_all_found_and_a_missing_one_is_named(client, admin, cid, files):
    data = upload(client, admin, cid, sheet([row(Video="Class 1.mp4; Class 2.mp4 | class 1.mp4", PDF="slides-1.pdf"), row("Other", Video="Class 1.mp4; nope.mp4")])).json()
    assert data["rows"][0]["files"] == 3  # the repeated name counts once
    assert data["rows"][1]["status"] == "error" and "nope.mp4" in data["rows"][1]["problems"]["Video"] and "Upload them" in data["rows"][1]["problems"]["Video"]


def test_a_pdf_named_in_the_video_column_is_a_problem(client, admin, cid, files):
    data = upload(client, admin, cid, sheet([row(Video="slides-1.pdf", PDF="Class 1.mp4")])).json()["rows"][0]
    assert "(not a video)" in data["problems"]["Video"] and "(not a PDF)" in data["problems"]["PDF"]


@pytest.mark.parametrize("fields, column, message", [
    ({"title": ""}, "Title", "1 to 120"),
    ({"day": "10/02/2027"}, "Date", "YYYY-MM-DD"),
    ({"day": ""}, "Date", "YYYY-MM-DD"),
    ({"extra": {"Time": "6pm"}}, "Time", "HH:MM"),
    ({"extra": {"Link": "ftp://x"}}, "Link", "http://"),
    ({"extra": {"Status": "live"}}, "Status", "draft or published"),
    ({"extra": {"Status": "published"}}, "Status", "needs a recording"),
    ({"extra": {"Description": "x" * 2001}}, "Description", "2000"),
])
def test_each_kind_of_mistake_is_reported_against_its_column(client, admin, cid, files, fields, column, message):
    args = {k: v for k, v in fields.items() if k != "extra"}
    shown = upload(client, admin, cid, sheet([row(**args, **fields.get("extra", {}))])).json()["rows"][0]
    assert shown["status"] == "error" and message in shown["problems"][column]


def test_an_excel_date_cell_and_a_published_class_with_a_link_are_accepted(client, admin, cid):
    data = upload(client, admin, cid, sheet([row(day=date(2027, 2, 10), Link="https://youtu.be/abc", Status="Published")])).json()
    assert data["rows"][0]["status"] == "ready"


def test_the_same_title_and_date_twice_in_a_file_flags_the_second_row(client, admin, cid):
    rows = upload(client, admin, cid, sheet([row(), row("ALGEBRA LIVE"), row("Different")])).json()["rows"]
    assert [r["status"] for r in rows] == ["ready", "error", "ready"] and "same title and date as row 2" in rows[1]["problems"]["Title"]


@pytest.mark.parametrize("content, message", [
    (b"", "isn't an Excel"), (b"a,b\n1,2\n", "isn't an Excel"), (b"PK\x03\x04 nope", "readable Excel"),
    (sheet([row()], title="Other"), "no sheet called 'Live classes'"), (sheet([row()], header=["Name", "When"]), "column headings have changed"), (sheet([]), "no live classes"),
])
def test_a_bad_file_is_refused_with_a_clear_message(client, admin, cid, content, message):
    response = upload(client, admin, cid, content)
    assert response.status_code == 422 and message in response.json()["detail"]


def test_the_row_limit_is_enforced(client, admin, cid):
    assert "at most 300" in upload(client, admin, cid, sheet([row(f"Class {i}") for i in range(301)])).json()["detail"]
    assert upload(client, admin, cid, sheet([row(f"Class {i}") for i in range(300)])).json()["summary"]["ready"] == 300


# ---- Importing ----

def test_import_creates_the_ready_rows_as_drafts_with_their_files(client, admin, cid, files, repo):
    data = upload(client, admin, cid, sheet([
        row(Video="Class 1.mp4", PDF="slides-1.pdf", Time="18:30", Description="Chapter 1"), row("Second", "2027-02-17", Video="Class 2.mp4", Status="published"), row("Bad", "soon"),
    ]), confirm=True).json()
    assert data["summary"] == {"total": 3, "ready": 2, "skipped": 0, "errors": 1, "created": 2} and [r["status"] for r in data["rows"]] == ["created", "created", "error"]
    listed = {c["title"]: c for c in client.get(url(cid), headers=admin).json()}
    assert listed["Algebra live"]["status"] == "draft" and listed["Algebra live"]["held_time"] == "18:30"
    assert [m["file_id"] for m in listed["Algebra live"]["materials"]] == ["v1", "p1"]
    assert listed["Second"]["status"] == "published" and [m["file_id"] for m in listed["Second"]["materials"]] == ["v2"]
    assert all(r.get("source") == "import" for r in repo.scoped("aaptprep").list_live(cid))


def test_importing_the_same_sheet_again_adds_nothing(client, admin, cid, files):
    sheet_bytes = sheet([row(Video="Class 1.mp4")])
    upload(client, admin, cid, sheet_bytes, confirm=True)
    again = upload(client, admin, cid, sheet_bytes, confirm=True).json()
    assert again["summary"]["created"] == 0 and again["summary"]["skipped"] == 1 and len(client.get(url(cid), headers=admin).json()) == 1


def test_nothing_is_created_when_every_row_has_a_problem(client, admin, cid):
    assert upload(client, admin, cid, sheet([row("Bad", "soon")]), confirm=True).json()["summary"]["created"] == 0
    assert client.get(url(cid), headers=admin).json() == []


def test_a_files_name_in_another_course_is_not_found_here(client, admin, school, cid, repo):
    add_file(repo, school["clat"]["id"], "other", "only-in-clat.mp4")
    assert upload(client, admin, cid, sheet([row(Video="only-in-clat.mp4")])).json()["rows"][0]["status"] == "error"


# ---- Where a class sits in the plan ----

from test_coursework import topic as plan_topic, sub as plan_sub  # noqa: E402


@pytest.fixture
def plan(client, admin, cid):
    percent = plan_topic(client, admin, cid, "Percentages")
    ratios = plan_topic(client, admin, cid, "Ratios")
    concepts = plan_sub(client, admin, cid, percent["id"], "Concepts").json()
    sub_id = next(x["id"] for s in concepts["subjects"] for t in s["topics"] if t["id"] == percent["id"] for x in t["subtopics"])
    return {"percent": percent["id"], "ratios": ratios["id"], "sub": sub_id}


def test_a_class_needs_a_subject_and_shows_where_it_sits(client, admin, cid, plan):
    refused = client.post(url(cid), json={"title": "X", "held_on": "2027-02-10"}, headers=admin)
    assert refused.status_code == 422 and "Choose the subject" in refused.json()["detail"]
    made = make(client, admin, cid, topic_id=plan["percent"], subtopic_id=plan["sub"]).json()[0]
    assert (made["paper_id"], made["topic_id"], made["subtopic_id"]) == ("quantitative-ability", plan["percent"], plan["sub"])
    assert made["place"] == "Quantitative Ability › Percentages › Concepts"
    only = make(client, admin, cid, title="Subject only").json()
    assert next(c for c in only if c["title"] == "Subject only")["place"] == "Quantitative Ability"


@pytest.mark.parametrize("extra,problem", [
    ({"paper_id": "nope"}, "isn't in this course"), ({"topic_id": "nope"}, "isn't in this subject"),
    ({"subtopic_id": "x"}, "Choose the topic first"), ({"paper_id": ""}, "Choose the subject"),
])
def test_bad_places_are_refused(client, admin, cid, plan, extra, problem):
    if "Choose the topic first" in problem:
        problem = "Choose the topic before"
    response = make(client, admin, cid, **extra)
    assert response.status_code == 422 and problem in response.json()["detail"]


def test_a_sub_topic_of_another_topic_is_refused_and_editing_the_place_works(client, admin, cid, plan):
    wrong = make(client, admin, cid, topic_id=plan["ratios"], subtopic_id=plan["sub"])
    assert wrong.status_code == 422 and "isn't in this topic" in wrong.json()["detail"]
    made = make(client, admin, cid).json()[0]
    edited = client.patch(url(cid, f"/{made['id']}"), json={"paper_id": "quantitative-ability", "topic_id": plan["ratios"]}, headers=admin).json()[0]
    assert edited["place"] == "Quantitative Ability › Ratios"
    assert client.patch(url(cid, f"/{made['id']}"), json={"title": "Renamed"}, headers=admin).json()[0]["topic_id"] == plan["ratios"]


def test_a_sheet_names_the_place_and_problems_are_by_column(client, admin, cid, plan):
    good = row("Percent live", Topic="percentages", **{"Sub-topic": "CONCEPTS"})
    bad = row("Bad live", day="2027-02-11", Subject="Nope", Topic="Nope")
    bad_topic = row("Bad topic", day="2027-02-12", Topic="Missing", **{"Sub-topic": "Concepts"})
    check = upload(client, admin, cid, sheet([good, bad, bad_topic])).json()
    assert [r["status"] for r in check["rows"]] == ["ready", "error", "error"]
    assert "isn't a subject" in check["rows"][1]["problems"]["Subject"]
    assert "isn't a topic" in check["rows"][2]["problems"]["Topic"]
    upload(client, admin, cid, sheet([good]), confirm=True)
    made = client.get(url(cid), headers=admin).json()[0]
    assert made["place"] == "Quantitative Ability › Percentages › Concepts"


def test_the_template_lists_the_plan(client, admin, cid, plan):
    book = load_workbook(BytesIO(client.get(url(cid, "/template"), headers=admin).content))
    rows = [[c.value for c in r] for r in book["Plan"].iter_rows(min_row=2)]
    assert ["Quantitative Ability", "Percentages", "Concepts"] in rows and ["Quantitative Ability", "Ratios", None] in rows
