"""The Ask AI log: each student question is saved with how well the notes covered it, for the admin to review.
Students' names and emails stay hidden unless the admin asks to see them, rows expire after 30 days, and one institute
never sees another's log."""
from app import study_log
from test_study_search import admin, asha, plan, school, give_file  # noqa: F401  (fixtures)
from test_study_answer import ask  # noqa: F401  (helper)

LOG = "/api/admin/study-log"
CONFIDENT = "Which state is the most populous in Census 2011?"
NOT_COVERED = "photosynthesis in leaves"
WEAK = "state of mind"  # best match 0.32: under 75%, but not under 30%


def admin_log(client, admin_headers, **params):
    response = client.get(LOG, params=params, headers=admin_headers)
    assert response.status_code == 200, response.text
    return response.json()["rows"]


def stored(repo, slug="aaptprep"):
    return repo.scoped(slug).list_ask_logs()


def test_a_confident_question_is_logged_with_its_score_and_marked_answered(client, plan, asha, repo):
    ask(client, asha, CONFIDENT)
    [row] = stored(repo)
    assert row["question"] == CONFIDENT
    assert row["answered"] is True
    assert row["best_coverage"] == 1.0
    assert row["matches"] >= 1


def test_a_question_with_no_match_is_logged_with_zero(client, plan, asha, repo):
    ask(client, asha, NOT_COVERED)
    [row] = stored(repo)
    assert row["answered"] is False
    assert row["best_coverage"] == 0.0
    assert row["matches"] == 0


def test_each_row_expires_thirty_days_after_it_was_asked(client, plan, asha, repo, fake_clock):
    ask(client, asha, CONFIDENT)
    [row] = stored(repo)
    assert row["ttl"] - int(fake_clock()) == study_log.RETENTION_SECONDS == 30 * 24 * 3600


def test_the_admin_list_hides_students_by_default(client, plan, admin, asha):
    ask(client, asha, CONFIDENT)
    [row] = admin_log(client, admin)
    assert "student_email" not in row and "student_name" not in row
    assert row["question"] == CONFIDENT


def test_the_admin_can_ask_to_see_which_student_asked(client, plan, admin, asha):
    ask(client, asha, CONFIDENT)
    [row] = admin_log(client, admin, show_student="true")
    assert row["student_email"] == "asha@example.com"
    assert row["student_name"] == "Asha Rao"


def test_under_30_shows_only_questions_with_no_passage_above_the_show_line(client, plan, admin, asha):
    """Below 0.3 the app hides every passage. 'state of mind' scores 0.32, so it is under 75% but not under 30%."""
    ask(client, asha, CONFIDENT)
    ask(client, asha, NOT_COVERED)
    ask(client, asha, WEAK)
    rows = admin_log(client, admin, match="under_30")
    assert [row["question"] for row in rows] == [NOT_COVERED]
    assert all(row["best_coverage"] < 0.3 for row in rows)


def test_under_75_shows_every_question_that_is_not_a_strong_match(client, plan, admin, asha):
    ask(client, asha, CONFIDENT)
    ask(client, asha, NOT_COVERED)
    ask(client, asha, WEAK)
    rows = admin_log(client, admin, match="under_75")
    assert sorted(row["question"] for row in rows) == sorted([NOT_COVERED, WEAK])
    assert all(row["best_coverage"] < 0.75 for row in rows)


def test_all_shows_every_question(client, plan, admin, asha):
    ask(client, asha, CONFIDENT)
    ask(client, asha, NOT_COVERED)
    assert len(admin_log(client, admin, match="all")) == 2


def test_an_unknown_match_is_refused(client, admin):
    assert client.get(LOG, params={"match": "everything"}, headers=admin).status_code == 422


def test_a_student_cannot_open_the_admin_log(client, asha):
    assert client.get(LOG, headers=asha).status_code == 403


def test_another_institute_never_sees_this_log(client, plan, admin, asha, school, sign_in):
    ask(client, asha, CONFIDENT)
    other_admin = sign_in("other", "boss@example.com")
    assert admin_log(client, other_admin) == []


