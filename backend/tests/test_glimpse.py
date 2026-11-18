"""The public outline of the courses: names only, no institute, no sign-in."""
import pytest

from test_coursework import sub, topic


@pytest.fixture
def school(make_tenant, add_course, client, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    admin = sign_in("aaptprep", "ritesh@example.com")
    cat, clat = add_course("aaptprep", "CAT"), add_course("aaptprep", "CLAT")
    percent = topic(client, admin, cat["id"], "Percentages")
    sub(client, admin, cat["id"], percent["id"], "Concepts", note="Secret note", status="published", materials=[{"type": "link", "url": "https://secret.example/x"}])
    sub(client, admin, cat["id"], percent["id"], "Drafted", note="draft")
    topic(client, admin, cat["id"], "Empty topic")
    return {"cat": cat, "clat": clat}


def test_anyone_can_read_the_outline_without_signing_in_or_naming_an_institute(client, school):
    response = client.get("/api/public/glimpse")
    assert response.status_code == 200 and "max-age" in response.headers["cache-control"]
    courses = response.json()["courses"]
    assert [c["name"] for c in courses] == ["CAT"]  # CLAT has no published sub-topic
    quant = courses[0]["subjects"][0]
    assert quant["name"] == "Quantitative Ability"
    assert quant["topics"] == [{"title": "Percentages", "subtopics": ["Concepts"]}]


def test_it_carries_names_only(client, school):
    text = client.get("/api/public/glimpse").text
    for secret in ("Secret note", "secret.example", "Drafted", "Empty topic", "AaptPrep", "aaptprep", "ritesh"):
        assert secret not in text


def test_hidden_courses_are_left_out_and_a_missing_institute_gives_an_empty_list(client, school, repo, monkeypatch):
    repo.scoped("aaptprep").update_course(school["cat"]["id"], active=False)
    assert client.get("/api/public/glimpse").json() == {"courses": []}
    client.app.state.settings.glimpse_tenant = "nobody"
    assert client.get("/api/public/glimpse").json() == {"courses": []}
