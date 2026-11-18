"""Gives every student a photo from a folder of pictures, to see round avatars with real faces.

The pictures are not made here: point --folder at a folder of portraits (JPG, PNG or WebP). If it holds `male` and `female`
sub-folders, each student gets a picture from the folder that matches their gender (where the student has one); otherwise every
student draws from all the pictures. When there are fewer pictures than students the pictures repeat: they are used in turn, so every picture is used about
equally often. A picture ffmpeg cannot read is skipped, with a note. Each picture is cut to the middle square, shrunk to 256 x 256 and saved as a small JPEG with ffmpeg.

  export AWS_PROFILE=pragyaprep-dev PRAGYA_TABLE_NAME=pragyaprep-dev PRAGYA_BUCKET_NAME=pragyaprep-content-dev-552808407801 PYTHONPATH=.
  .venv/bin/python scripts/student_data/seed_photos.py plan   --slug aaptprep --folder ~/Pictures/portraits
  .venv/bin/python scripts/student_data/seed_photos.py create --slug aaptprep --folder ~/Pictures/portraits
  .venv/bin/python scripts/student_data/seed_photos.py status --slug aaptprep
  .venv/bin/python scripts/student_data/seed_photos.py remove --slug aaptprep

  --only-demo   only the demo students made by seed_students.py and the import sheet (not anyone who registered for real)
  --replace     also give a photo to students who already have one (the old photo is deleted)
  --seed 2026   the same seed gives the same pictures to the same students
  --batch demo-photos-v1   the tag put on every photo this run adds, so `remove` takes away only these

Every student is included unless --only-demo is given. Photos you uploaded yourself are never removed by `remove`.
"""
import argparse
import random
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

from app import avatars
from app.aws import make_s3, make_table
from app.config import Settings
from app.repo import Repo, TenantRepo, now_iso
from app.storage import ContentStorage
from scripts.student_data import names

DEFAULT_BATCH = "demo-photos-v1"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def find_pictures(folder: Path) -> dict[str, list[Path]]:
    """The pictures in a folder, grouped: 'male' and 'female' from sub-folders of those names, and 'any' for the rest."""
    groups: dict[str, list[Path]] = {"male": [], "female": [], "any": []}
    for path in sorted(folder.rglob("*")):
        if path.suffix.lower() not in EXTENSIONS or path.name.startswith("."):
            continue
        parts = {part.lower() for part in path.relative_to(folder).parts[:-1]}
        groups["male" if "male" in parts else "female" if "female" in parts else "any"].append(path)
    return groups


class PictureError(Exception):
    pass


def prepare(path: Path) -> bytes:
    """The picture's middle square, 256 x 256, as a JPEG small enough to store (made with ffmpeg)."""
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is needed to prepare the pictures. Install it and try again.")
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / "photo.jpg"
        for quality in (4, 8, 14, 22):
            command = [
                "ffmpeg", "-loglevel", "error", "-y", "-i", str(path), "-frames:v", "1",
                "-vf", f"crop='min(iw,ih)':'min(iw,ih)',scale={256}:{256}", "-q:v", str(quality), str(target),
            ]
            if subprocess.run(command, check=False).returncode != 0 or not target.exists():
                raise PictureError(f"ffmpeg could not read {path.name}.")
            data = target.read_bytes()
            if len(data) <= avatars.MAX_BYTES:
                return data
    raise PictureError(f"{path.name} could not be made small enough.")


def _scoped(repo: Repo, slug: str) -> TenantRepo:
    if repo.get_tenant(slug) is None:
        raise SystemExit(f"There is no institute called '{slug}'.")
    return repo.scoped(slug)


def _students(scoped: TenantRepo, only_demo: bool) -> list[dict]:
    seen, out = set(), []
    for status in ("approved", "pending", "rejected", "suspended"):
        for member in scoped.all_members_by_status(status):
            if member.get("role") != "student" or member["email"] in seen:
                continue
            seen.add(member["email"])
            if only_demo and not (member.get("demo_seed") or member.get("source") == "import"):
                continue
            out.append(member)
    return sorted(out, key=lambda m: m["email"])


def gender_of(member: dict) -> str:
    """The student's recorded gender; if there is none, the gender of their first name from the demo-name lists, else nothing."""
    recorded = (member.get("gender") or "").lower()
    if recorded in ("male", "female"):
        return recorded
    first = (member.get("first_name") or "").strip().lower()
    if first in {n.lower() for n in names.FEMALE}:
        return "female"
    if first in {n.lower() for n in names.MALE}:
        return "male"
    return ""


