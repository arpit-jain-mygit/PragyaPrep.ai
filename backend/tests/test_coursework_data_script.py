"""The demo coursework script: sample files and a plan for each course, and removing them again."""
import pytest

from app import content, coursework
from scripts.coursework_data import seed_coursework as seed

BATCH = "demo-coursework-test"


@pytest.fixture
def school(make_tenant, add_course):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    return {"cat": add_course("aaptprep", "CAT"), "clat": add_course("aaptprep", "CLAT"), "hidden": add_course("aaptprep", "OLD", active=False)}


@pytest.fixture
def storage(client):
    return client.app.state.storage


@pytest.fixture
def scoped(repo, school):
    return repo.scoped("aaptprep")


def run(repo, storage, subjects=2, topics=2, seed_value=7, batch=BATCH):
    return seed.create(repo, storage, "aaptprep", subjects, topics, seed_value, batch, use_ffmpeg=False, log=lambda *_: None)


def subtopics(plan):
    return [s for subject in plan["subjects"] for t in subject["topics"] for s in t["subtopics"]]


# ---- The sample files ----

def test_the_sample_pdf_is_a_real_pdf_with_pages():
    data = seed.make_pdf(3)
    assert data.startswith(b"%PDF-1.4") and data.rstrip().endswith(b"%%EOF") and data.count(b"/Type /Page ") == 3
    assert content.looks_like("pdf", data[:16])
    startxref = int(data.rsplit(b"startxref", 1)[1].split()[0])
    assert data[startxref:startxref + 4] == b"xref"


def test_the_stand_in_video_passes_the_mp4_check():
    assert content.looks_like("mp4", seed.make_video(use_ffmpeg=False)[:16])


# ---- Planning ----

def test_the_plan_writes_nothing_and_leaves_out_hidden_courses(repo, school, scoped, capsys):
    seed.plan(repo, "aaptprep", 2, 2, 7, BATCH)
    out = capsys.readouterr().out
    assert "CAT" in out and "CLAT" in out and "OLD" not in out and "Nothing has been written" in out
    assert scoped.list_work(school["cat"]["id"]) == [] and scoped.list_files(school["cat"]["id"]) == []


def test_the_outline_is_the_same_for_a_seed_and_follows_the_course_subjects(school):
    one = seed.outline(school["cat"], 2, 2, 7)
    assert one == seed.outline(school["cat"], 2, 2, 7)
    assert [s["paper_id"] for s in one] == school["cat"]["papers"][:2]
    assert all(len(s["topics"]) == 2 and all(len(t["subtopics"]) == 3 for t in s["topics"]) for s in one)


# ---- Creating ----

def test_each_course_gets_the_same_two_sample_files_in_its_own_folder(repo, storage, school, scoped):
    result = run(repo, storage)
    assert result["courses"] == 2 and result["files"] == 4 and result["skipped"] == 0
    for name in ("cat", "clat"):
        cid = school[name]["id"]
        files = scoped.list_files(cid)
        assert sorted((f["title"], f["kind"], f["status"]) for f in files) == [("Sample lecture (dummy)", "mp4", "ready"), ("Sample notes (dummy)", "pdf", "ready")]
        for file in files:
            assert file["key"].startswith(f"aaptprep/courses/{cid}/") and file["demo_seed"] == BATCH
            assert storage.size(file["key"]) == file["size"]
            assert content.looks_like(file["kind"], storage.read_head(file["key"]))
    assert scoped.list_files(school["hidden"]["id"]) == []


def test_the_plan_has_topics_and_three_subtopics_each_with_real_material(repo, storage, school, scoped):
    result = run(repo, storage)
    assert result["topics"] == 8 and result["subtopics"] == 24
    plan = coursework.tree(scoped, school["cat"]["id"])
    assert plan["counts"]["topics"] == 4 and plan["counts"]["subtopics"] == 12
    for topic in (t for s in plan["subjects"] for t in s["topics"]):
        concepts, examples, practice = topic["subtopics"]
        assert [m["kind"] for m in concepts["materials"]] == ["pdf"]
        assert [m["kind"] for m in examples["materials"]] == ["mp4"]
        assert [m["type"] for m in practice["materials"]] == ["file", "file", "link"]
        assert all(m["title"] for s in topic["subtopics"] for m in s["materials"])


