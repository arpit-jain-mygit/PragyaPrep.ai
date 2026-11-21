"""Add sample data to the beta institute for the screens that were empty: batches, colleges and cutoffs,
the PI question bank, parents, idioms, past papers and student applications.

It uses the app's own code for each part, so the rows look exactly as an admin or student would make them.
Only touches the BETA table, for the aaptprep institute. Dummy students and parents use example.com emails.
Running it again skips anything already added (it checks by name or text first).

Usage (dry run, writes nothing):
  PYTHONPATH=. .venv/bin/python scripts/seed_missing_beta.py
Add them for real:
  PYTHONPATH=. .venv/bin/python scripts/seed_missing_beta.py --write
"""
import argparse

import boto3

from app import applications, batches, colleges, parents, pi_bank, quizzes, word_of_day
from app.repo import Repo

BETA_TABLE = "pragyaprep-beta"
TENANT = "aaptprep"
PROFILE = "pragyaprep-dev"
REGION = "ap-south-1"
ADMIN = "sample-data@aaptprep.example.com"
DUMMY_DOMAIN = "@example.com"

BATCHES = [
    {"name": "Sample batch: CLAT Morning", "course": "CLAT", "start_date": "2026-12-01", "end_date": "2027-06-30",
     "seat_limit": 30, "faculty": "Ritesh Sharma", "schedule": "Mon to Fri, 7:00 to 9:00 AM", "students": 5},
    {"name": "Sample batch: CAT Evening", "course": "CAT", "start_date": "2026-12-15", "end_date": "2027-07-31",
     "seat_limit": 25, "faculty": "Neha Iyer", "schedule": "Tue, Thu and Sat, 6:30 to 8:30 PM", "students": 4},
]

COLLEGES = [
    {"name": "Sample National Law School", "rules": [{"type": "min_tenth_percent", "value": 60}, {"type": "twelfth_maths", "value": None}]},
    {"name": "Sample Management Institute", "rules": [{"type": "min_twelfth_percent", "value": 55}]},
    {"name": "Sample Engineering College", "rules": [{"type": "min_tenth_percent", "value": 50}]},
]
CUTOFF_ROWS = [
    (2025, "General", "Exam", 118, 300, 2400, 900),
    (2025, "SC", "Exam", 96, 150, 1800, 420),
    (2026, "General", "Exam", 121, 300, 2600, 960),
    (2026, "EWS", "Exam", 110, 60, 900, 260),
]

PI_QUESTIONS = [
    {"topic": "Self introduction", "subtopic": "Opening", "question": "Tell us about yourself in two minutes.", "hint": "Cover your education, one achievement and why you are here."},
    {"topic": "Motivation", "subtopic": "Why this course", "question": "Why do you want to study this course?", "hint": "Link your past work to what the course teaches."},
    {"topic": "Current affairs", "subtopic": "National", "question": "What is one recent policy decision you followed closely, and why?", "hint": "Pick one you understand well enough to discuss."},
    {"topic": "Ethics", "subtopic": "Dilemmas", "question": "A friend asks you to share exam notes that you were not allowed to share. What do you do?", "hint": "Be honest and explain the reason."},
    {"topic": "Hobbies", "subtopic": "Interests", "question": "What book or film has changed the way you think?", "hint": "Give one specific example."},
    {"topic": "Career", "subtopic": "Plans", "question": "Where do you see yourself five years after you finish this course?", "hint": "Keep it realistic and linked to the course."},
]

PARENTS = [
    {"first_name": "Sample", "last_name": "Parent One", "mobile": "9000000001", "email": "parent.one" + DUMMY_DOMAIN, "child_index": 0},
    {"first_name": "Sample", "last_name": "Parent Two", "mobile": "9000000002", "email": "parent.two" + DUMMY_DOMAIN, "child_index": 1},
]

IDIOMS = [
    {"kind": "idiom", "word": "Break the ice", "meaning": "Say or do something to make people feel comfortable with each other.", "example": "She told a joke to break the ice at the start of the interview."},
    {"kind": "idiom", "word": "Bite the bullet", "meaning": "Decide to do something unpleasant that you have been avoiding.", "example": "He bit the bullet and started revising the weakest topic first."},
    {"kind": "idiom", "word": "Hit the books", "meaning": "Start studying hard.", "example": "The exam is next week, so it is time to hit the books."},
    {"kind": "idiom", "word": "On the fence", "meaning": "Not yet able to decide between two options.", "example": "I am on the fence about applying to two colleges."},
    {"kind": "idiom", "word": "A piece of cake", "meaning": "Something very easy to do.", "example": "The first section was a piece of cake."},
]

PAST_PAPERS = [
    {"title": "Sample past paper: CAT 2025", "year": 2025, "course": "CAT"},
    {"title": "Sample past paper: CAT 2024", "year": 2024, "course": "CAT"},
]

APPLICATIONS = [
    ("Sample National Law School", "CLAT (UG)", "applied", "2027-01-31"),
    ("Sample Management Institute", "Two-year MBA", "planning", "2027-02-15"),
]


def dummy_students(scoped):
    """Approved dummy students, in email order, so each run picks the same ones."""
    return sorted(
        (m for m in scoped.all_members_by_status("approved") if m.get("role", "student") == "student" and m["email"].endswith(DUMMY_DOMAIN)),
        key=lambda m: m["email"],
    )


def course_id(scoped, name):
    """The id of the course with this name, or None when the institute has no such course."""
    for course in scoped.list_courses():
        if course.get("name") == name:
            return course["id"]
    return None


