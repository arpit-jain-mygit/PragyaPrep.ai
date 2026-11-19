"""Keyword search over the coursework a student can open (no AI). Only published, attached, readable material of courses the
student has access to is searched; each hit says where it sits in the plan and its page."""
import pytest

from app import papers as paper_list
from test_coursework import QUANT, add_file, sub, topic, url as admin_url

SEARCH = "/api/my/study/search"


@pytest.fixture
def school(make_tenant, add_member, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    make_tenant("other", "Other", "boss@example.com")
    add_member("aaptprep", "asha@example.com")
    return {"cat": add_course("aaptprep", "CAT"), "clat": add_course("aaptprep", "CLAT"), "theirs": add_course("other", "CAT")}


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


@pytest.fixture
def asha(client, school, admin, sign_in):
    client.post("/api/admin/registrations/asha@example.com/access", json={"course_id": school["cat"]["id"]}, headers=admin)
    return sign_in("aaptprep", "asha@example.com")


def give_file(repo, course_id, file_id, title, passages, ai_status="ready"):
    """A ready PDF with its text already read, as the upload would leave it."""
    scoped = repo.scoped("aaptprep")
    add_file(repo, course_id, file_id, title)
    scoped.set_file_reading(course_id, file_id, {"ai_status": ai_status, "ai_pages": 2, "ai_passages": len(passages)})
    scoped.put_course_passages(course_id, file_id, [{"number": n, "page": page, "text": text} for n, (page, text) in enumerate(passages)])


@pytest.fixture
def plan(client, admin, school, repo):
    cat = school["cat"]["id"]
    percent = topic(client, admin, cat, "Percentages")
    give_file(repo, cat, "census", "Census notes", [
        (1, "Uttar Pradesh is the most populous state in the Census 2011 count."),
        (2, "Sikkim is the least populous state in the Census 2011 count."),
    ])
    sub(client, admin, cat, percent["id"], "Census", note="Read first", status="published",
        materials=[{"type": "file", "file_id": "census"}])
    give_file(repo, cat, "draft", "Unpublished notes", [(1, "Uttar Pradesh draft notes about the population.")])
    sub(client, admin, cat, percent["id"], "Draft only", note="Not yet", materials=[{"type": "file", "file_id": "draft"}])
    give_file(repo, cat, "scanned", "Scanned notes", [(1, "Uttar Pradesh text that the reader could not trust.")], ai_status="unreadable")
    sub(client, admin, cat, percent["id"], "Scan", note="Scanned", status="published", materials=[{"type": "file", "file_id": "scanned"}])
    clat = school["clat"]["id"]
    give_file(repo, clat, "clat", "CLAT notes", [(1, "Uttar Pradesh population in the CLAT course.")])
    c_topic = topic(client, admin, clat, "Percentages")
    sub(client, admin, clat, c_topic["id"], "Census", note="CLAT", status="published", materials=[{"type": "file", "file_id": "clat"}])
    return {"cat": cat, "clat": clat}


def search(client, student, q):
    return client.get(SEARCH, params={"q": q}, headers=student)


def test_a_question_finds_the_passage_with_its_place_in_the_plan(client, plan, asha):
    response = search(client, asha, "Which state is the most populous?")
    assert response.status_code == 200, response.text
    hits = response.json()["hits"]
    assert hits, "the question should match the census passages"
    hit = hits[0]
    assert hit["course"] == "CAT"
    assert hit["subject"] == paper_list.BY_ID[QUANT]["name"]
    assert hit["topic"] == "Percentages" and hit["subtopic"] == "Census"
    assert hit["file"] == "Census notes" and hit["page"] == 1
    assert "Uttar Pradesh" in hit["snippet"]
    assert {h["file"] for h in hits} == {"Census notes"}
    assert hit["file_id"] == "census" and hit["course_id"] == plan["cat"]


def test_an_unpublished_or_unreadable_or_other_course_is_never_searched(client, plan, asha):
    hits = search(client, asha, "Uttar Pradesh population").json()["hits"]
    files = {h["file"] for h in hits}
    assert "Unpublished notes" not in files
    assert "Scanned notes" not in files
    assert "CLAT notes" not in files
    assert files == {"Census notes"}


def test_a_course_the_student_cannot_open_is_not_searched(client, plan, admin, school, repo, sign_in):
    other = sign_in("aaptprep", "asha@example.com")
    client.delete(f"/api/admin/registrations/asha@example.com/access/{school['cat']['id']}", headers=admin)
    assert search(client, other, "Uttar Pradesh").json()["hits"] == []


def test_a_question_with_no_match_gives_no_hits(client, plan, asha):
    response = search(client, asha, "photosynthesis in leaves")
    assert response.status_code == 200
    assert response.json()["hits"] == []


@pytest.mark.parametrize("q", ["", "   ", "the of and", "a"])
def test_a_question_with_no_real_words_is_refused(client, plan, asha, q):
    assert search(client, asha, q).status_code == 422


def test_the_best_match_comes_first(client, admin, school, repo, plan, asha):
    cat = school["cat"]["id"]
    give_file(repo, cat, "more", "Extra notes", [(3, "Uttar Pradesh. Uttar Pradesh is populous. The population of Uttar Pradesh is large.")])
    percent = topic(client, admin, cat, "Ratios")
    sub(client, admin, cat, percent["id"], "Extra", note="More", status="published", materials=[{"type": "file", "file_id": "more"}])
    hits = search(client, asha, "Uttar Pradesh population").json()["hits"]
    assert hits[0]["file"] == "Extra notes"
    assert hits[0]["score"] >= hits[-1]["score"]


def test_only_students_can_search(client, plan, admin):
    assert client.get(SEARCH, params={"q": "Uttar Pradesh"}, headers=admin).status_code in (401, 403)


def test_another_institutes_course_is_never_searched(client, plan, asha, repo, school):
    give_file(repo, school["theirs"]["id"], "theirs", "Their notes", [(1, "Uttar Pradesh is in their institute only.")])
    files = {h["file"] for h in search(client, asha, "Uttar Pradesh").json()["hits"]}
    assert "Their notes" not in files


# ---- Ranking ----

def test_common_question_words_do_not_count(client, admin, school, repo, plan, asha):
    """'Which state has the highest' is mostly filler; the real words are what must match."""
    hits = search(client, asha, "Which state has the highest population?").json()["hits"]
    assert hits and hits[0]["page"] == 1


def test_a_rare_word_outranks_a_common_one(client, admin, school, repo, plan, asha):
    cat = school["cat"]["id"]
    percent = topic(client, admin, cat, "Lagoons")
    give_file(repo, cat, "ports", "Port notes", [(1, "Kochi is a harbour on a lagoon near the sea."), (2, "A state is a unit of a federal country.")])
    sub(client, admin, cat, percent["id"], "Ports", note="Ports", status="published", materials=[{"type": "file", "file_id": "ports"}])
    hits = search(client, asha, "Vembanad lagoon state").json()["hits"]
    assert hits[0]["file"] == "Port notes" and hits[0]["page"] == 1


def test_a_self_check_list_ranks_below_the_notes_it_tests(client, admin, school, repo, plan, asha):
    cat = school["cat"]["id"]
    percent = topic(client, admin, cat, "Quiz")
    give_file(repo, cat, "quiz", "Quiz sheet", [(1, "Q. Which state is most populous? Answer: Uttar Pradesh.")])
    sub(client, admin, cat, percent["id"], "Quiz", note="Test yourself", status="published", materials=[{"type": "file", "file_id": "quiz"}])
    hits = search(client, asha, "Uttar Pradesh populous").json()["hits"]
    notes = [h for h in hits if h["file"] == "Census notes"]
    quiz = [h for h in hits if h["file"] == "Quiz sheet"]
    assert notes and quiz
    assert notes[0]["score"] > quiz[0]["score"]


def test_a_long_passage_comes_back_as_a_short_snippet_around_the_match(client, admin, school, repo, plan, asha):
    cat = school["cat"]["id"]
    words = " ".join(f"filler{i}" for i in range(120)) + " Sardar Sarovar is on the Narmada river. " + " ".join(f"tail{i}" for i in range(120))
    percent = topic(client, admin, cat, "Dams")
    give_file(repo, cat, "dams", "Dam notes", [(4, words)])
    sub(client, admin, cat, percent["id"], "Dams", note="Dams", status="published", materials=[{"type": "file", "file_id": "dams"}])
    hit = next(h for h in search(client, asha, "Sardar Sarovar Narmada").json()["hits"] if h["file"] == "Dam notes")
    assert "Sardar Sarovar" in hit["snippet"] and "Narmada" in hit["snippet"]
    assert len(hit["snippet"].split()) <= 45
    assert hit["snippet"].startswith("...") and hit["snippet"].endswith("...")


def test_the_snippet_is_the_window_with_the_most_question_words(client, admin, school, repo, plan, asha):
    """Two equally rare words appear early in one place and together later: the snippet must show the later place."""
    cat = school["cat"]["id"]
    text = "natural harbour of India. " + " ".join(f"filler{i}" for i in range(90)) + " Kochi is a natural harbour at the head of the Vembanad lagoon."
    percent = topic(client, admin, cat, "Harbours")
    give_file(repo, cat, "harbours", "Harbour notes", [(2, text)])
    sub(client, admin, cat, percent["id"], "Harbours", note="Harbours", status="published", materials=[{"type": "file", "file_id": "harbours"}])
    hit = next(h for h in search(client, asha, "natural harbour Vembanad lagoon").json()["hits"] if h["file"] == "Harbour notes")
    assert "Vembanad" in hit["snippet"] and "lagoon" in hit["snippet"]


# ---- Coverage: when the best passage covers enough of the question to be worth an answer ----

def test_a_question_fully_covered_by_one_passage_is_confident(client, admin, school, repo, plan, asha):
    cat = school["cat"]["id"]
    ports = topic(client, admin, cat, "Ports")
    give_file(repo, cat, "kochi", "Ports notes", [(2, "Kochi is a natural harbour at the head of the Vembanad lagoon in Kerala.")])
    sub(client, admin, cat, ports["id"], "Kochi", note="Kochi", status="published", materials=[{"type": "file", "file_id": "kochi"}])
    body = search(client, asha, "Which port is a natural harbour at the head of the Vembanad lagoon?").json()
    assert body["hits"][0]["file"] == "Ports notes"
    assert body["hits"][0]["coverage"] >= 0.6
    assert body["confident"] is True


def test_a_question_with_one_loose_common_word_is_not_confident(client, plan, asha):
    body = search(client, asha, "state of mind").json()
    assert body["confident"] is False


def test_no_match_is_never_confident(client, plan, asha):
    body = search(client, asha, "photosynthesis in leaves").json()
    assert body["hits"] == [] and body["confident"] is False


def test_coverage_is_a_fraction_of_the_question(client, plan, asha):
    hit = search(client, asha, "Uttar Pradesh population").json()["hits"][0]
    assert 0 < hit["coverage"] <= 1


# ---- Weak matches are hidden, and each hit says which question words it contains ----

def test_a_result_with_only_one_common_word_is_hidden(client, plan, asha):
    """'port' alone matches a passage about ports, but covers too little of the question to show."""
    body = search(client, asha, "Which port is a natural harbour at the head of the Vembanad lagoon?").json()
    assert all(h["coverage"] >= 0.3 for h in body["hits"])


def test_each_hit_lists_the_question_words_it_contains(client, plan, asha):
    hit = search(client, asha, "Uttar Pradesh population").json()["hits"][0]
    assert "uttar" in hit["matched"] and "pradesh" in hit["matched"]
