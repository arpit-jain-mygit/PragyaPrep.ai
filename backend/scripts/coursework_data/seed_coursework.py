"""Demo coursework: a ready-made plan for each course, all using the same sample PDF and sample video.

For every open course it adds two sample files (a PDF and a short MP4, the same content in each course), then a plan
of subjects, topics and sub-topics that attach those files and a link, with finish-by dates over the coming weeks and
most sub-topics published. It goes through the app's own coursework code, so the plan is exactly what an admin would build.
Everything it writes is tagged (`demo_seed`), so it can be listed and removed again.

Run from the backend folder, with AWS credentials in the environment. For the dev environment:

  export AWS_PROFILE=pragyaprep-dev PRAGYA_TABLE_NAME=pragyaprep-dev PRAGYA_BUCKET_NAME=pragyaprep-content-dev-552808407801 PYTHONPATH=.
  .venv/bin/python scripts/coursework_data/seed_coursework.py plan   --slug aaptprep
  .venv/bin/python scripts/coursework_data/seed_coursework.py create --slug aaptprep
  .venv/bin/python scripts/coursework_data/seed_coursework.py status --slug aaptprep
  .venv/bin/python scripts/coursework_data/seed_coursework.py remove --slug aaptprep

  --subjects 4          subjects planned for each course (default 4, the course's first ones)
  --topics 3            topics in each subject (default 3, the subject's usual first ones)
  --seed 2026           the same seed gives the same plan
  --batch demo-coursework-v1   the tag put on everything this run writes

A course that already has a plan is left alone. The sample video needs ffmpeg; without it a tiny stand-in file is used.
"""
import argparse
import random
import shutil
import subprocess
import sys
import tempfile
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from app import clock, content, coursework, papers as paper_list
from app.aws import make_s3, make_table
from app.config import Settings
from app.repo import Repo, TenantRepo, now_iso
from app.storage import ContentStorage

DEFAULT_BATCH = "demo-coursework-v1"
SUB_TOPICS = ["Concepts", "Worked examples", "Practice and revision"]
NOTE = "Dummy coursework for demonstration. Read or watch the material, then try the practice."
LINK = "https://example.com/practice"


# ---- The sample files ----

def make_pdf(pages: int = 3) -> bytes:
    """A small, valid PDF with a few pages of text, built by hand so no extra library is needed."""
    objects: list[bytes] = []
    kids = " ".join(f"{4 + 2 * n} 0 R" for n in range(pages))
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {pages} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for n in range(pages):
        page_id = 4 + 2 * n
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {page_id + 1} 0 R >>".encode())
        text = f"BT /F1 24 Tf 72 760 Td (Sample notes - page {n + 1} of {pages}) Tj ET BT /F1 14 Tf 72 720 Td (Dummy coursework material for demonstration.) Tj ET"
        objects.append(f"<< /Length {len(text)} >>\nstream\n{text}\nendstream".encode())
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    start = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    return bytes(out)


def make_video(use_ffmpeg: bool = True) -> bytes:
    """A short playable MP4 (test pattern and a tone) from ffmpeg; a tiny stand-in file when ffmpeg is not there."""
    if use_ffmpeg and shutil.which("ffmpeg"):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "sample.mp4"
            command = [
                "ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=8:size=320x240:rate=15",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=8", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-movflags", "+faststart", "-shortest", str(target),
            ]
            if subprocess.run(command, check=False).returncode == 0 and target.exists():
                return target.read_bytes()
    return b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08free"


# ---- Reading what is there ----

def _scoped(repo: Repo, slug: str) -> TenantRepo:
    tenant = repo.get_tenant(slug)
    if tenant is None:
        raise SystemExit(f"There is no institute called '{slug}'.")
    return repo.scoped(slug)


def open_courses(scoped: TenantRepo) -> list[dict]:
    return sorted((c for c in scoped.list_courses() if c.get("active", True)), key=lambda c: c["name"])


def _has_plan(scoped: TenantRepo, course_id: str) -> bool:
    return any(n["kind"] in ("topic", "subtopic") for n in scoped.list_work(course_id))


def _tagged_files(scoped: TenantRepo, course_id: str, batch: str) -> list[dict]:
    return [f for f in scoped.list_files(course_id) if f.get("demo_seed") == batch]


# ---- The plan ----

