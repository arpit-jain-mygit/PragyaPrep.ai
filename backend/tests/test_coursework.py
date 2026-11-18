"""Coursework: the admin builds a course's plan (subject, topic, sub-topic) with material and finish-by dates."""
import pytest

from conftest import headers

QUANT = "quantitative-ability"
LOGIC = "logical-reasoning"


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
    return f"/api/admin/courses/{cid}/coursework{tail}"


def add_file(repo, cid, file_id="f1", title="Notes", kind="pdf", status="ready"):
    repo.scoped("aaptprep").create_file({
        "id": file_id, "course_id": cid, "title": title, "kind": kind, "content_type": "application/pdf", "size": 10,
        "status": status, "key": f"k/{file_id}", "created_at": f"2027-01-0{len(file_id)}T00:00:00Z",
    })
    return file_id


def topic(client, admin, cid, title="Percentages", paper=QUANT):
    response = client.post(url(cid, "/topics"), json={"paper_id": paper, "title": title}, headers=admin)
    assert response.status_code == 201, response.text
    subject = next(s for s in response.json()["subjects"] if s["paper_id"] == paper)
    return next(t for t in subject["topics"] if t["title"] == title)


def sub(client, admin, cid, topic_id, title="Basics", **extra):
    response = client.post(url(cid, f"/topics/{topic_id}/subtopics"), json={"title": title, **extra}, headers=admin)
    return response


def subs_of(plan, paper=QUANT, index=0):
    return next(s for s in plan["subjects"] if s["paper_id"] == paper)["topics"][index]["subtopics"]


# ---- Who can use it ----

def test_only_the_admin_can_see_or_change_a_plan(client, school, admin, cid, sign_in, add_member):
    assert client.get(url(cid), headers=headers("aaptprep")).status_code == 401
    add_member("aaptprep", "asha@example.com", role="student")
    student = sign_in("aaptprep", "asha@example.com")
    assert client.get(url(cid), headers=student).status_code == 403
    assert client.post(url(cid, "/topics"), json={"paper_id": QUANT, "title": "X"}, headers=student).status_code == 403


def test_another_institutes_course_is_not_found(client, school, admin):
    assert client.get(url(school["theirs"]["id"]), headers=admin).status_code == 404
    assert client.get(url("nope"), headers=admin).status_code == 404


# ---- The tree ----

def test_an_empty_plan_lists_the_courses_subjects_with_topic_suggestions(client, admin, cid):
    plan = client.get(url(cid), headers=admin).json()
    assert plan["course"] == {"id": cid, "name": "CAT"}
    assert [s["paper_id"] for s in plan["subjects"]] == ["verbal-ability-rc", "data-interpretation", "logical-reasoning", "quantitative-ability"]
    assert plan["counts"] == {"topics": 0, "subtopics": 0, "published": 0, "with_dates": 0}
    quant = next(s for s in plan["subjects"] if s["paper_id"] == QUANT)
    assert quant["topics"] == [] and len(quant["topic_options"]) > 2 and quant["due"] is None and quant["in_course"] is True


def test_a_topic_is_added_to_a_subject_of_the_course_and_leaves_the_suggestions(client, admin, cid):
    before = next(s for s in client.get(url(cid), headers=admin).json()["subjects"] if s["paper_id"] == QUANT)["topic_options"]
    made = topic(client, admin, cid, before[0])
    plan = client.get(url(cid), headers=admin).json()
    quant = next(s for s in plan["subjects"] if s["paper_id"] == QUANT)
    assert made["subtopics"] == [] and made["due"] is None
    assert before[0] not in quant["topic_options"] and len(quant["topic_options"]) == len(before) - 1
    assert plan["counts"]["topics"] == 1


def test_a_custom_topic_is_allowed_but_not_twice_in_one_subject(client, admin, cid):
    topic(client, admin, cid, "My own topic")
    again = client.post(url(cid, "/topics"), json={"paper_id": QUANT, "title": "  my  OWN topic "}, headers=admin)
    assert again.status_code == 422 and "already a topic" in again.json()["detail"]
    other = client.post(url(cid, "/topics"), json={"paper_id": LOGIC, "title": "My own topic"}, headers=admin)
    assert other.status_code == 201