def test_every_subtopic_has_a_future_date_and_the_middle_one_follows_its_topic(repo, storage, school, scoped, fake_clock):
    from app import clock

    run(repo, storage)
    today = clock.today_india().isoformat()
    plan = coursework.tree(scoped, school["cat"]["id"])
    planned = [s for s in plan["subjects"] if s["topics"]]
    assert len(planned) == 2
    for subject in planned:
        assert subject["due"] and subject["due"] > today
        for topic in subject["topics"]:
            assert topic["due"] and topic["due"] > today
            concepts, examples, practice = topic["subtopics"]
            assert concepts["due_from"] == "subtopic" and practice["due_from"] == "subtopic"
            assert (examples["due"], examples["due_from"], examples["effective_due"]) == (None, "topic", topic["due"])
    assert all(s["effective_due"] > today for s in subtopics(plan))


def test_most_subtopics_are_published_and_a_few_stay_drafts(repo, storage, school, scoped):
    run(repo, storage, subjects=4, topics=3)
    statuses = [s["status"] for s in subtopics(coursework.tree(scoped, school["cat"]["id"]))]
    assert statuses.count("published") > len(statuses) // 2 and "draft" in statuses


def test_everything_written_is_tagged(repo, storage, school, scoped):
    run(repo, storage)
    nodes = scoped.list_work(school["cat"]["id"])
    assert nodes and all(n["demo_seed"] == BATCH for n in nodes)
    assert {n["kind"] for n in nodes} == {"subject", "topic", "subtopic"}


def test_a_course_with_a_plan_already_is_left_alone(repo, storage, school, scoped):
    coursework.add_topic(scoped, school["cat"]["id"], school["cat"]["papers"][0], "My own topic")
    result = run(repo, storage)
    assert result["skipped"] == 1 and result["courses"] == 1
    assert scoped.list_files(school["cat"]["id"]) == [] and coursework.tree(scoped, school["cat"]["id"])["counts"]["topics"] == 1


def test_running_it_again_adds_nothing(repo, storage, school, scoped):
    run(repo, storage)
    before = [len(scoped.list_work(school[n]["id"])) + len(scoped.list_files(school[n]["id"])) for n in ("cat", "clat")]
    again = run(repo, storage)
    assert again["courses"] == 0 and again["skipped"] == 2
    assert [len(scoped.list_work(school[n]["id"])) + len(scoped.list_files(school[n]["id"])) for n in ("cat", "clat")] == before


def test_a_course_with_no_subjects_gets_files_once_and_no_plan(repo, storage, add_course, scoped, school):
    bare = add_course("aaptprep", "Bare")
    run(repo, storage)
    assert len(scoped.list_files(bare["id"])) == 2 and scoped.list_work(bare["id"]) == []
    run(repo, storage)
    assert len(scoped.list_files(bare["id"])) == 2


def test_the_planned_courses_show_in_the_admin_page_data(client, repo, storage, school, sign_in):
    run(repo, storage)
    admin = sign_in("aaptprep", "ritesh@example.com")
    plan = client.get(f"/api/admin/courses/{school['cat']['id']}/coursework", headers=admin).json()
    assert plan["counts"]["subtopics"] == 12 and plan["counts"]["published"] > 6 and plan["counts"]["with_dates"] == 12


# ---- Status and removing ----

def test_status_counts_what_the_script_made(repo, storage, school, capsys):
    run(repo, storage)
    info = seed.status(repo, "aaptprep", BATCH)
    assert info == {"courses": 2, "files": 4, "topics": 8, "subtopics": 24}
    assert "Demo coursework" in capsys.readouterr().out
    assert seed.status(repo, "aaptprep", "other")["courses"] == 0