def assign(groups: dict[str, list[Path]], students: list[dict], seed: int) -> list[tuple[dict, Path]]:
    """Give each student a picture, going through the pictures in turn (in an order that depends on the seed) so they repeat evenly.
    A student gets one from their gender's pictures if there are any (the gender recorded, or else read from the first name), else from all of them."""
    rng = random.Random(f"{seed}:photos")
    pools: dict[str, list[Path]] = {}
    for key in ("male", "female"):
        pools[key] = rng.sample(groups[key], len(groups[key]))
    everything = groups["male"] + groups["female"] + groups["any"]
    pools[""] = rng.sample(everything, len(everything))
    used = {key: 0 for key in pools}
    out = []
    for member in sorted(students, key=lambda m: m["email"]):
        gender = gender_of(member)
        key = gender if pools.get(gender) else ""
        pool = pools[key or ""]
        if not pool:
            continue
        out.append((member, pool[used[key or ""] % len(pool)]))
        used[key or ""] += 1
    return out


def plan(repo: Repo, slug: str, folder: Path, seed: int, only_demo: bool, replace: bool) -> list[tuple[dict, Path]]:
    scoped = _scoped(repo, slug)
    groups = find_pictures(folder)
    total = sum(len(v) for v in groups.values())
    if not total:
        raise SystemExit(f"There are no JPG, PNG or WebP pictures in {folder}.")
    wanted = [m for m in _students(scoped, only_demo) if replace or not m.get("avatar_key")]
    return assign(groups, wanted, seed)


def create(repo: Repo, storage: ContentStorage, slug: str, folder: Path, seed: int, batch: str, only_demo: bool = False, replace: bool = False, log=print) -> dict:
    scoped = _scoped(repo, slug)
    groups = find_pictures(folder)
    prepared: dict[Path, bytes] = {}
    for kind, pictures in groups.items():
        for picture in pictures:
            try:
                prepared[picture] = prepare(picture)
            except PictureError as error:
                log(f"Skipped: {error}")
    groups = {kind: [p for p in pictures if p in prepared] for kind, pictures in groups.items()}
    if not any(groups.values()):
        raise SystemExit(f"None of the pictures in {folder} could be used.")
    wanted = [m for m in _students(scoped, only_demo) if replace or not m.get("avatar_key")]
    given = replaced = 0
    for member, picture in assign(groups, wanted, seed):
        key = avatars.new_key(slug)
        storage.put(key, prepared[picture], avatars.CONTENT_TYPE)
        old = member.get("avatar_key")
        scoped.update_member(member["email"], avatar_key=key, avatar_at=now_iso(), avatar_seed=batch)
        if old:
            storage.delete(old)
            replaced += 1
        given += 1
    log(f"Gave photos to {given} students ({replaced} replaced), from {len(prepared)} pictures.")
    return {"students": given, "replaced": replaced, "pictures": len(prepared)}


def status(repo: Repo, slug: str, batch: str) -> dict:
    scoped = _scoped(repo, slug)
    students = _students(scoped, False)
    info = {"students": len(students), "with_photo": sum(1 for m in students if m.get("avatar_key")), "seeded": sum(1 for m in students if m.get("avatar_seed") == batch)}
    print(f"{info['with_photo']} of {info['students']} students have a photo; {info['seeded']} of them from the {batch} run.")
    return info


def remove(repo: Repo, storage: ContentStorage, slug: str, batch: str, dry_run: bool = False) -> dict:
    scoped = _scoped(repo, slug)
    mine = [m for m in _students(scoped, False) if m.get("avatar_seed") == batch and m.get("avatar_key")]
    if not dry_run:
        for member in mine:
            storage.delete(member["avatar_key"])
            scoped.update_member(member["email"], avatar_key="", avatar_at=now_iso(), avatar_seed="")
    print(f"{'Would remove' if dry_run else 'Removed'} {len(mine)} photos.")
    return {"photos": len(mine)}


def main(argv: list[str] | None = None, repo: Repo | None = None, storage: ContentStorage | None = None) -> int:
    parser = argparse.ArgumentParser(description="Photos for the demo students.")
    parser.add_argument("command", choices=["plan", "create", "status", "remove"])
    parser.add_argument("--slug", required=True)
    parser.add_argument("--folder", default="")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--batch", default=DEFAULT_BATCH)
    parser.add_argument("--only-demo", action="store_true")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    settings = Settings()
    repo = repo or Repo(make_table(settings))
    storage = storage or ContentStorage(make_s3(settings), settings.bucket_name)
    folder = Path(args.folder).expanduser()
    if args.command in ("plan", "create") and (not args.folder or not folder.is_dir()):
        raise SystemExit("Give --folder: a folder of portrait pictures.")
    if args.command == "plan":
        chosen = plan(repo, args.slug, folder, args.seed, args.only_demo, args.replace)
        print(f"{len(chosen)} students would get a photo, from {len({p for _, p in chosen})} pictures. Nothing has been written.")
    elif args.command == "create":
        create(repo, storage, args.slug, folder, args.seed, args.batch, args.only_demo, args.replace)
    elif args.command == "status":
        status(repo, args.slug, args.batch)
    else:
        remove(repo, storage, args.slug, args.batch, args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