@pytest.mark.parametrize("body, message", [
    ({"paper_id": "geography", "title": "X"}, "isn't part of this course"),
    ({"paper_id": None, "title": "X"}, "isn't part of this course"),
    ({"paper_id": QUANT, "title": ""}, "1 to 120"),
    ({"paper_id": QUANT, "title": "x" * 121}, "1 to 120"),
    ({"paper_id": QUANT}, "1 to 120"),
])
def test_a_bad_topic_is_refused(client, admin, cid, body, message):
    response = client.post(url(cid, "/topics"), json=body, headers=admin)
    assert response.status_code == 422 and message in response.json()["detail"]


def test_a_subject_not_on_the_course_cannot_get_topics(client, admin, school):
    response = client.post(url(school["clat"]["id"], "/topics"), json={"paper_id": "data-interpretation", "title": "X"}, headers=admin)
    assert response.status_code == 422


# ---- Sub-topics ----

def test_a_subtopic_starts_as_a_draft_with_its_note_date_and_material(client, admin, cid, repo):
    file_id = add_file(repo, cid, "f1", "Percentage notes")
    t = topic(client, admin, cid)
    response = sub(client, admin, cid, t["id"], "Basics", note="Read first", due="2027-02-10", materials=[
        {"type": "file", "file_id": file_id}, {"type": "link", "url": "https://youtu.be/abc", "title": "Video"}])
    assert response.status_code == 201, response.text
    made = subs_of(response.json())[0]
    assert made["status"] == "draft" and made["note"] == "Read first" and made["due"] == "2027-02-10"
    assert made["effective_due"] == "2027-02-10" and made["due_from"] == "subtopic"
    assert made["materials"] == [
        {"type": "file", "file_id": "f1", "title": "Percentage notes", "kind": "pdf", "size": 10},
        {"type": "link", "url": "https://youtu.be/abc", "title": "Video"},
    ]
    assert response.json()["counts"] == {"topics": 1, "subtopics": 1, "published": 0, "with_dates": 1}


def test_subtopics_keep_the_order_they_were_added_and_names_cannot_repeat(client, admin, cid):
    t = topic(client, admin, cid)
    for name in ("One", "Two", "Three"):
        sub(client, admin, cid, t["id"], name)
    plan = client.get(url(cid), headers=admin).json()
    assert [s["title"] for s in subs_of(plan)] == ["One", "Two", "Three"]
    again = sub(client, admin, cid, t["id"], " two ")
    assert again.status_code == 422 and "already a sub-topic" in again.json()["detail"]


@pytest.mark.parametrize("extra, message", [
    ({"title": ""}, "1 to 120"),
    ({"due": "10/02/2027"}, "YYYY-MM-DD"),
    ({"due": "2027-13-40"}, "YYYY-MM-DD"),
    ({"due": 20270210}, "YYYY-MM-DD"),
    ({"note": "x" * 2001}, "2000"),
    ({"status": "live"}, "draft or published"),
    ({"status": "published"}, "note or some material"),
    ({"materials": "nope"}, "up to 20"),
    ({"materials": [{"type": "file", "file_id": "missing"}]}, "this course's Files"),
    ({"materials": [{"type": "link", "url": "javascript:alert(1)"}]}, "http://"),
    ({"materials": [{"type": "link", "url": "https://a b.com"}]}, "http://"),
    ({"materials": [{"type": "doc"}]}, "file or a link"),
    ({"materials": ["x"]}, "file or a link"),
    ({"materials": [{"type": "link", "url": "https://a.com"}] * 21}, "up to 20"),
])
def test_a_bad_subtopic_is_refused_and_nothing_is_saved(client, admin, cid, extra, message):
    t = topic(client, admin, cid)
    body = {"title": "Basics", **extra}
    response = client.post(url(cid, f"/topics/{t['id']}/subtopics"), json=body, headers=admin)
    assert response.status_code == 422 and message in response.json()["detail"]
    assert client.get(url(cid), headers=admin).json()["counts"]["subtopics"] == 0


