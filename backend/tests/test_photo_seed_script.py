"""The photo seeding script: gives students photos from a folder of pictures, and takes them away again."""
import shutil
import subprocess

import pytest

from app import avatars
from scripts.student_data import seed_photos as seed

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg is needed to make the test pictures")
BATCH = "demo-photos-test"


def make_picture(path, width=400, height=300):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"testsrc=size={width}x{height}:rate=1", "-frames:v", "1", str(path)], check=True)
    return path


@pytest.fixture
def folder(tmp_path):
    for name in ("a.png", "b.jpg", "c.png"):
        make_picture(tmp_path / "male" / name)
    for name in ("x.png", "y.jpg"):
        make_picture(tmp_path / "female" / name, 300, 500)
    return tmp_path


@pytest.fixture
def school(make_tenant, repo):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    scoped = repo.scoped("aaptprep")
    people = [
        ("ann@example.com", "female", "approved", {"demo_seed": "demo-students-v1"}),
        ("bob@example.com", "male", "approved", {"source": "import"}),
        ("cat@example.com", "female", "pending", {}),
        ("dan@example.com", "male", "approved", {}),
        ("eve@example.com", "", "approved", {"demo_seed": "demo-students-v1"}),
    ]
    for email, gender, status, extra in people:
        scoped.create_member({"email": email, "role": "student", "status": status, "first_name": email[:3].title(), "last_name": "T", "gender": gender, **extra})
    return scoped


@pytest.fixture
def storage(client):
    return client.app.state.storage


def run(repo, storage, folder, **kwargs):
    return seed.create(repo, storage, "aaptprep", folder, 7, BATCH, log=lambda *_: None, **kwargs)


def test_pictures_are_grouped_by_the_gender_folders_and_other_files_are_ignored(folder):
    (folder / "notes.txt").write_text("x")
    (folder / ".hidden.png").write_bytes(b"x")
    make_picture(folder / "loose.jpg")
    groups = seed.find_pictures(folder)
    assert len(groups["male"]) == 3 and len(groups["female"]) == 2 and [p.name for p in groups["any"]] == ["loose.jpg"]


def test_a_picture_is_cut_to_the_middle_square_256_pixels_and_is_small(tmp_path):
    for size in ((400, 300), (300, 500)):
        data = seed.prepare(make_picture(tmp_path / f"p{size[0]}.png", *size))
        assert avatars.looks_like_jpeg(data) and len(data) <= avatars.MAX_BYTES
        out = tmp_path / "check.jpg"
        out.write_bytes(data)
        probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(out)], capture_output=True, text=True)
        assert probe.stdout.strip() == "256,256"


def test_the_plan_writes_nothing_and_counts_every_student(repo, school, storage, folder):
    chosen = seed.plan(repo, "aaptprep", folder, 7, only_demo=False, replace=False)
    assert len(chosen) == 5 and all(school.get_member(m["email"]).get("avatar_key") in (None, "") for m, _ in chosen)


def test_each_student_gets_a_picture_from_their_genders_folder(repo, school, storage, folder):
    chosen = {m["email"]: p for m, p in seed.plan(repo, "aaptprep", folder, 7, only_demo=False, replace=False)}
    assert chosen["ann@example.com"].parent.name == "female" and chosen["cat@example.com"].parent.name == "female"
    assert chosen["bob@example.com"].parent.name == "male" and chosen["dan@example.com"].parent.name == "male"
    assert chosen["eve@example.com"] is not None  # no gender: any picture


def test_pictures_are_used_in_turn_so_they_repeat_evenly(repo, school, storage, folder):
    scoped = repo.scoped("aaptprep")
    for i in range(7):  # seven more men: ten men in all for three pictures
        scoped.create_member({"email": f"m{i}@example.com", "role": "student", "status": "approved", "first_name": "M", "last_name": "T", "gender": "male"})
    men = [(m["email"], p.name) for m, p in seed.plan(repo, "aaptprep", folder, 7, False, False) if m.get("gender") == "male"]
    counts = sorted(__import__("collections").Counter(name for _, name in men).values())
    assert len(men) == 9 and counts == [3, 3, 3]  # every picture used, none more than once above the others


def test_a_picture_that_cannot_be_read_is_skipped_and_the_rest_are_used(repo, school, storage, folder):
    (folder / "male" / "broken.png").write_bytes(b"this is not a picture")
    notes = []
    result = seed.create(repo, storage, "aaptprep", folder, 7, BATCH, log=notes.append)
    assert any("broken.png" in n for n in notes) and result["students"] == 5 and result["pictures"] == 5
    assert all(school.get_member(e)["avatar_key"] for e in ("ann@example.com", "bob@example.com"))


def test_it_stops_when_no_picture_can_be_used(repo, school, storage, tmp_path):
    (tmp_path / "bad.png").write_bytes(b"nope")
    with pytest.raises(SystemExit):
        seed.create(repo, storage, "aaptprep", tmp_path, 7, BATCH, log=lambda *_: None)


