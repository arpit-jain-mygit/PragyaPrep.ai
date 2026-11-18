"""Free mode: a student without a course sees every course locked, except one free sample sub-topic that opens for everyone."""
from test_coursework import add_file, sub, topic
from test_student_coursework import admin, asha, find, mine, plan, school  # noqa: F401 (fixtures)


def link(client, who, course, file_id):
    return client.get(f"/api/my/courses/{course['id']}/files/{file_id}/link", headers=who)


def done(client, who, course, sub_id, put=True):
    path = f"/api/my/coursework/{course['id']}/{sub_id}/done"
    return client.put(path, headers=who) if put else client.delete(path, headers=who)


def ravi(sign_in):
    return sign_in("aaptprep", "ravi@example.com")


def test_locked_sub_topics_show_a_title_and_nothing_else(client, school, plan, sign_in):  # noqa: F811
    data = mine(client, ravi(sign_in))
    examples = find(data, "CAT", "Examples")
    assert examples == {"id": examples["id"], "title": "Examples", "locked": True, "note": "", "due": None, "due_from": None, "days_left": None,
                        "overdue": False, "done": False, "done_at": None, "materials": []}
    clat = find(data, "CLAT", "Concepts")
    assert clat["locked"] is True and clat["note"] == ""
    assert "Watch" not in str(data) and "CLAT version" not in str(data)


def test_the_free_sample_is_the_first_published_sub_topic_of_the_first_topic_of_the_first_course(client, school, plan, sign_in):
    concepts = find(mine(client, ravi(sign_in)), "CAT", "Concepts")
    assert concepts["locked"] is False and concepts["free"] is True
    assert concepts["note"] == "Read first"
    assert [m["type"] for m in concepts["materials"]] == ["file", "link"]


def test_the_sample_skips_drafts_and_empty_courses(client, admin, school, sign_in):
    clat = school["clat"]["id"]
    first = topic(client, admin, clat, "Percentages")
    sub(client, admin, clat, first["id"], "Draft first", note="x")
    sub(client, admin, clat, first["id"], "Published second", note="y", status="published")
    data = mine(client, ravi(sign_in))
    assert [c["name"] for c in data["courses"]] == ["CLAT"]
    assert find(data, "CLAT", "Published second")["free"] is True


def test_enrolled_students_see_their_course_unlocked_and_others_locked(client, school, asha):
    data = mine(client, asha)
    assert [(c["name"], c["locked"]) for c in data["courses"]] == [("CAT", False), ("CLAT", True)]
    assert all(not x["locked"] and not x["free"] for x in [find(data, "CAT", t) for t in ("Concepts", "Examples", "Basics")])
    assert find(data, "CLAT", "Concepts")["locked"] is True
    assert data["summary"]["total"] == 3


def test_the_home_numbers_count_only_what_is_open(client, school, plan, sign_in):
    assert mine(client, ravi(sign_in))["summary"]["total"] == 1


def test_inactive_courses_are_not_listed(client, admin, school, plan, sign_in, repo):
    repo.scoped("aaptprep").update_course(school["clat"]["id"], active=False)
    assert [c["name"] for c in mine(client, ravi(sign_in))["courses"]] == ["CAT"]


def test_the_free_files_open_without_the_course_but_locked_ones_do_not(client, school, plan, sign_in, repo):
    cat = school["cat"]
    extra = add_file(repo, cat["id"], "f2", "Locked notes")
    who = ravi(sign_in)
    assert link(client, who, cat, "f1").status_code == 200
    assert link(client, who, cat, extra).status_code == 404
    assert link(client, who, school["clat"], "f1").status_code == 404


def test_a_free_sub_topic_can_be_marked_complete_but_a_locked_one_cannot(client, school, plan, sign_in):
    who = ravi(sign_in)
    data = mine(client, who)
    concepts, examples = find(data, "CAT", "Concepts"), find(data, "CAT", "Examples")
    assert done(client, who, school["cat"], concepts["id"]).status_code == 200
    assert find(mine(client, who), "CAT", "Concepts")["done"] is True
    assert done(client, who, school["cat"], examples["id"]).status_code == 404
    assert done(client, who, school["cat"], concepts["id"], put=False).status_code == 200


def test_live_classes_stay_for_enrolled_students_only(client, admin, school, plan, sign_in):
    client.post(f"/api/admin/courses/{school['cat']['id']}/live-classes", json={"title": "Live", "held_on": "2027-02-01", "description": "x", "status": "published"}, headers=admin)
    assert client.get("/api/my/live-classes", headers=ravi(sign_in)).json() == []