def test_a_file_that_is_still_uploading_or_from_another_course_cannot_be_used(client, admin, cid, school, repo):
    add_file(repo, cid, "half", status="pending")
    t = topic(client, admin, cid)
    assert sub(client, admin, cid, t["id"], "A", materials=[{"type": "file", "file_id": "half"}]).status_code == 422
    repo.scoped("aaptprep").create_file({"id": "elsewhere", "course_id": school["clat"]["id"], "title": "T", "kind": "pdf", "content_type": "application/pdf",
                                         "size": 1, "status": "ready", "key": "k", "created_at": "2027-01-01T00:00:00Z"})
    assert sub(client, admin, cid, t["id"], "B", materials=[{"type": "file", "file_id": "elsewhere"}]).status_code == 422


def test_the_same_file_twice_is_kept_once(client, admin, cid, repo):
    file_id = add_file(repo, cid)
    t = topic(client, admin, cid)
    made = subs_of(sub(client, admin, cid, t["id"], "A", materials=[{"type": "file", "file_id": file_id}] * 2).json())[0]
    assert len(made["materials"]) == 1


def test_a_subtopic_of_a_missing_topic_is_not_found(client, admin, cid):
    assert sub(client, admin, cid, "nope").status_code == 404


# ---- Dates: sub-topic, topic and subject ----

def test_a_date_on_the_topic_or_subject_is_followed_by_what_is_below_unless_it_has_its_own(client, admin, cid):
    t = topic(client, admin, cid)
    sub(client, admin, cid, t["id"], "Own", due="2027-03-01")
    sub(client, admin, cid, t["id"], "Plain")
    client.patch(url(cid, f"/subjects/{QUANT}"), json={"due": "2027-06-30"}, headers=admin)
    plan = client.get(url(cid), headers=admin).json()
    own, plain = subs_of(plan)
    assert (own["effective_due"], own["due_from"]) == ("2027-03-01", "subtopic")
    assert (plain["effective_due"], plain["due_from"]) == ("2027-06-30", "subject") and plain["due"] is None
    client.patch(url(cid, f"/{t['id']}"), json={"due": "2027-04-15"}, headers=admin)
    plain = subs_of(client.get(url(cid), headers=admin).json())[1]
    assert (plain["effective_due"], plain["due_from"]) == ("2027-04-15", "topic")
    assert client.get(url(cid), headers=admin).json()["counts"]["with_dates"] == 2


def test_clearing_a_date_removes_it(client, admin, cid):
    t = topic(client, admin, cid)
    client.patch(url(cid, f"/subjects/{QUANT}"), json={"due": "2027-06-30"}, headers=admin)
    plan = client.patch(url(cid, f"/subjects/{QUANT}"), json={"due": ""}, headers=admin).json()
    assert next(s for s in plan["subjects"] if s["paper_id"] == QUANT)["due"] is None
    client.patch(url(cid, f"/{t['id']}"), json={"due": "2027-04-15"}, headers=admin)
    plan = client.patch(url(cid, f"/{t['id']}"), json={"due": None}, headers=admin).json()
    assert next(s for s in plan["subjects"] if s["paper_id"] == QUANT)["topics"][0]["due"] is None


def test_a_subject_date_needs_a_subject_of_the_course_and_a_real_date(client, admin, cid):
    assert client.patch(url(cid, "/subjects/geography"), json={"due": "2027-06-30"}, headers=admin).status_code == 422
    assert client.patch(url(cid, f"/subjects/{QUANT}"), json={"due": "soon"}, headers=admin).status_code == 422


# ---- Editing ----

def test_editing_changes_only_what_is_sent(client, admin, cid):
    t = topic(client, admin, cid)
    made = subs_of(sub(client, admin, cid, t["id"], "Basics", note="Read first", due="2027-02-10").json())[0]
    plan = client.patch(url(cid, f"/{made['id']}"), json={"title": "Fundamentals"}, headers=admin).json()
    after = subs_of(plan)[0]
    assert after["title"] == "Fundamentals" and after["note"] == "Read first" and after["due"] == "2027-02-10"
    plan = client.patch(url(cid, f"/{t['id']}"), json={"title": "Percent"}, headers=admin).json()
    assert next(s for s in plan["subjects"] if s["paper_id"] == QUANT)["topics"][0]["title"] == "Percent"


def test_a_rename_cannot_clash_with_a_sibling(client, admin, cid):
    t = topic(client, admin, cid)
    sub(client, admin, cid, t["id"], "One")
    two = subs_of(sub(client, admin, cid, t["id"], "Two").json())[1]
    assert client.patch(url(cid, f"/{two['id']}"), json={"title": "one"}, headers=admin).status_code == 422
    assert client.patch(url(cid, f"/{two['id']}"), json={"title": "Two"}, headers=admin).status_code == 200


