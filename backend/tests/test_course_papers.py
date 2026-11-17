"""Papers (subjects) on a course: suggested from the course name, chosen and changed by the admin."""
import pytest

from app import papers as paper_list
from conftest import headers
from test_courses import admin, school  # noqa: F401

COURSES = "/api/admin/courses"
SUGGEST = "/api/admin/course-papers/suggested"


def add(client, admin, name, **extra):
    response = client.post(COURSES, json={"name": name, "fee": 1000, **extra}, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


# ---- The suggestions ----

def test_the_four_courses_have_their_usual_papers():
    assert len(paper_list.suggested_for("CUET")) == 37
    assert paper_list.suggested_for("IPMAT") == ["quantitative-ability", "verbal-ability-rc", "logical-reasoning"]
    assert set(paper_list.suggested_for("CAT")) == {"verbal-ability-rc", "data-interpretation", "logical-reasoning", "quantitative-ability"}
    assert set(paper_list.suggested_for("CLAT")) == {
        "verbal-ability-rc", "current-affairs-gk", "legal-reasoning", "logical-reasoning", "quantitative-ability"}


def test_cuet_gets_exactly_the_original_37_and_none_of_the_new_papers():
    ids = paper_list.suggested_for("CUET")
    assert not any(paper_list.BY_ID[i]["section"].startswith("IV") for i in ids)
    assert {paper_list.BY_ID[i]["section"] for i in ids} == {"I: Language", "II: Domain", "III: General"}


@pytest.mark.parametrize("name,expected", [
    ("cat", True), ("CAT 2027", True), ("Crash-course CAT", True), ("IPMAT (Indore)", True), ("clat-ug", True),
    ("Category", False), ("Concatenate", False), ("Foundation", False), ("", False)])
def test_the_course_name_is_matched_by_whole_word(name, expected):
    assert bool(paper_list.suggested_for(name)) is expected


def test_every_suggested_id_is_a_real_paper():
    assert all(i in paper_list.BY_ID for ids in paper_list.SUGGESTED.values() for i in ids)


def test_the_form_can_ask_for_the_suggestion_by_name(client, admin):
    assert client.get(f"{SUGGEST}?name=CAT", headers=admin).json() == {"papers": paper_list.suggested_for("CAT")}
    assert client.get(f"{SUGGEST}?name=Maths", headers=admin).json() == {"papers": []}
    assert client.get(SUGGEST, headers=admin).json() == {"papers": []}


# ---- Adding and changing ----

def test_a_new_course_with_a_known_name_gets_the_usual_papers(client, admin):
    assert add(client, admin, "CLAT")["papers"] == paper_list.suggested_for("CLAT")


def test_a_new_course_with_an_unknown_name_has_none(client, admin):
    assert add(client, admin, "Foundation")["papers"] == []


def test_papers_chosen_by_the_admin_win_over_the_suggestion(client, admin):
    assert add(client, admin, "CAT", papers=["physics", "english"])["papers"] == ["english", "physics"]
    assert add(client, admin, "CLAT", papers=[])["papers"] == []


def test_papers_are_kept_once_in_the_lists_own_order(client, admin):
    made = add(client, admin, "Mixed", papers=["physics", "english", "physics", "logical-reasoning"])
    assert made["papers"] == ["english", "physics", "logical-reasoning"]


def test_the_admin_can_change_the_papers_and_other_fields_stay(client, admin):
    made = add(client, admin, "CAT")
    response = client.patch(f"{COURSES}/{made['id']}", json={"papers": ["quantitative-ability"]}, headers=admin)
    assert response.status_code == 200 and response.json()["papers"] == ["quantitative-ability"]
    assert response.json()["fee"] == 1000 and response.json()["name"] == "CAT"
    client.patch(f"{COURSES}/{made['id']}", json={"fee": 2000}, headers=admin)
    assert client.get(COURSES, headers=admin).json()[0]["papers"] == ["quantitative-ability"]  # a fee change keeps them


def test_the_admin_can_clear_all_papers(client, admin):
    made = add(client, admin, "CAT")
    assert client.patch(f"{COURSES}/{made['id']}", json={"papers": []}, headers=admin).json()["papers"] == []


@pytest.mark.parametrize("bad", ["physics", ["nope"], [1], [None], {"a": 1}, True, 5])
def test_bad_papers_are_refused(client, admin, bad):
    made = add(client, admin, "CAT")
    assert client.post(COURSES, json={"name": "New", "fee": 1, "papers": bad}, headers=admin).status_code == 422
    response = client.patch(f"{COURSES}/{made['id']}", json={"papers": bad}, headers=admin)
    assert response.status_code == 422 and "subjects" in response.json()["detail"].lower()
    assert client.get(COURSES, headers=admin).json()[0]["papers"] == paper_list.suggested_for("CAT")


def test_a_course_saved_before_this_feature_shows_no_papers(client, admin, add_course):
    add_course("aaptprep", "Old course")
    assert [c["papers"] for c in client.get(COURSES, headers=admin).json() if c["name"] == "Old course"] == [[]]


def test_the_public_list_does_not_show_papers(client, admin, add_course):
    add_course("aaptprep", "CAT")
    assert "papers" not in client.get("/api/courses", headers=headers("aaptprep")).json()[0]


# ---- Who may ----

def test_only_an_admin_can_change_papers_or_ask_for_suggestions(client, admin, sign_in):
    made = add(client, admin, "CAT")
    student = sign_in("aaptprep", "asha@example.com")
    for method, path, body in (("get", f"{SUGGEST}?name=CAT", None), ("patch", f"{COURSES}/{made['id']}", {"papers": []})):
        assert client.request(method, path, json=body, headers=headers("aaptprep")).status_code == 401
        assert client.request(method, path, json=body, headers=student).status_code == 403


def test_another_institute_cannot_change_our_papers(client, admin, make_tenant, sign_in):
    made = add(client, admin, "CAT")
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    assert client.patch(f"{COURSES}/{made['id']}", json={"papers": []}, headers=other).status_code == 404
    assert client.get(COURSES, headers=admin).json()[0]["papers"] == paper_list.suggested_for("CAT")


# ---- The fee is no longer set from the Courses page ----

def test_a_course_can_be_added_without_a_fee_and_keeps_zero(client, admin):
    made = add_no_fee(client, admin, "Foundation")
    assert made["fee"] == 0


def test_a_course_with_an_old_fee_keeps_it_when_other_things_change(client, admin):
    made = add(client, admin, "Old", fee=5000)
    assert client.patch(f"{COURSES}/{made['id']}", json={"name": "Older"}, headers=admin).json()["fee"] == 5000


def add_no_fee(client, admin, name):
    response = client.post(COURSES, json={"name": name}, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()
