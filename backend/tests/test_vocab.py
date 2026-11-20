"""Vocabulary and Idioms: the admin's list, cut into daily packs, with a test on each day's pack that the server marks."""
import pytest

from app import clock, vocab, word_of_day
from conftest import headers  # noqa: F401
from test_student_tests import admin, asha, school  # noqa: F401

WORDS = "/api/admin/words"
MY = "/api/my/vocab/{kind}"

WORD_LIST = [("ephemeral", "lasting a very short time"), ("lucid", "clear and easy to understand"), ("candid", "truthful and direct"),
             ("tenacious", "holding firmly, persistent"), ("meticulous", "very careful about details"), ("gregarious", "fond of company"),
             ("frugal", "careful with money")]


@pytest.fixture
def words(client, admin):
    for word, meaning in WORD_LIST:
        assert client.post(WORDS, json={"word": word, "meaning": meaning, "example": ""}, headers=admin).status_code == 201
    return WORD_LIST


def test_the_admin_keeps_words_and_idioms_in_separate_lists(client, admin, words):
    assert client.post(WORDS, json={"kind": "idiom", "word": "break the ice", "meaning": "start a conversation", "example": ""}, headers=admin).status_code == 201
    assert [row["word"] for row in client.get(WORDS, headers=admin).json()] == [w for w, _ in WORD_LIST]
    idioms = client.get(f"{WORDS}?kind=idiom", headers=admin).json()
    assert [row["word"] for row in idioms] == ["break the ice"]


def test_an_unknown_kind_of_list_is_refused(client, admin):
    assert client.get(f"{WORDS}?kind=poem", headers=admin).status_code == 422


def test_a_student_sees_todays_pack_and_a_calendar_around_it(client, asha, words):
    body = client.get(MY.format(kind="vocabulary"), headers=asha).json()
    assert body["packs"] == 2
    assert [row["word"] for row in body["today"]["items"]] == [w for w, _ in WORD_LIST][
        (body["today"]["pack"] - 1) * 5:(body["today"]["pack"] - 1) * 5 + 5]
    assert len(body["days"]) == 7
    assert [day["date"] for day in body["days"]] == sorted(day["date"] for day in body["days"])


def test_the_same_pack_is_shown_to_everyone_on_the_same_day(client, asha, admin, words):
    first = client.get(MY.format(kind="vocabulary"), headers=asha).json()
    second = client.get(MY.format(kind="vocabulary"), headers=asha).json()
    assert first == second


def test_a_test_gives_four_choices_per_word_and_hides_the_right_answer(client, asha, words):
    made = client.post(MY.format(kind="vocabulary") + "/test", headers=asha).json()["questions"]
    assert 1 <= len(made) <= 5
    assert all(len(item["options"]) == 4 and "answer" not in item for item in made)
    assert all(len(set(item["options"])) == 4 for item in made)


def test_marking_counts_the_right_choices_and_says_what_each_word_means(client, asha, words):
    made = client.post(MY.format(kind="vocabulary") + "/test", headers=asha).json()["questions"]
    meanings = dict(WORD_LIST)
    right = [item["options"].index(meanings[item["word"]]) for item in made]
    wrong = [(answer + 1) % 4 for answer in right]
    perfect = client.post(MY.format(kind="vocabulary") + "/test/answers", json={"answers": right}, headers=asha).json()
    assert perfect["score"] == len(made) == perfect["total"]
    assert all(row["right"] and row["meaning"] == meanings[row["word"]] for row in perfect["results"])
    none_right = client.post(MY.format(kind="vocabulary") + "/test/answers", json={"answers": wrong}, headers=asha).json()
    assert none_right["score"] == 0
    skipped = client.post(MY.format(kind="vocabulary") + "/test/answers", json={"answers": [None] * len(made)}, headers=asha).json()
    assert skipped["score"] == 0


def test_a_test_with_the_wrong_number_of_answers_is_refused(client, asha, words):
    refused = client.post(MY.format(kind="vocabulary") + "/test/answers", json={"answers": [0]}, headers=asha)
    assert refused.status_code == 422
    assert "one answer for each word" in refused.json()["detail"]


def test_a_test_needs_at_least_four_entries(client, admin, asha):
    client.post(WORDS, json={"word": "only", "meaning": "one", "example": ""}, headers=admin)
    refused = client.post(MY.format(kind="vocabulary") + "/test", headers=asha)
    assert refused.status_code == 422
    assert "at least 4" in refused.json()["detail"]


def test_idioms_are_their_own_list(client, admin, asha, words):
    client.post(WORDS, json={"kind": "idiom", "word": "break the ice", "meaning": "start a conversation", "example": ""}, headers=admin)
    body = client.get(MY.format(kind="idioms"), headers=asha).json()
    assert body["packs"] == 1 and body["today"]["items"][0]["word"] == "break the ice"


def test_an_empty_list_has_no_pack_yet(client, asha):
    body = client.get(MY.format(kind="vocabulary"), headers=asha).json()
    assert body == {"packs": 0, "today": None, "days": []}