def test_publishing_needs_something_to_show_and_going_back_to_draft_works(client, admin, cid):
    t = topic(client, admin, cid)
    empty = subs_of(sub(client, admin, cid, t["id"], "Empty").json())[0]
    refused = client.patch(url(cid, f"/{empty['id']}"), json={"status": "published"}, headers=admin)
    assert refused.status_code == 422 and "note or some material" in refused.json()["detail"]
    ok = client.patch(url(cid, f"/{empty['id']}"), json={"status": "published", "note": "Start here"}, headers=admin).json()
    assert subs_of(ok)[0]["status"] == "published" and ok["counts"]["published"] == 1
    back = client.patch(url(cid, f"/{empty['id']}"), json={"status": "draft"}, headers=admin).json()
    assert subs_of(back)[0]["status"] == "draft" and back["counts"]["published"] == 0


def test_a_published_subtopic_cannot_be_emptied(client, admin, cid):
    t = topic(client, admin, cid)
    made = subs_of(sub(client, admin, cid, t["id"], "Live", note="Hello", status="published").json())[0]
    assert made["status"] == "published"
    emptied = client.patch(url(cid, f"/{made['id']}"), json={"note": ""}, headers=admin)
    assert emptied.status_code == 422
    assert subs_of(client.get(url(cid), headers=admin).json())[0]["note"] == "Hello"


def test_material_can_be_replaced(client, admin, cid, repo):
    one, two = add_file(repo, cid, "f1", "One"), add_file(repo, cid, "f22", "Two", "mp4")
    t = topic(client, admin, cid)
    made = subs_of(sub(client, admin, cid, t["id"], "A", materials=[{"type": "file", "file_id": one}]).json())[0]
    plan = client.patch(url(cid, f"/{made['id']}"), json={"materials": [{"type": "file", "file_id": two}]}, headers=admin).json()
    assert [m["title"] for m in subs_of(plan)[0]["materials"]] == ["Two"] and subs_of(plan)[0]["materials"][0]["kind"] == "mp4"


def test_editing_an_unknown_node_is_not_found(client, admin, cid):
    assert client.patch(url(cid, "/nope"), json={"title": "X"}, headers=admin).status_code == 404


# ---- Order ----

def test_move_swaps_with_the_neighbour_and_stops_at_the_ends(client, admin, cid):
    t = topic(client, admin, cid)
    ids = [subs_of(sub(client, admin, cid, t["id"], n).json())[-1]["id"] for n in ("A", "B", "C")]
    titles = lambda plan: [s["title"] for s in subs_of(plan)]
    plan = client.post(url(cid, f"/{ids[2]}/move"), json={"direction": "up"}, headers=admin).json()
    assert titles(plan) == ["A", "C", "B"]
    plan = client.post(url(cid, f"/{ids[0]}/move"), json={"direction": "up"}, headers=admin).json()
    assert titles(plan) == ["A", "C", "B"]
    plan = client.post(url(cid, f"/{ids[0]}/move"), json={"direction": "down"}, headers=admin).json()
    assert titles(plan) == ["C", "A", "B"]
    plan = client.post(url(cid, f"/{ids[1]}/move"), json={"direction": "down"}, headers=admin).json()
    assert titles(plan) == ["C", "A", "B"]
    assert client.post(url(cid, f"/{ids[1]}/move"), json={"direction": "left"}, headers=admin).status_code == 422


def test_topics_move_among_topics_of_the_same_subject(client, admin, cid):
    first = topic(client, admin, cid, "First")
    topic(client, admin, cid, "Second")
    topic(client, admin, cid, "Other subject", LOGIC)
    plan = client.post(url(cid, f"/{first['id']}/move"), json={"direction": "down"}, headers=admin).json()
    quant = next(s for s in plan["subjects"] if s["paper_id"] == QUANT)
    assert [t["title"] for t in quant["topics"]] == ["Second", "First"]
    assert [t["title"] for t in next(s for s in plan["subjects"] if s["paper_id"] == LOGIC)["topics"]] == ["Other subject"]


# ---- Deleting ----