def seed_batches(scoped, students, write):
    existing = {b["name"] for b in scoped.list_batches()}
    for spec in BATCHES:
        cid = course_id(scoped, spec["course"])
        if spec["name"] in existing:
            print(f"  batch '{spec['name']}': exists")
            continue
        if cid is None:
            print(f"  batch '{spec['name']}': skipped, no {spec['course']} course")
            continue
        print(f"  batch '{spec['name']}': add with {spec['students']} students")
        if not write:
            continue
        body = {k: spec[k] for k in ("name", "start_date", "end_date", "seat_limit", "faculty", "schedule")}
        batch = batches.create(scoped, {**body, "course_ids": [cid]}, ADMIN)
        batches.enrol(scoped, batch["id"], [s["email"] for s in students[: spec["students"]]], ADMIN)


def seed_colleges(scoped, write):
    existing = {c["name"]: c for c in scoped.list_colleges()}
    for spec in COLLEGES:
        if spec["name"] in existing:
            print(f"  college '{spec['name']}': exists")
            continue
        print(f"  college '{spec['name']}': add with cutoffs for {len(CUTOFF_ROWS)} rows")
        if not write:
            continue
        college = colleges.add_college(scoped, spec)
        for year, category, section, cutoff, seats, applicants, qualified in CUTOFF_ROWS:
            colleges.add_cutoff(scoped, college["id"], {
                "year": year, "category": category, "section": section, "cutoff": cutoff,
                "seats": seats, "applicants": applicants, "qualified": qualified,
            })


def seed_pi(scoped, write):
    existing = {q["question"] for q in scoped.list_pi_questions()}
    missing = [q for q in PI_QUESTIONS if q["question"] not in existing]
    print(f"  PI bank: {len(missing)} questions to add ({len(existing)} already there)")
    if write:
        for q in missing:
            pi_bank.add(scoped, q)


def seed_parents(scoped, students, write):
    for spec in PARENTS:
        if scoped.get_member(spec["email"]) is not None:
            print(f"  parent {spec['email']}: exists")
            continue
        child = students[spec["child_index"]]
        print(f"  parent {spec['email']}: link to {child['email']}")
        if not write:
            continue
        record, problems = parents.clean_people(spec["first_name"], spec["last_name"], spec["mobile"], spec["email"], ADMIN)
        if problems:
            raise SystemExit(f"Parent details refused: {problems}")
        # link() only writes the parent row. The welcome email is not sent, so nobody is emailed by a sample.
        parents.link(scoped, record, [child["email"]], ADMIN)


def seed_idioms(scoped, write):
    existing = {w["word"] for w in word_of_day.all_words(scoped, "idiom")}
    missing = [i for i in IDIOMS if i["word"] not in existing]
    print(f"  idioms: {len(missing)} to add ({len(existing)} already there)")
    if write:
        for idiom in missing:
            word_of_day.add(scoped, idiom)


def seed_past_papers(scoped, students, write):
    existing = {t["title"] for t in scoped.list_tests()}
    bank = scoped.list_questions()
    # Published questions from the bank, round robin across subjects, so each paper covers several subjects.
    groups = {}
    for row in bank:
        if row.get("status") == "published" and row.get("paper") and row.get("topic"):
            groups.setdefault((row["paper"], row["topic"]), []).append(row["id"])
    keys = sorted(groups)
    picked = []
    for position in range(40):
        for key in keys:
            if position < len(groups[key]) and len(picked) < 30:
                picked.append(groups[key][position])
    for spec in PAST_PAPERS:
        if spec["title"] in existing:
            print(f"  past paper '{spec['title']}': exists")
            continue
        cid = course_id(scoped, spec["course"])
        print(f"  past paper '{spec['title']}': add with {len(picked)} questions")
        if not write or cid is None:
            continue
        quizzes.create_test(scoped, {
            "title": spec["title"], "kind": "past_paper", "year": spec["year"],
            "description": "Sample past paper, added to try the Past papers screens on beta.",
            "start_at": None, "end_at": None, "duration_minutes": 60, "max_attempts": 1,
            "pass_percentage": 50, "marks_correct": 4, "marks_incorrect": -1, "show_answers": True,
            "courses": [cid], "mode": "manual", "question_ids": picked, "status": "published",
        }, ADMIN)


def seed_applications(scoped, students, write):
    for index, student in enumerate(students[:3]):
        have = applications.mine(scoped, student)
        if have:
            print(f"  applications for {student['email']}: {len(have)} already there")
            continue
        print(f"  applications for {student['email']}: add {len(APPLICATIONS)}")
        if not write:
            continue
        for college, programme, status, deadline in APPLICATIONS:
            applications.add(scoped, student, {"college": college, "programme": programme, "status": status, "deadline": deadline, "notes": ""})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write", action="store_true", help="add the samples to beta (without this, nothing is written)")
    args = parser.parse_args()

    table = boto3.Session(profile_name=PROFILE, region_name=REGION).resource("dynamodb").Table(BETA_TABLE)
    scoped = Repo(table).scoped(TENANT)
    students = dummy_students(scoped)
    if len(students) < 5:
        raise SystemExit(f"Need at least 5 dummy students in {BETA_TABLE}; found {len(students)}.")

    print(f"Sample data for {BETA_TABLE} ({'writing' if args.write else 'dry run, nothing written'}):")
    seed_batches(scoped, students, args.write)
    seed_colleges(scoped, args.write)
    seed_pi(scoped, args.write)
    seed_parents(scoped, students, args.write)
    seed_idioms(scoped, args.write)
    seed_past_papers(scoped, students, args.write)
    seed_applications(scoped, students, args.write)
    if not args.write:
        print("Dry run. Nothing written. Run with --write to add them.")


if __name__ == "__main__":
    main()