def test_the_same_seed_gives_the_same_pictures(repo, school, folder):
    one = [(m["email"], p.name) for m, p in seed.plan(repo, "aaptprep", folder, 7, False, False)]
    assert one == [(m["email"], p.name) for m, p in seed.plan(repo, "aaptprep", folder, 7, False, False)]


def test_create_stores_a_jpeg_for_each_student_in_the_institutes_folder_and_tags_it(repo, school, storage, folder):
    result = run(repo, storage, folder)
    assert result["students"] == 5 and result["replaced"] == 0 and 1 <= result["pictures"] <= 5
    for email in ("ann@example.com", "bob@example.com", "cat@example.com", "dan@example.com", "eve@example.com"):
        member = school.get_member(email)
        assert member["avatar_key"].startswith("aaptprep/avatars/") and member["avatar_seed"] == BATCH
        assert avatars.looks_like_jpeg(storage.read_head(member["avatar_key"])) and storage.size(member["avatar_key"]) <= avatars.MAX_BYTES


def test_only_demo_leaves_out_students_who_registered_for_real(repo, school, storage, folder):
    run(repo, storage, folder, only_demo=True)
    got = {e: bool(school.get_member(e).get("avatar_key")) for e in ("ann@example.com", "bob@example.com", "cat@example.com", "dan@example.com", "eve@example.com")}
    assert got == {"ann@example.com": True, "bob@example.com": True, "cat@example.com": False, "dan@example.com": False, "eve@example.com": True}


def test_a_student_with_a_photo_keeps_it_unless_replace_is_asked_for(repo, school, storage, folder):
    storage.put("aaptprep/avatars/own.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 50, "image/jpeg")
    school.update_member("dan@example.com", avatar_key="aaptprep/avatars/own.jpg")
    assert run(repo, storage, folder)["students"] == 4
    assert school.get_member("dan@example.com")["avatar_key"] == "aaptprep/avatars/own.jpg"
    result = run(repo, storage, folder, replace=True)
    assert result["students"] == 5 and result["replaced"] == 5 or result["replaced"] >= 1
    assert storage.size("aaptprep/avatars/own.jpg") is None  # the replaced photo was deleted


def test_running_again_adds_nothing(repo, school, storage, folder):
    run(repo, storage, folder)
    assert run(repo, storage, folder)["students"] == 0


def test_status_counts_students_with_photos_and_those_from_this_run(repo, school, storage, folder, capsys):
    run(repo, storage, folder)
    assert seed.status(repo, "aaptprep", BATCH) == {"students": 5, "with_photo": 5, "seeded": 5}
    assert "5 of 5 students have a photo" in capsys.readouterr().out
    assert seed.status(repo, "aaptprep", "other")["seeded"] == 0


def test_remove_takes_away_only_the_photos_this_run_added(repo, school, storage, folder):
    storage.put("aaptprep/avatars/own.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 50, "image/jpeg")
    school.update_member("dan@example.com", avatar_key="aaptprep/avatars/own.jpg")
    run(repo, storage, folder)
    keys = [school.get_member(e)["avatar_key"] for e in ("ann@example.com", "bob@example.com")]
    assert seed.remove(repo, storage, "aaptprep", BATCH, dry_run=True) == {"photos": 4}
    assert school.get_member("ann@example.com")["avatar_key"]
    assert seed.remove(repo, storage, "aaptprep", BATCH) == {"photos": 4}
    assert school.get_member("ann@example.com")["avatar_key"] == "" and all(storage.size(k) is None for k in keys)
    assert school.get_member("dan@example.com")["avatar_key"] == "aaptprep/avatars/own.jpg" and storage.size("aaptprep/avatars/own.jpg") is not None


def test_an_empty_folder_or_unknown_institute_is_refused(repo, school, tmp_path):
    with pytest.raises(SystemExit):
        seed.plan(repo, "aaptprep", tmp_path, 7, False, False)
    with pytest.raises(SystemExit):
        seed.plan(repo, "nope", tmp_path, 7, False, False)


def test_the_command_line_runs_each_command(repo, school, storage, folder, capsys):
    base = ["--slug", "aaptprep", "--batch", BATCH]
    assert seed.main(["plan", *base, "--folder", str(folder)], repo=repo, storage=storage) == 0
    assert seed.main(["create", *base, "--folder", str(folder)], repo=repo, storage=storage) == 0
    assert seed.main(["status", *base], repo=repo, storage=storage) == 0
    assert seed.main(["remove", *base, "--dry-run"], repo=repo, storage=storage) == 0
    assert seed.main(["remove", *base], repo=repo, storage=storage) == 0
    out = capsys.readouterr().out
    assert "would get a photo" in out and "Gave photos to 5" in out and "Removed 5 photos" in out
    with pytest.raises(SystemExit):
        seed.main(["create", *base], repo=repo, storage=storage)