def test_deleting_a_topic_takes_its_subtopics_and_says_how_many(client, admin, cid):
    t = topic(client, admin, cid)
    for name in ("A", "B"):
        sub(client, admin, cid, t["id"], name)
    keep = topic(client, admin, cid, "Keep")
    sub(client, admin, cid, keep["id"], "Stays")
    response = client.delete(url(cid, f"/{t['id']}"), headers=admin)
    assert response.status_code == 200 and response.json()["removed"] == 3
    assert response.json()["counts"] == {"topics": 1, "subtopics": 1, "published": 0, "with_dates": 0}
    assert client.delete(url(cid, f"/{t['id']}"), headers=admin).status_code == 404


def test_deleting_one_subtopic(client, admin, cid):
    t = topic(client, admin, cid)
    a = subs_of(sub(client, admin, cid, t["id"], "A").json())[0]
    sub(client, admin, cid, t["id"], "B")
    response = client.delete(url(cid, f"/{a['id']}"), headers=admin).json()
    assert response["removed"] == 1 and [s["title"] for s in subs_of(response)] == ["B"]


def test_a_subject_date_cannot_be_deleted_as_a_node(client, admin, cid):
    client.patch(url(cid, f"/subjects/{QUANT}"), json={"due": "2027-06-30"}, headers=admin)
    assert client.delete(url(cid, f"/subject-{QUANT}"), headers=admin).status_code == 404


# ---- Files and courses ----

def test_deleting_a_course_file_takes_it_out_of_the_plan(client, admin, cid, repo):
    from app.content import delete_file

    class Storage:
        def delete(self, key):
            pass

    one, two = add_file(repo, cid, "f1", "One"), add_file(repo, cid, "f22", "Two")
    t = topic(client, admin, cid)
    sub(client, admin, cid, t["id"], "A", materials=[{"type": "file", "file_id": one}, {"type": "file", "file_id": two}])
    delete_file(repo.scoped("aaptprep"), Storage(), cid, one)
    plan = client.get(url(cid), headers=admin).json()
    assert [m["title"] for m in subs_of(plan)[0]["materials"]] == ["Two"]


def test_a_subject_taken_off_the_course_still_shows_its_plan(client, admin, cid):
    topic(client, admin, cid, "Kept")
    client.patch(f"/api/admin/courses/{cid}", json={"papers": ["logical-reasoning"]}, headers=admin)
    plan = client.get(url(cid), headers=admin).json()
    quant = next(s for s in plan["subjects"] if s["paper_id"] == QUANT)
    assert quant["in_course"] is False and quant["topics"][0]["title"] == "Kept"
    assert plan["subjects"][0]["paper_id"] == "logical-reasoning"


def test_plans_of_two_courses_do_not_mix(client, admin, school):
    topic(client, admin, school["cat"]["id"], "Only CAT")
    clat = client.get(url(school["clat"]["id"]), headers=admin).json()
    assert clat["counts"]["topics"] == 0


def test_a_plan_has_a_size_limit(client, admin, cid, monkeypatch):
    from app import coursework

    monkeypatch.setattr(coursework, "MAX_NODES", 3)
    t = topic(client, admin, cid)
    sub(client, admin, cid, t["id"], "A")
    sub(client, admin, cid, t["id"], "B")
    full = sub(client, admin, cid, t["id"], "C")
    assert full.status_code == 422 and "up to 3" in full.json()["detail"]
    assert client.post(url(cid, "/topics"), json={"paper_id": QUANT, "title": "More"}, headers=admin).status_code == 422


# ---- Copying from another course ----

DI = "data-interpretation"  # CAT has it, CLAT does not
LEGAL = "legal-reasoning"  # CLAT has it, CAT does not


def copy_url(cid):
    return url(cid, "/copy")


