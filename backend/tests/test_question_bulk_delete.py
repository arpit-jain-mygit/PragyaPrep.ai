"""Bulk delete: needs the word DELETE, removes questions and their pictures, one institute at a time."""
import pytest

from conftest import headers
from test_question_images import exists, ready_picture, s3  # noqa: F401
from test_questions import URL, admin, question, school  # noqa: F401

BULK = f"{URL}/delete"


def make(client, admin, n):
    return [client.post(URL, json=question(text=f"Question {i}"), headers=admin).json()["id"] for i in range(n)]


def left(client, admin):
    return {item["id"] for item in client.get(URL, headers=admin).json()}


def test_chosen_questions_are_deleted_and_the_rest_stay(client, admin):
    a, b, c = make(client, admin, 3)
    response = client.post(BULK, json={"ids": [a, b], "confirm": "DELETE"}, headers=admin)
    assert response.status_code == 200
    assert response.json() == {"deleted": 2, "missing": 0, "blocked": 0}
    assert left(client, admin) == {c}


def test_unknown_and_repeated_ids_are_counted_not_errors(client, admin):
    a, b = make(client, admin, 2)
    response = client.post(BULK, json={"ids": [a, a, "nope"], "confirm": "DELETE"}, headers=admin)
    assert response.json() == {"deleted": 1, "missing": 1, "blocked": 0}
    assert left(client, admin) == {b}


@pytest.mark.parametrize("confirm", [None, "", "delete", "Delete", " DELETE", "DELETE ", True, 1])
def test_without_the_exact_word_nothing_is_deleted(client, admin, confirm):
    (a,) = make(client, admin, 1)
    assert client.post(BULK, json={"ids": [a], "confirm": confirm}, headers=admin).status_code == 422
    assert left(client, admin) == {a}


@pytest.mark.parametrize("ids", [[], None, "abc", [1, 2], ["x"] * 0, [f"q{i}" for i in range(501)]])
def test_bad_lists_are_refused(client, admin, ids):
    assert client.post(BULK, json={"ids": ids, "confirm": "DELETE"}, headers=admin).status_code == 422


def test_the_pictures_go_too(client, admin, repo, s3):
    a, b = ready_picture(client, s3, repo, admin), ready_picture(client, s3, repo, admin)
    saved = client.post(URL, json=question(images={"question": a, "C": b}), headers=admin).json()
    keys = [repo.scoped("aaptprep").get_image(i)["key"] for i in (a, b)]
    assert client.post(BULK, json={"ids": [saved["id"]], "confirm": "DELETE"}, headers=admin).json()["deleted"] == 1
    assert not any(exists(s3, key) for key in keys)
    assert repo.scoped("aaptprep").get_image(a) is None and repo.scoped("aaptprep").get_image(b) is None


def test_only_an_admin_can_use_it(client, admin, sign_in):
    (a,) = make(client, admin, 1)
    student = sign_in("aaptprep", "asha@example.com")
    body = {"ids": [a], "confirm": "DELETE"}
    assert client.post(BULK, json=body, headers=headers("aaptprep")).status_code == 401
    assert client.post(BULK, json=body, headers=student).status_code == 403
    assert left(client, admin) == {a}


def test_another_institute_cannot_delete_our_questions(client, admin, make_tenant, sign_in):
    (a,) = make(client, admin, 1)
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    assert client.post(BULK, json={"ids": [a], "confirm": "DELETE"}, headers=other).json() == {"deleted": 0, "missing": 1, "blocked": 0}
    assert left(client, admin) == {a}