def test_a_dry_run_removes_nothing(repo, storage, school, scoped):
    run(repo, storage)
    info = seed.remove(repo, storage, "aaptprep", BATCH, dry_run=True)
    assert info["files"] == 4 and info["nodes"] > 24 and len(scoped.list_files(school["cat"]["id"])) == 2


def test_remove_deletes_the_plan_files_and_stored_copies_but_not_hand_made_things(repo, storage, school, scoped):
    cid = school["cat"]["id"]
    run(repo, storage)
    keys = [f["key"] for f in scoped.list_files(cid)]
    mine = coursework.add_topic(scoped, cid, school["cat"]["papers"][0], "Mine")
    scoped.create_file({"id": "own", "course_id": cid, "title": "Mine", "kind": "pdf", "content_type": "application/pdf", "size": 1, "status": "ready",
                        "key": "aaptprep/courses/own.pdf", "created_at": "2027-01-01T00:00:00Z"})
    info = seed.remove(repo, storage, "aaptprep", BATCH)
    assert info["files"] == 4 and info["nodes"] > 24
    assert [n["id"] for n in scoped.list_work(cid)] == [mine["id"]]
    assert [f["id"] for f in scoped.list_files(cid)] == ["own"]
    assert all(storage.size(key) is None for key in keys)
    assert scoped.list_work(school["clat"]["id"]) == []


def test_removing_another_batch_touches_nothing(repo, storage, school):
    run(repo, storage)
    assert seed.remove(repo, storage, "aaptprep", "not-this-one") == {"nodes": 0, "files": 0}
    assert seed.status(repo, "aaptprep", BATCH)["topics"] == 8


def test_an_unknown_institute_is_refused(repo):
    with pytest.raises(SystemExit):
        seed.plan(repo, "nope", 1, 1, 1, BATCH)


def test_the_command_line_runs_each_command(repo, storage, school, monkeypatch, capsys):
    monkeypatch.setattr(seed, "make_video", lambda use_ffmpeg=True: b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08free")
    base = ["--slug", "aaptprep", "--batch", BATCH]
    assert seed.main(["plan", *base, "--subjects", "1", "--topics", "1"], repo=repo, storage=storage) == 0
    assert seed.main(["create", *base, "--subjects", "1", "--topics", "1"], repo=repo, storage=storage) == 0
    assert seed.main(["status", *base], repo=repo, storage=storage) == 0
    assert seed.main(["remove", *base, "--dry-run"], repo=repo, storage=storage) == 0
    assert seed.main(["remove", *base], repo=repo, storage=storage) == 0
    out = capsys.readouterr().out
    assert "Added to 2 courses" in out and "Would remove" in out and "Removed" in out


def test_a_subject_and_topic_shared_by_two_courses_get_the_same_dates_and_status(school):
    cat = {s["paper_id"]: s for s in seed.outline({**school["cat"], "papers": ["quantitative-ability", "logical-reasoning"]}, 2, 2, 7)}
    clat = {s["paper_id"]: s for s in seed.outline({**school["clat"], "papers": ["legal-reasoning", "logical-reasoning", "quantitative-ability"]}, 3, 2, 7)}
    for paper_id in ("quantitative-ability", "logical-reasoning"):
        assert cat[paper_id] == clat[paper_id]
    assert clat["legal-reasoning"]["due"] != clat["quantitative-ability"]["due"]


def test_dates_are_the_same_wherever_the_subject_sits_in_the_course(school):
    first = seed.outline({**school["cat"], "papers": ["quantitative-ability"]}, 1, 2, 7)[0]
    last = seed.outline({**school["cat"], "papers": ["legal-reasoning", "logical-reasoning", "quantitative-ability"]}, 3, 2, 7)[2]
    assert first == last