@pytest.fixture
def source(client, admin, school, repo):
    """CAT's plan: Quant has Percentages (three sub-topics, files and a link) and Ratios; Data interpretation has Charts."""
    cid = school["cat"]["id"]
    pdf, video = add_file(repo, cid, "f1", "Percent notes"), add_file(repo, cid, "f22", "Lecture", "mp4")
    client.patch(url(cid, f"/subjects/{QUANT}"), json={"due": "2027-06-30"}, headers=admin)
    percent = topic(client, admin, cid, "Percentages")
    client.patch(url(cid, f"/{percent['id']}"), json={"due": "2027-04-15"}, headers=admin)
    sub(client, admin, cid, percent["id"], "Concepts", note="Read", due="2027-03-01", status="published",
        materials=[{"type": "file", "file_id": pdf}])
    sub(client, admin, cid, percent["id"], "Examples", note="Watch", materials=[{"type": "file", "file_id": video}, {"type": "link", "url": "https://a.com/x", "title": "Extra"}])
    sub(client, admin, cid, percent["id"], "Practice", note="Do it", status="published")
    ratios = topic(client, admin, cid, "Ratios")
    sub(client, admin, cid, ratios["id"], "Basics", note="Hello")
    charts = topic(client, admin, cid, "Charts", DI)
    sub(client, admin, cid, charts["id"], "Bar charts", note="Look")
    plan = client.get(url(cid), headers=admin).json()
    quant = next(s for s in plan["subjects"] if s["paper_id"] == QUANT)["topics"]
    return {"cid": cid, "percent": quant[0], "ratios": quant[1], "charts": next(s for s in plan["subjects"] if s["paper_id"] == DI)["topics"][0],
            "pdf": pdf, "video": video}


def copy(client, admin, school, source, **body):
    return client.post(copy_url(school["clat"]["id"]), json={"source_course_id": source["cid"], **body}, headers=admin)


def clat_plan(client, admin, school):
    return client.get(url(school["clat"]["id"]), headers=admin).json()


def test_copying_a_topic_brings_all_its_subtopics_as_drafts_without_dates(client, admin, school, source):
    response = copy(client, admin, school, source, topic_ids=[source["percent"]["id"]])
    assert response.status_code == 200, response.text
    assert response.json()["copied"] == {"topics_added": 1, "subtopics_added": 3, "subtopics_skipped": 0, "files_linked": 2, "subjects_skipped": []}
    quant = next(s for s in response.json()["subjects"] if s["paper_id"] == QUANT)
    assert quant["due"] is None and quant["topics"][0]["title"] == "Percentages" and quant["topics"][0]["due"] is None
    subs = quant["topics"][0]["subtopics"]
    assert [s["title"] for s in subs] == ["Concepts", "Examples", "Practice"]
    assert {s["status"] for s in subs} == {"draft"} and {s["due"] for s in subs} == {None}
    assert [s["note"] for s in subs] == ["Read", "Watch", "Do it"]
    assert response.json()["counts"] == {"topics": 1, "subtopics": 3, "published": 0, "with_dates": 0}


def test_the_source_course_is_not_changed(client, admin, school, source):
    before = client.get(url(source["cid"]), headers=admin).json()
    copy(client, admin, school, source, topic_ids=[source["percent"]["id"]])
    assert client.get(url(source["cid"]), headers=admin).json() == before


def test_copied_files_are_shared_not_uploaded_again_and_show_in_the_target_files(client, admin, school, source, repo):
    response = copy(client, admin, school, source, topic_ids=[source["percent"]["id"]])
    scoped = repo.scoped("aaptprep")
    target_files = scoped.list_files(school["clat"]["id"])
    assert sorted(f["title"] for f in target_files) == ["Lecture", "Percent notes"]
    assert {f["key"] for f in target_files} == {f"k/{source['pdf']}", f"k/{source['video']}"}
    assert all(f["status"] == "ready" and f["copied_from"] in (source["pdf"], source["video"]) and f["course_id"] == school["clat"]["id"] for f in target_files)
    subs = next(s for s in response.json()["subjects"] if s["paper_id"] == QUANT)["topics"][0]["subtopics"]
    material = [(m["type"], m.get("title")) for s in subs for m in s["materials"]]
    assert material == [("file", "Percent notes"), ("file", "Lecture"), ("link", "Extra")]
    ids = {m["file_id"] for s in subs for m in s["materials"] if m["type"] == "file"}
    assert ids == {f["id"] for f in target_files}