def test_a_failure_to_save_the_log_does_not_stop_the_answer(client, plan, asha, repo, monkeypatch):
    def broken(self, record):
        raise RuntimeError("database down")

    monkeypatch.setattr(type(repo.scoped("aaptprep")), "create_ask_log", broken)
    response = ask(client, asha, CONFIDENT)
    assert response.status_code == 200
    assert response.json()["answered"] is True


def test_each_row_keeps_where_the_passages_are_in_the_coursework(client, plan, admin, asha, school):
    ask(client, asha, CONFIDENT)
    [row] = admin_log(client, admin)
    source = row["sources"][0]
    assert source["course"] == "CAT"
    assert source["file"] == "Census notes" and source["page"] == 1
    assert source["file_id"] == "census" and source["course_id"] == school["cat"]["id"]
    assert source["topic"] == "Percentages" and source["subtopic"] == "Census"


def test_the_admin_can_open_a_referred_file(client, plan, admin, school):
    response = client.get(f"/api/admin/courses/{school['cat']['id']}/files/census/link", headers=admin)
    assert response.status_code == 200, response.text
    assert response.json()["url"]


def test_a_student_cannot_use_the_admin_file_link(client, plan, asha, school):
    response = client.get(f"/api/admin/courses/{school['cat']['id']}/files/census/link", headers=asha)
    assert response.status_code == 403


def test_a_file_that_is_not_ready_cannot_be_opened_from_the_log(client, plan, admin, school):
    response = client.get(f"/api/admin/courses/{school['cat']['id']}/files/no-such-file/link", headers=admin)
    assert response.status_code == 404


def test_worst_matches_can_be_listed_first(client, plan, admin, asha):
    ask(client, asha, CONFIDENT)
    ask(client, asha, NOT_COVERED)
    ask(client, asha, WEAK)
    rows = admin_log(client, admin, sort="worst")
    scores = [row["best_coverage"] for row in rows]
    assert scores == sorted(scores)
    assert rows[0]["question"] == NOT_COVERED


def test_an_unknown_sort_is_refused(client, admin):
    assert client.get(LOG, params={"sort": "random"}, headers=admin).status_code == 422


def walk_log(client, admin_headers, limit, **params):
    """Follow the cursors through the log, one page at a time. Returns every page in order."""
    pages, before = [], None
    for _ in range(50):  # a safety stop, so a broken cursor cannot loop forever
        query = {**params, "limit": limit, **({"before": before} if before else {})}
        response = client.get(LOG, params=query, headers=admin_headers)
        assert response.status_code == 200, response.text
        pages.append(response.json()["rows"])
        before = response.headers.get("X-Next-Cursor") or None
        if before is None:
            return pages
    raise AssertionError("the cursor never ran out")


def test_the_log_comes_in_pages_and_every_question_appears_once(client, plan, admin, asha):
    ask(client, asha, CONFIDENT)
    ask(client, asha, NOT_COVERED)
    ask(client, asha, WEAK)
    pages = walk_log(client, admin, limit=2)
    assert [len(page) for page in pages] == [2, 1]
    questions = [row["question"] for page in pages for row in page]
    assert sorted(questions) == sorted([CONFIDENT, NOT_COVERED, WEAK])


def test_paging_keeps_the_order_and_the_filter(client, plan, admin, asha):
    ask(client, asha, CONFIDENT)
    ask(client, asha, NOT_COVERED)
    ask(client, asha, WEAK)
    pages = walk_log(client, admin, limit=1, sort="worst", match="under_75")
    scores = [page[0]["best_coverage"] for page in pages]
    assert scores == sorted(scores)
    assert all(score < 0.75 for score in scores)
    assert len(scores) == 2  # the confident question is left out by the filter


def test_a_bad_page_cursor_is_refused(client, admin):
    assert client.get(LOG, params={"before": "abc"}, headers=admin).status_code == 422
