"""Daily RC and Weekly DILR attempts: a student opens today's passage as a practice test on its own questions."""
import pytest

from app import clock
from conftest import headers  # noqa: F401
from test_student_tests import admin, asha, school, q  # noqa: F401

RELEASES = "/api/admin/releases"
ATTEMPT = "/api/my/releases/{kind}/attempt"


def _passage(client, admin, title, text):
    body = {"title": title, "text": text}
    made = client.post("/api/admin/passages", json=body, headers=admin)
    if made.status_code == 201:
        return made.json()["id"]
    return next(row["id"] for row in client.get("/api/admin/passages", headers=admin).json() if row["title"] == title)


def _question_on_passage(client, admin, passage_text, text):
    return q(client, admin, text, passage_text=passage_text)["id"]


def _switch(client, admin, key, on=True):
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": on if row["key"] == key else row["enabled"], "label": row["label"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200


def _release_today(client, admin, passage_id, today):
    body = {"kind": "daily_rc", "passage_ids": [passage_id], "date": today}
    assert client.post(RELEASES, json=body, headers=admin).status_code == 201


def test_a_student_opens_todays_passage_as_a_practice_test_on_its_questions(client, admin, asha, school):
    today = clock.today_india().isoformat()
    passage = _passage(client, admin, "Passage A", "Read the text and answer.")
    _question_on_passage(client, admin, "Read the text and answer.", "Q1 on A")
    _question_on_passage(client, admin, "Read the text and answer.", "Q2 on A")
    _release_today(client, admin, passage, today)
    made = client.post(ATTEMPT.format(kind="daily_rc"), headers=asha)
    assert made.status_code == 201, made.text
    assert made.json()["question_count"] == 2
    again = client.post(ATTEMPT.format(kind="daily_rc"), headers=asha)
    assert again.json()["id"] == made.json()["id"]


def test_nothing_set_for_today_is_refused_plainly(client, admin, asha):
    refused = client.post(ATTEMPT.format(kind="daily_rc"), headers=asha)
    assert refused.status_code == 422
    assert "Nothing is set for today yet." in refused.json()["detail"]


def test_a_passage_without_questions_is_refused(client, admin, asha):
    today = clock.today_india().isoformat()
    passage = _passage(client, admin, "Passage empty", "No questions on this one.")
    _release_today(client, admin, passage, today)
    refused = client.post(ATTEMPT.format(kind="daily_rc"), headers=asha)
    assert refused.status_code == 422
    assert "no published questions" in refused.json()["detail"]


def test_a_switched_off_kind_is_not_available(client, admin, asha):
    _switch(client, admin, "weekly_dilr", on=False)
    assert client.post(ATTEMPT.format(kind="weekly_dilr"), headers=asha).status_code == 404


def test_an_unknown_kind_is_not_found(client, asha):
    assert client.post(ATTEMPT.format(kind="monthly"), headers=asha).status_code == 404
