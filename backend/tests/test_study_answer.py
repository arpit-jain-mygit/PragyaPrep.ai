"""Answers from the coursework: written only when the notes clearly cover the question, from the top passages, with citations.
The model is a fake here, so no AI is called and nothing costs money."""
import pytest

from app import study_answer
from test_study_search import admin, asha, plan, school, give_file  # noqa: F401  (fixtures)
from test_coursework import sub, topic

ASK = "/api/my/study/ask"


@pytest.fixture
def counting(monkeypatch):
    model = study_answer.FakeAnswerModel()
    monkeypatch.setattr(study_answer, "MODEL", model)
    return model


def ask(client, student, question):
    return client.post(ASK, json={"question": question}, headers=student)


def test_a_confident_question_is_answered_from_the_notes_with_its_source(client, plan, asha, counting):
    response = ask(client, asha, "Which state is the most populous in Census 2011?")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["answered"] is True
    assert counting.calls == 1
    assert "(From Census notes, page 1.)" in body["answer"]
    assert body["citations"][0]["file"] == "Census notes" and body["citations"][0]["page"] == 1
    assert body["citations"][0]["subtopic"] == "Census"


def test_the_answer_quotes_the_notes_and_adds_nothing(client, plan, asha, counting):
    body = ask(client, asha, "Which state is the most populous in Census 2011?").json()
    quoted = body["answer"].split(" (From ")[0]
    assert quoted in "Uttar Pradesh is the most populous state in the Census 2011 count."


def test_a_question_the_notes_do_not_cover_is_not_answered_and_no_model_runs(client, plan, asha, counting):
    body = ask(client, asha, "photosynthesis in leaves").json()
    assert body["answered"] is False and body["answer"] is None and body["citations"] == []
    assert body["hits"] == []
    assert counting.calls == 0


def test_a_weak_match_is_not_answered(client, plan, asha, counting):
    body = ask(client, asha, "state of mind").json()
    assert body["answered"] is False
    assert counting.calls == 0


def test_passages_that_are_not_confident_are_still_listed(client, admin, school, repo, plan, asha, counting):
    """When the answer is refused the search results are still there, so the student can read them."""
    cat = school["cat"]["id"]
    percent = topic(client, admin, cat, "Harbours")
    give_file(repo, cat, "harbours", "Harbour notes", [(2, "Kochi is a natural harbour at the head of the Vembanad lagoon.")])
    sub(client, admin, cat, percent["id"], "Harbours", note="Harbours", status="published", materials=[{"type": "file", "file_id": "harbours"}])
    body = ask(client, asha, "Which port is a natural harbour at the head of the Vembanad lagoon?").json()
    assert body["answered"] is True
    assert any(h["file"] == "Harbour notes" for h in body["hits"])


def test_the_citations_are_listed_once_per_passage(client, plan, asha, counting):
    body = ask(client, asha, "Which state is the most populous in Census 2011?").json()
    keys = [(c["file_id"], c["page"]) for c in body["citations"]]
    assert len(keys) == len(set(keys))


def test_a_question_too_short_is_refused(client, plan, asha, counting):
    assert ask(client, asha, "a").status_code == 422
    assert counting.calls == 0


def test_only_students_can_ask(client, plan, admin, counting):
    assert client.post(ASK, json={"question": "Uttar Pradesh"}, headers=admin).status_code in (401, 403)
    assert counting.calls == 0


def test_the_fake_model_names_the_passage_it_used(counting):
    passages = [{"file": "Notes", "page": 4, "snippet": "Plain intro. Kochi is a natural harbour in Kerala. Other text.", "matched": ["kochi", "harbour"]}]
    text = counting.write("Which port?", passages)
    assert text == "Kochi is a natural harbour in Kerala. (From Notes, page 4.)"