def test_a_file_already_in_the_target_is_reused_not_doubled(client, admin, school, source, repo):
    copy(client, admin, school, source, subtopic_ids=[source["percent"]["subtopics"][0]["id"]])
    copy(client, admin, school, source, subtopic_ids=[source["percent"]["subtopics"][1]["id"]])
    files = repo.scoped("aaptprep").list_files(school["clat"]["id"])
    assert sorted(f["title"] for f in files) == ["Lecture", "Percent notes"]
    again = copy(client, admin, school, source, topic_ids=[source["percent"]["id"]]).json()["copied"]
    assert again["files_linked"] == 0 and len(repo.scoped("aaptprep").list_files(school["clat"]["id"])) == 2


def test_a_single_subtopic_creates_its_topic_when_needed(client, admin, school, source):
    response = copy(client, admin, school, source, subtopic_ids=[source["percent"]["subtopics"][1]["id"]])
    assert response.json()["copied"]["topics_added"] == 1 and response.json()["copied"]["subtopics_added"] == 1
    topic_ = next(s for s in response.json()["subjects"] if s["paper_id"] == QUANT)["topics"][0]
    assert [s["title"] for s in topic_["subtopics"]] == ["Examples"]


def test_a_topic_and_one_of_its_subtopics_together_copy_the_subtopic_once(client, admin, school, source):
    response = copy(client, admin, school, source, topic_ids=[source["percent"]["id"]], subtopic_ids=[source["percent"]["subtopics"][0]["id"]])
    assert response.json()["copied"]["subtopics_added"] == 3


def test_a_topic_that_exists_gets_the_new_subtopics_and_same_named_ones_are_skipped(client, admin, school, source):
    clat = school["clat"]["id"]
    existing = topic(client, admin, clat, "percentages")
    sub(client, admin, clat, existing["id"], "CONCEPTS", note="Mine")
    response = copy(client, admin, school, source, topic_ids=[source["percent"]["id"]])
    assert response.json()["copied"]["topics_added"] == 0 and response.json()["copied"]["subtopics_added"] == 2
    assert response.json()["copied"]["subtopics_skipped"] == 1
    quant = next(s for s in response.json()["subjects"] if s["paper_id"] == QUANT)["topics"]
    assert len(quant) == 1 and [s["title"] for s in quant[0]["subtopics"]] == ["CONCEPTS", "Examples", "Practice"]
    assert quant[0]["subtopics"][0]["note"] == "Mine"


def test_subjects_the_target_does_not_have_are_skipped_and_named(client, admin, school, source):
    response = copy(client, admin, school, source, topic_ids=[source["percent"]["id"], source["charts"]["id"]])
    assert response.json()["copied"]["subjects_skipped"] == ["Data Interpretation"] and response.json()["copied"]["topics_added"] == 1
    assert DI not in [s["paper_id"] for s in response.json()["subjects"]]


def test_keeping_dates_and_status_copies_them_too(client, admin, school, source):
    response = copy(client, admin, school, source, topic_ids=[source["percent"]["id"]], keep_dates=True, keep_status=True)
    quant = next(s for s in response.json()["subjects"] if s["paper_id"] == QUANT)
    assert quant["due"] == "2027-06-30" and quant["topics"][0]["due"] == "2027-04-15"
    subs = quant["topics"][0]["subtopics"]
    assert [s["due"] for s in subs] == ["2027-03-01", None, None] and [s["status"] for s in subs] == ["published", "draft", "published"]
    assert [s["effective_due"] for s in subs] == ["2027-03-01", "2027-04-15", "2027-04-15"]


def test_an_existing_subject_date_in_the_target_is_not_overwritten(client, admin, school, source):
    client.patch(url(school["clat"]["id"], f"/subjects/{QUANT}"), json={"due": "2027-12-31"}, headers=admin)
    response = copy(client, admin, school, source, topic_ids=[source["percent"]["id"]], keep_dates=True)
    assert next(s for s in response.json()["subjects"] if s["paper_id"] == QUANT)["due"] == "2027-12-31"


def test_copying_the_same_selection_twice_adds_nothing_the_second_time(client, admin, school, source):
    copy(client, admin, school, source, topic_ids=[source["percent"]["id"]])
    again = copy(client, admin, school, source, topic_ids=[source["percent"]["id"]]).json()["copied"]
    assert (again["topics_added"], again["subtopics_added"], again["subtopics_skipped"]) == (0, 0, 3)