def outline(course: dict, subjects: int, topics: int, seed: int) -> list[dict]:
    """What would be built for a course: subjects, their topics and sub-topics with dates and status. Nothing is saved.

    Dates and status depend only on the subject and topic (not on the course), so a subject or topic that two courses
    share gets the same dates and status in both, which also makes copied coursework line up."""
    today = clock.today_india()
    plan = []
    for paper_id in (course.get("papers") or [])[:subjects]:
        paper = paper_list.BY_ID[paper_id]
        paper_index = next(i for i, p in enumerate(paper_list.PAPERS) if p["id"] == paper_id)
        start = 3 + (paper_index % 8) * 14  # days from today when this subject's first topic begins
        subject = {"paper_id": paper_id, "name": paper["name"], "due": (today + timedelta(days=start + 8 * topics + 2)).isoformat(), "topics": []}
        for topic_index, title in enumerate(paper["topics"][:topics]):
            first = start + topic_index * 8
            subs = []
            for position, name in enumerate(SUB_TOPICS):
                chance = random.Random(f"{seed}:{paper_id}:{title}:{position}").random()
                subs.append({
                    "title": name,
                    "due": (today + timedelta(days=first + 3 * position)).isoformat() if position != 1 else None,  # the middle one follows the topic's date
                    "status": "draft" if chance < 0.12 else "published",
                    "materials": [["pdf"], ["video"], ["pdf", "video", "link"]][position],
                })
            subject["topics"].append({"title": title, "due": (today + timedelta(days=first + 8)).isoformat(), "subtopics": subs})
        plan.append(subject)
    return plan


def plan(repo: Repo, slug: str, subjects: int, topics: int, seed: int, batch: str = DEFAULT_BATCH) -> list[dict]:
    scoped = _scoped(repo, slug)
    courses = open_courses(scoped)
    total = 0
    for course in courses:
        if _has_plan(scoped, course["id"]) or _tagged_files(scoped, course["id"], batch):
            print(f"{course['name']:8} already has a plan, so it would be left alone")
            continue
        built = outline(course, subjects, topics, seed)
        count = sum(len(t["subtopics"]) for s in built for t in s["topics"])
        total += count
        print(f"{course['name']:8} {len(built)} subjects, {sum(len(s['topics']) for s in built)} topics, {count} sub-topics")
    print(f"{total} sub-topics in all for {len(courses)} courses. Nothing has been written.")
    return courses


# ---- Creating ----

def _add_files(scoped: TenantRepo, storage: ContentStorage, course_id: str, batch: str, pdf: bytes, video: bytes) -> dict[str, str]:
    """The same sample PDF and video for the course, stored in the course's own folder. Returns their ids."""
    ids = {}
    for kind, title, extension, content_type, data in (
        ("pdf", "Sample notes (dummy)", ".pdf", "application/pdf", pdf),
        ("video", "Sample lecture (dummy)", ".mp4", "video/mp4", video),
    ):
        file_id = uuid4().hex
        key = f"{scoped.slug}/courses/{course_id}/{file_id}{extension}"
        storage.put(key, data, content_type)
        scoped.create_file({
            "id": file_id, "course_id": course_id, "title": title, "kind": "pdf" if kind == "pdf" else "mp4", "content_type": content_type,
            "size": len(data), "status": "ready", "key": key, "created_at": now_iso(), "created_by": "demo-script", "demo_seed": batch,
        })
        ids[kind] = file_id
    return ids


def _material(names: list[str], ids: dict[str, str]) -> list[dict]:
    out = []
    for name in names:
        if name == "link":
            out.append({"type": "link", "url": LINK, "title": "Extra practice"})
        else:
            out.append({"type": "file", "file_id": ids[name]})
    return out


