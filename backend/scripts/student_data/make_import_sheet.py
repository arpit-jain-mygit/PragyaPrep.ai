"""Makes an Excel sheet of demo students in the Import students template's format, to try the bulk import with.

  PYTHONPATH=. .venv/bin/python scripts/student_data/make_import_sheet.py --count 100 --out ../student-import-100.xlsx

Names and places come from the demo-student lists. Emails use example.org (reserved for examples, so nothing reaches a real
inbox, and different from the example.com addresses of the demo students made by seed_students.py, so they never clash).
Mobile numbers are dummy numbers in sequence. A few students have two courses, and some leave optional columns empty, to
show that optional columns may be blank. The same --seed gives the same sheet.
"""
import argparse
import random
from datetime import date

from openpyxl import Workbook

from app import student_import
from scripts.student_data import names

DOMAIN = "example.org"
COURSES = ["CAT", "CLAT", "CUET", "IPMAT"]


def make_rows(count: int, seed: int, courses: list[str]) -> list[list[str]]:
    rng = random.Random(f"{seed}:import-sheet")
    used_emails: set[str] = set()
    used_names: set[tuple[str, str]] = set()
    rows = []
    while len(rows) < count:
        gender = rng.choice(["female", "male"])
        first = rng.choice(names.FEMALE if gender == "female" else names.MALE)
        last = rng.choice(names.SURNAMES)
        email = f"{first}.{last}@{DOMAIN}".lower()
        if email in used_emails or (first, last) in used_names:
            continue
        used_emails.add(email)
        used_names.add((first, last))
        position = len(rows)
        mobile = f"91000{position + 10001:05d}"
        picked = [rng.choice(courses)]
        if position % 7 == 3:  # about one in seven chooses two courses
            picked.append(rng.choice([c for c in courses if c != picked[0]]))
        locality, city, pin = rng.choice(names.PLACES)
        born = date(rng.randint(1999, 2008), rng.randint(1, 12), rng.randint(1, 28)).isoformat()
        whatsapp = f"91001{position + 10001:05d}" if position % 5 == 0 else ""  # most use the mobile for WhatsApp
        address = f"{rng.randint(1, 240)}, {locality}"
        record = {
            "Email": email, "First name": first, "Last name": last, "Mobile": mobile, "Courses": "; ".join(picked),
            "Birth date": born, "Gender": gender, "WhatsApp": whatsapp, "Address": address, "City": city, "PIN code": pin,
        }
        if position % 10 == 9:  # every tenth student gives only the required details
            for column in student_import.OPTIONAL:
                record[column] = ""
        elif position % 10 == 4:  # and some leave out just the address
            record["Address"] = record["City"] = record["PIN code"] = ""
        rows.append([record[column] for column in student_import.COLUMNS])
    return rows


def write(path: str, count: int, seed: int, courses: list[str]) -> list[list[str]]:
    book = Workbook()
    sheet = book.active
    sheet.title = student_import.SHEET
    sheet.append(student_import.COLUMNS)
    rows = make_rows(count, seed, courses)
    for row in rows:
        sheet.append(row)
    for column in "DH":  # mobile and WhatsApp as text, so nothing is rounded or loses a leading zero
        for number in range(2, len(rows) + 2):
            sheet[f"{column}{number}"].number_format = "@"
    book.save(path)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="An Excel sheet of demo students for the bulk import.")
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--out", default="student-import-100.xlsx")
    parser.add_argument("--courses", default=",".join(COURSES), help="open course names, comma separated")
    args = parser.parse_args()
    rows = write(args.out, args.count, args.seed, [c.strip() for c in args.courses.split(",") if c.strip()])
    print(f"Wrote {len(rows)} students to {args.out}")


if __name__ == "__main__":
    main()