def test_a_copy_does_not_follow_later_changes_to_the_source(client, admin, school, source):
    copy(client, admin, school, source, topic_ids=[source["percent"]["id"]])
    client.patch(url(source["cid"], f"/{source['percent']['subtopics'][0]['id']}"), json={"title": "Renamed", "note": "Changed"}, headers=admin)
    subs = next(s for s in clat_plan(client, admin, school)["subjects"] if s["paper_id"] == QUANT)["topics"][0]["subtopics"]
    assert subs[0]["title"] == "Concepts" and subs[0]["note"] == "Read"


@pytest.mark.parametrize("body, message", [
    ({}, "Choose at least one"),
    ({"topic_ids": [], "subtopic_ids": []}, "Choose at least one"),
    ({"topic_ids": "x"}, "from the list"),
    ({"topic_ids": [1]}, "from the list"),
    ({"topic_ids": ["nope"]}, "from the list"),
    ({"subtopic_ids": ["nope"]}, "from the list"),
])
def test_a_bad_selection_is_refused_and_nothing_is_copied(client, admin, school, source, body, message):
    response = copy(client, admin, school, source, **body)
    assert response.status_code == 422 and message in response.json()["detail"]
    assert clat_plan(client, admin, school)["counts"]["topics"] == 0


def test_a_topic_id_from_the_target_itself_or_a_subject_id_is_not_a_valid_choice(client, admin, school, source):
    assert copy(client, admin, school, source, topic_ids=[f"subject-{QUANT}"]).status_code == 422


def test_the_source_must_be_another_real_course_of_this_institute(client, admin, school, source):
    clat = school["clat"]["id"]
    for bad in (clat, "nope", None, school["theirs"]["id"], 5):
        response = client.post(copy_url(clat), json={"source_course_id": bad, "topic_ids": ["x"]}, headers=admin)
        assert response.status_code == 422 and ("different course" in response.json()["detail"] or "course to copy from" in response.json()["detail"])


def test_an_unknown_target_course_is_not_found(client, admin, source):
    assert client.post(copy_url("nope"), json={"source_course_id": source["cid"], "topic_ids": ["x"]}, headers=admin).status_code == 404


def test_only_the_admin_can_copy(client, school, source, sign_in, add_member):
    add_member("aaptprep", "asha@example.com", role="student")
    student = sign_in("aaptprep", "asha@example.com")
    assert client.post(copy_url(school["clat"]["id"]), json={"source_course_id": source["cid"], "topic_ids": ["x"]}, headers=student).status_code == 403


def test_a_shared_file_stays_in_storage_until_the_last_course_stops_using_it(client, admin, school, source, repo):
    from app.content import delete_file

    class Storage:
        def __init__(self):
            self.deleted = []

        def delete(self, key):
            self.deleted.append(key)

    copy(client, admin, school, source, topic_ids=[source["percent"]["id"]])
    scoped = repo.scoped("aaptprep")
    storage = Storage()
    delete_file(scoped, storage, source["cid"], source["pdf"])
    assert storage.deleted == []  # CLAT's copy still uses it
    clat_pdf = next(f for f in scoped.list_files(school["clat"]["id"]) if f["title"] == "Percent notes")
    delete_file(scoped, storage, school["clat"]["id"], clat_pdf["id"])
    assert storage.deleted == [f"k/{source['pdf']}"]


def test_deleting_the_original_file_leaves_the_copy_working(client, admin, school, source, repo):
    from app.content import delete_file

    class Storage:
        def delete(self, key):
            pass

    copy(client, admin, school, source, topic_ids=[source["percent"]["id"]])
    delete_file(repo.scoped("aaptprep"), Storage(), source["cid"], source["pdf"])
    subs = next(s for s in clat_plan(client, admin, school)["subjects"] if s["paper_id"] == QUANT)["topics"][0]["subtopics"]
    assert [m["title"] for m in subs[0]["materials"]] == ["Percent notes"]
    assert [m["title"] for m in next(s for s in client.get(url(source["cid"]), headers=admin).json()["subjects"] if s["paper_id"] == QUANT)["topics"][0]["subtopics"][0]["materials"]] == []


def test_copying_respects_the_size_limit(client, admin, school, source, monkeypatch):
    from app import coursework

    monkeypatch.setattr(coursework, "MAX_NODES", 3)
    response = copy(client, admin, school, source, topic_ids=[source["percent"]["id"]])
    assert response.status_code == 422 and "up to 3" in response.json()["detail"]