def create(repo: Repo, storage: ContentStorage, slug: str, subjects: int, topics: int, seed: int, batch: str, use_ffmpeg: bool = True, log=print) -> dict:
    scoped = _scoped(repo, slug)
    pdf, video = make_pdf(), make_video(use_ffmpeg)
    result = {"courses": 0, "skipped": 0, "files": 0, "topics": 0, "subtopics": 0}
    for course in open_courses(scoped):
        cid = course["id"]
        if _has_plan(scoped, cid) or _tagged_files(scoped, cid, batch):
            result["skipped"] += 1
            log(f"{course['name']}: already has a plan, left alone")
            continue
        ids = _add_files(scoped, storage, cid, batch, pdf, video)
        result["files"] += 2
        for subject in outline(course, subjects, topics, seed):
            coursework.set_subject_due(scoped, cid, subject["paper_id"], subject["due"])
            scoped.update_work(cid, f"subject-{subject['paper_id']}", {"demo_seed": batch})
            for topic in subject["topics"]:
                made = coursework.add_topic(scoped, cid, subject["paper_id"], topic["title"])
                coursework.edit(scoped, cid, made["id"], {"due": topic["due"]})
                scoped.update_work(cid, made["id"], {"demo_seed": batch})
                result["topics"] += 1
                for sub in topic["subtopics"]:
                    node = coursework.add_subtopic(scoped, cid, made["id"], {
                        "title": sub["title"], "note": NOTE, "due": sub["due"], "materials": _material(sub["materials"], ids), "status": sub["status"],
                    })
                    scoped.update_work(cid, node["id"], {"demo_seed": batch})
                    result["subtopics"] += 1
        result["courses"] += 1
        log(f"{course['name']}: sample files and plan added")
    return result


# ---- Status and removing ----

def _tagged_nodes(scoped: TenantRepo, course_id: str, batch: str) -> list[dict]:
    return [n for n in scoped.list_work(course_id) if n.get("demo_seed") == batch]


def status(repo: Repo, slug: str, batch: str) -> dict:
    scoped = _scoped(repo, slug)
    info = {"courses": 0, "files": 0, "topics": 0, "subtopics": 0}
    for course in scoped.list_courses():
        nodes = _tagged_nodes(scoped, course["id"], batch)
        files = _tagged_files(scoped, course["id"], batch)
        if nodes or files:
            info["courses"] += 1
        info["files"] += len(files)
        info["topics"] += sum(1 for n in nodes if n["kind"] == "topic")
        info["subtopics"] += sum(1 for n in nodes if n["kind"] == "subtopic")
    print(f"Demo coursework ({batch}): {info['courses']} courses, {info['topics']} topics, {info['subtopics']} sub-topics, {info['files']} files")
    return info


def remove(repo: Repo, storage: ContentStorage, slug: str, batch: str, dry_run: bool = False) -> dict:
    """Delete the tagged plan nodes and sample files (their stored copies too). Anything the admin added by hand stays."""
    scoped = _scoped(repo, slug)
    info = {"nodes": 0, "files": 0}
    for course in scoped.list_courses():
        nodes = _tagged_nodes(scoped, course["id"], batch)
        files = _tagged_files(scoped, course["id"], batch)
        info["nodes"] += len(nodes)
        info["files"] += len(files)
        if dry_run:
            continue
        for node in nodes:
            scoped.delete_work(course["id"], node["id"])
        for file in files:
            scoped.delete_file(course["id"], file["id"])
            if not content.key_in_use(scoped, file["key"]):  # a copy in another course may still use the stored file
                storage.delete(file["key"])
    verb = "Would remove" if dry_run else "Removed"
    print(f"{verb} {info['nodes']} plan items and {info['files']} files.")
    return info


# ---- Command line ----

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Demo coursework for each course.")
    parser.add_argument("command", choices=["plan", "create", "status", "remove"])
    parser.add_argument("--slug", required=True, help="the institute, for example aaptprep")
    parser.add_argument("--subjects", type=int, default=4)
    parser.add_argument("--topics", type=int, default=3)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--batch", default=DEFAULT_BATCH)
    parser.add_argument("--dry-run", action="store_true", help="with remove: show what would go, change nothing")
    return parser


def main(argv: list[str] | None = None, repo: Repo | None = None, storage: ContentStorage | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = Settings()
    repo = repo or Repo(make_table(settings))
    storage = storage or ContentStorage(make_s3(settings), settings.bucket_name)
    if args.command == "plan":
        plan(repo, args.slug, args.subjects, args.topics, args.seed, args.batch)
    elif args.command == "create":
        result = create(repo, storage, args.slug, args.subjects, args.topics, args.seed, args.batch)
        print(f"Added to {result['courses']} courses ({result['skipped']} already had a plan): {result['topics']} topics, {result['subtopics']} sub-topics, {result['files']} files.")
    elif args.command == "status":
        status(repo, args.slug, args.batch)
    elif args.command == "remove":
        remove(repo, storage, args.slug, args.batch, args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
