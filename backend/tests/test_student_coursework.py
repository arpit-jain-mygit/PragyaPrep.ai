"""Coursework for students: they see published sub-topics of their courses with progress, and mark them complete."""
import pytest

from test_coursework import QUANT, LOGIC, add_file, sub, topic, url as admin_url

MINE = "/api/my/coursework"
# The fake clock starts on 15 Jan 2027, India time.
PAST, SOON, LATER = "2027-01-10", "2027-01-20", "2027-03-01"


@pytest.fixture
def school(make_tenant, add_member, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")
    add_member("aaptprep", "ravi@example.com")
    return {"cat": add_course("aaptprep", "CAT"), "clat": add_course("aaptprep", "CLAT")}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


def give(client, admin, email, course):
    assert client.post(f"/api/admin/registrations/{email}/access", json={"course_id": course["id"]}, headers=admin).status_code == 201


@pytest.fixture
def plan(client, admin, school, repo):
    """CAT: Quant has Percentages (Concepts with a file and a link, due soon; Examples following the topic's past date; Practice a draft)
    and Ratios (Basics, later). Logic has only a draft. CLAT: Quant has Percentages with Concepts."""
    cid = school["cat"]["id"]
    pdf = add_file(repo, cid, "f1", "Percent notes")
    percent = topic(client, admin, cid, "Percentages")
    client.patch(admin_url(cid, f"/{percent['id']}"), json={"due": PAST}, headers=admin)
    sub(client, admin, cid, percent["id"], "Concepts", note="Read first", due=SOON, status="published",
        materials=[{"type": "file", "file_id": pdf}, {"type": "link", "url": "https://youtu.be/abc", "title": "Intro"}])
    sub(client, admin, cid, percent["id"], "Examples", note="Watch", status="published")
    sub(client, admin, cid, percent["id"], "Practice", note="Later")
    ratios = topic(client, admin, cid, "Ratios")
    sub(client, admin, cid, ratios["id"], "Basics", note="Hello", due=LATER, status="published")
    puzzles = topic(client, admin, cid, "Puzzles", LOGIC)
    sub(client, admin, cid, puzzles["id"], "Warmup", note="Draft only")
    clat = school["clat"]["id"]
    c_percent = topic(client, admin, clat, "Percentages")
    sub(client, admin, clat, c_percent["id"], "Concepts", note="CLAT version", status="published")
    return {"pdf": pdf}


@pytest.fixture
def asha(school, admin, sign_in, plan, client):
    give(client, admin, "asha@example.com", school["cat"])
    return sign_in("aaptprep", "asha@example.com")


def mine(client, token):
    return client.get(MINE, headers=token).json()


def find(data, course, title):
    for c in data["courses"]:
        if c["name"] == course:
            for s in c["subjects"]:
                for t in s["topics"]:
                    for x in t["subtopics"]:
                        if x["title"] == title:
                            return x
    raise AssertionError(f"{title} not found in {course}")


def mark(client, token, course, sub_id, done=True):
    method = client.put if done else client.delete
    return method(f"{MINE}/{course['id']}/{sub_id}/done", headers=token)


# ---- Who can use it ----

def test_only_signed_in_students_can_use_it(client, school, admin, asha):
    from conftest import headers

    assert client.get(MINE, headers=headers("aaptprep")).status_code == 401
    assert client.get(MINE, headers=admin).status_code == 403


def test_a_student_with_no_access_sees_only_the_free_sample_open(client, school, plan, sign_in):
    data = mine(client, sign_in("aaptprep", "ravi@example.com"))
    assert [(c["name"], c["locked"]) for c in data["courses"]] == [("CAT", True), ("CLAT", True)]
    open_ones = [s["title"] for c in data["courses"] for sub_ in c["subjects"] for t in sub_["topics"] for s in t["subtopics"] if not s["locked"]]
    assert open_ones == ["Concepts"]
    assert data["summary"] == {"total": 1, "done": 0, "left": 1, "overdue": 0, "this_week": 1}


# ---- What they see ----

def test_students_see_only_published_subtopics_and_no_empty_topics_or_subjects(client, asha):
    data = mine(client, asha)
    assert [(c["name"], c["locked"]) for c in data["courses"]] == [("CAT", False), ("CLAT", True)]
    cat = data["courses"][0]
    assert [s["paper_id"] for s in cat["subjects"]] == [QUANT]  # Logic has only a draft, so it is left out
    topics = cat["subjects"][0]["topics"]
    assert [(t["title"], [s["title"] for s in t["subtopics"]]) for t in topics] == [("Percentages", ["Concepts", "Examples"]), ("Ratios", ["Basics"])]


def test_progress_starts_at_zero_with_totals_at_every_level(client, asha):
    cat = mine(client, asha)["courses"][0]
    assert cat["progress"] == {"total": 3, "done": 0}
    assert cat["subjects"][0]["progress"] == {"total": 3, "done": 0}
    assert [t["progress"] for t in cat["subjects"][0]["topics"]] == [{"total": 2, "done": 0}, {"total": 1, "done": 0}]


def test_dates_follow_the_nearest_one_and_overdue_means_past_and_not_done(client, asha):
    data = mine(client, asha)
    concepts, examples, basics = find(data, "CAT", "Concepts"), find(data, "CAT", "Examples"), find(data, "CAT", "Basics")
    assert (concepts["due"], concepts["due_from"], concepts["days_left"], concepts["overdue"]) == (SOON, "subtopic", 5, False)
    assert (examples["due"], examples["due_from"], examples["days_left"], examples["overdue"]) == (PAST, "topic", -5, True)
    assert (basics["due"], basics["days_left"], basics["overdue"]) == (LATER, 45, False)
    assert data["summary"] == {"total": 3, "done": 0, "left": 3, "overdue": 1, "this_week": 1}
    assert data["courses"][0]["overdue"] == 1


def test_a_subtopic_with_no_date_has_none_and_is_never_overdue(client, admin, school, asha):
    cid = school["cat"]["id"]
    plan = client.get(admin_url(cid), headers=admin).json()
    ratios = next(t for s in plan["subjects"] if s["paper_id"] == QUANT for t in s["topics"] if t["title"] == "Ratios")
    sub(client, admin, cid, ratios["id"], "No date", note="x", status="published")
    item = find(mine(client, asha), "CAT", "No date")
    assert (item["due"], item["due_from"], item["days_left"], item["overdue"]) == (None, None, None, False)


def test_the_material_shows_files_and_links_without_any_storage_key(client, asha, school, plan):
    concepts = find(mine(client, asha), "CAT", "Concepts")
    assert concepts["note"] == "Read first"
    assert concepts["materials"] == [
        {"type": "file", "file_id": plan["pdf"], "title": "Percent notes", "kind": "pdf", "size": 10},
        {"type": "link", "url": "https://youtu.be/abc", "title": "Intro"},
    ]
    assert "k/" not in str(mine(client, asha))


def test_a_file_in_the_plan_opens_through_the_normal_expiring_link(client, asha, school, plan):
    response = client.get(f"/api/my/courses/{school['cat']['id']}/files/{plan['pdf']}/link", headers=asha)
    assert response.status_code == 200 and response.json()["url"].startswith("http")


def test_a_file_that_is_gone_or_unfinished_is_left_out_of_the_material(client, admin, school, asha, repo, plan):
    from app.content import delete_file

    class Storage:
        def delete(self, key):
            pass

    delete_file(repo.scoped("aaptprep"), Storage(), school["cat"]["id"], plan["pdf"])
    assert [m["type"] for m in find(mine(client, asha), "CAT", "Concepts")["materials"]] == ["link"]


def test_unpublishing_hides_a_subtopic_again(client, admin, school, asha):
    cid = school["cat"]["id"]
    sub_id = next(s["id"] for s in client.get(admin_url(cid), headers=admin).json()["subjects"][3]["topics"][0]["subtopics"] if s["title"] == "Examples")
    client.patch(admin_url(cid, f"/{sub_id}"), json={"status": "draft"}, headers=admin)
    assert mine(client, asha)["summary"]["total"] == 2


# ---- Marking complete ----

def test_marking_complete_updates_progress_at_every_level_and_the_summary(client, school, asha):
    concepts = find(mine(client, asha), "CAT", "Concepts")
    response = mark(client, asha, school["cat"], concepts["id"])
    assert response.status_code == 200
    data = response.json()
    done = find(data, "CAT", "Concepts")
    assert done["done"] is True and done["done_at"]
    cat = data["courses"][0]
    assert cat["progress"] == {"total": 3, "done": 1} and cat["subjects"][0]["progress"] == {"total": 3, "done": 1}
    assert [t["progress"] for t in cat["subjects"][0]["topics"]] == [{"total": 2, "done": 1}, {"total": 1, "done": 0}]
    assert data["summary"] == {"total": 3, "done": 1, "left": 2, "overdue": 1, "this_week": 0}
    assert mine(client, asha) == data  # it is saved


def test_completing_an_overdue_one_clears_its_overdue_flag(client, school, asha):
    examples = find(mine(client, asha), "CAT", "Examples")
    data = mark(client, asha, school["cat"], examples["id"]).json()
    assert find(data, "CAT", "Examples")["overdue"] is False and data["summary"]["overdue"] == 0 and data["courses"][0]["overdue"] == 0


def test_marking_twice_keeps_the_first_time_and_undoing_works(client, school, asha, fake_clock):
    item = find(mine(client, asha), "CAT", "Concepts")
    first = find(mark(client, asha, school["cat"], item["id"]).json(), "CAT", "Concepts")["done_at"]
    fake_clock.advance(3600)
    assert find(mark(client, asha, school["cat"], item["id"]).json(), "CAT", "Concepts")["done_at"] == first
    undone = mark(client, asha, school["cat"], item["id"], done=False).json()
    assert find(undone, "CAT", "Concepts")["done"] is False and undone["summary"]["done"] == 0
    assert mark(client, asha, school["cat"], item["id"], done=False).status_code == 200  # undoing what isn't done is fine


def test_one_students_progress_does_not_touch_another(client, admin, school, asha, sign_in):
    give(client, admin, "ravi@example.com", school["cat"])
    ravi = sign_in("aaptprep", "ravi@example.com")
    item = find(mine(client, asha), "CAT", "Concepts")
    mark(client, asha, school["cat"], item["id"])
    assert mine(client, ravi)["summary"]["done"] == 0
    assert mine(client, asha)["summary"]["done"] == 1


def test_a_draft_an_unknown_id_a_topic_id_or_a_course_without_access_cannot_be_marked(client, admin, school, asha):
    cid = school["cat"]["id"]
    plan = client.get(admin_url(cid), headers=admin).json()
    quant = next(s for s in plan["subjects"] if s["paper_id"] == QUANT)["topics"][0]
    draft = next(s for s in quant["subtopics"] if s["title"] == "Practice")
    assert mark(client, asha, school["cat"], draft["id"]).status_code == 404
    assert mark(client, asha, school["cat"], "nope").status_code == 404
    assert mark(client, asha, school["cat"], quant["id"]).status_code == 404
    other = next(s for s in client.get(admin_url(school["clat"]["id"]), headers=admin).json()["subjects"] if s["paper_id"] == QUANT)["topics"][0]["subtopics"][0]
    assert mark(client, asha, school["clat"], other["id"]).status_code == 404
    assert mark(client, asha, school["cat"], other["id"]).status_code == 404  # right sub-topic id, wrong course


def test_an_admin_cannot_mark_anything(client, admin, school, asha):
    item = find(mine(client, asha), "CAT", "Concepts")
    assert client.put(f"{MINE}/{school['cat']['id']}/{item['id']}/done", headers=admin).status_code == 403


# ---- Several courses, and access ending ----

def test_two_courses_are_listed_by_name_with_separate_progress_for_the_same_subject(client, admin, school, asha):
    give(client, admin, "asha@example.com", school["clat"])
    data = mine(client, asha)
    assert [c["name"] for c in data["courses"]] == ["CAT", "CLAT"]
    mark(client, asha, school["cat"], find(data, "CAT", "Concepts")["id"])
    data = mine(client, asha)
    assert [c["progress"] for c in data["courses"]] == [{"total": 3, "done": 1}, {"total": 1, "done": 0}]
    assert data["summary"] == {"total": 4, "done": 1, "left": 3, "overdue": 1, "this_week": 0}
    assert find(data, "CLAT", "Concepts")["note"] == "CLAT version" and find(data, "CLAT", "Concepts")["done"] is False


def test_when_access_ends_the_coursework_disappears_and_progress_returns_with_new_access(client, admin, school, asha, repo):
    scoped = repo.scoped("aaptprep")
    item = find(mine(client, asha), "CAT", "Examples")
    mark(client, asha, school["cat"], item["id"])
    access = scoped.get_access("asha@example.com", school["cat"]["id"])
    scoped.put_access("asha@example.com", {k: v for k, v in access.items() if k not in ("PK", "SK")} | {"expires_at": "2020-01-01T00:00:00+05:30"})
    assert find(mine(client, asha), "CAT", "Examples")["locked"] is True
    assert mark(client, asha, school["cat"], item["id"], done=False).status_code == 404
    give(client, admin, "asha@example.com", school["cat"])
    assert find(mine(client, asha), "CAT", "Examples")["done"] is True


def test_progress_moves_with_the_student_when_their_email_is_changed(client, admin, school, asha, repo):
    scoped = repo.scoped("aaptprep")
    item = find(mine(client, asha), "CAT", "Concepts")
    mark(client, asha, school["cat"], item["id"])
    member = scoped.get_member("asha@example.com")
    scoped.move_member("asha@example.com", {k: v for k, v in member.items() if k not in ("PK", "SK", "GSI1PK", "GSI1SK")} | {"email": "asha.new@example.com"})
    assert scoped.list_done("asha@example.com") == []
    assert [(d["course_id"], d["subtopic_id"]) for d in scoped.list_done("asha.new@example.com")] == [(school["cat"]["id"], item["id"])]
