"""Bulk publish: change the status of many questions at once."""
import pytest

from conftest import headers
from test_questions import URL, admin, question, school  # noqa: F401

BULK = f"{URL}/status"


def make(client, admin, status, n=1):
    return [client.post(URL, json=question(text=f"Question {status} {i}", status=status), headers=admin).json()["id"] for i in range(n)]


def statuses(client, admin):
    return {item["id"]: item["status"] for item in client.get(URL, headers=admin).json()}


def test_chosen_drafts_are_published_and_the_rest_are_left_alone(client, admin):
    a, b, c = make(client, admin, "draft", 3)
    response = client.post(BULK, json={"ids": [a, b], "status": "published"}, headers=admin)
    assert response.status_code == 200
    assert response.json() == {"changed": 2, "unchanged": 0, "missing": 0}
    assert statuses(client, admin) == {a: "published", b: "published", c: "draft"}


def test_it_records_who_changed_them(client, admin):
    (a,) = make(client, admin, "draft")
    client.post(BULK, json={"ids": [a], "status": "published"}, headers=admin)
    item = client.get(URL, headers=admin).json()[0]
    assert item["edited_by"] == "ritesh@example.com" and item["edited_at"]


def test_published_questions_can_go_back_to_draft(client, admin):
    (a,) = make(client, admin, "published")
    assert client.post(BULK, json={"ids": [a], "status": "draft"}, headers=admin).json()["changed"] == 1
    assert statuses(client, admin) == {a: "draft"}


def test_questions_already_in_that_status_and_unknown_ids_are_counted(client, admin):
    (a,) = make(client, admin, "published")
    (b,) = make(client, admin, "draft")
    response = client.post(BULK, json={"ids": [a, b, "nope", a], "status": "published"}, headers=admin)
    assert response.json() == {"changed": 1, "unchanged": 1, "missing": 1}


@pytest.mark.parametrize(
    "body",
    [
        {"ids": [], "status": "published"},
        {"ids": None, "status": "published"},
        {"ids": "abc", "status": "published"},
        {"ids": [1, 2], "status": "published"},
        {"ids": ["x"], "status": "live"},
        {"ids": ["x"], "status": True},
        {"ids": ["x"]},
    ],
)
def test_bad_requests_are_refused(client, admin, body):
    assert client.post(BULK, json=body, headers=admin).status_code == 422


def test_other_fields_are_untouched(client, admin):
    (a,) = make(client, admin, "draft")
    before = client.get(URL, headers=admin).json()[0]
    client.post(BULK, json={"ids": [a], "status": "published"}, headers=admin)
    after = client.get(URL, headers=admin).json()[0]
    for field in ("text", "options", "correct", "paper", "topic", "difficulty", "created_at"):
        assert after[field] == before[field]


def test_only_an_admin_can_use_it(client, admin, sign_in):
    (a,) = make(client, admin, "draft")
    student = sign_in("aaptprep", "asha@example.com")
    assert client.post(BULK, json={"ids": [a], "status": "published"}, headers=headers("aaptprep")).status_code == 401
    assert client.post(BULK, json={"ids": [a], "status": "published"}, headers=student).status_code == 403
    assert statuses(client, admin) == {a: "draft"}


def test_another_institute_cannot_change_our_questions(client, admin, make_tenant, sign_in):
    (a,) = make(client, admin, "draft")
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    assert client.post(BULK, json={"ids": [a], "status": "published"}, headers=other).json()["missing"] == 1
    assert statuses(client, admin) == {a: "draft"}


def test_there_is_no_limit_on_how_many_can_be_changed_at_once(client, admin, repo):
    scoped = repo.scoped("aaptprep")
    ids = []
    for i in range(1200):
        item = {"id": f"bulk{i:05d}", "paper": "physics", "topic": "Optics", "text": f"Bulk {i}", "kind": "mcq", "options": [], "correct": 0,
                "difficulty": "easy", "status": "draft", "images": {}, "created_at": f"2027-01-01T00:{i // 60:02d}:{i % 60:02d}+00:00"}
        scoped.create_question(item)
        ids.append(item["id"])
    response = client.post(BULK, json={"ids": ids + ["nope"], "status": "published"}, headers=admin)
    assert response.status_code == 200 and response.json() == {"changed": 1200, "unchanged": 0, "missing": 1}
    assert all(q["status"] == "published" and q["edited_by"] == "ritesh@example.com" for q in client.get(URL, headers=admin).json())
    again = client.post(BULK, json={"ids": ids, "status": "published"}, headers=admin).json()
    assert again == {"changed": 0, "unchanged": 1200, "missing": 0}
