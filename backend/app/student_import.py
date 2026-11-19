"""Bulk onboarding: the Excel template, reading a filled-in sheet of students, and creating them as approved students with course access.

Reading never saves anything: the caller shows the preview, and only then asks for the import. Each row is checked with the
same rules as the registration form, except that birth date, gender, WhatsApp, address, city and PIN code may be left empty.
"""
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from io import BytesIO
from pathlib import PurePosixPath
from uuid import uuid4
from zipfile import BadZipFile

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from app import clock, content
from app.config import Settings
from app.mailer import Email, Mailer, send_quietly
from app.registrations import GENDERS, MAX_AGE, MIN_AGE, _text, clean_mobile
from app.repo import ConflictError, TenantRepo, now_iso
from app.tenants import ValidationError, normalize_email

# One import is one request: the whole file is read, checked and saved inside it. These limits keep that inside the server's time
# limit (60 seconds) and the 6 MB largest upload a request can carry.
MAX_ROWS = 5000
MAX_BYTES = 5 * 1024 * 1024
TEMPLATE_ROWS = 2000  # the blank template carries its dropdowns and text formats this far down
MAX_WELCOME = 25  # welcome emails per request, so a request stays well inside its time limit
SHEET = "Students"
REQUIRED = ["Email", "First name", "Last name", "Mobile", "Courses"]
OPTIONAL = ["Birth date", "Gender", "WhatsApp", "Address", "City", "PIN code", "Photo"]
COLUMNS = REQUIRED + OPTIONAL
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
GENDER_WORDS = {"male": "male", "m": "male", "female": "female", "f": "female", "other": "other", "prefer not to say": "prefer_not_to_say", "prefer_not_to_say": "prefer_not_to_say"}


def build_template(course_names: list[str]) -> bytes:
    """The blank workbook to fill in: a Students sheet, the institute's open courses, and how to fill it in."""
    book = Workbook()
    sheet = book.active
    sheet.title = SHEET
    sheet.append(COLUMNS)
    for index, name in enumerate(COLUMNS, start=1):
        cell = sheet.cell(row=1, column=index)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2563EB" if name in REQUIRED else "6B7280")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.column_dimensions[get_column_letter(index)].width = 32 if name in ("Email", "Address", "Courses") else 16
    sheet.freeze_panes = "A2"
    for column in "DH":  # mobile and WhatsApp numbers are text, so a leading zero or +91 is kept
        for row in range(2, TEMPLATE_ROWS + 2):
            sheet[f"{column}{row}"].number_format = "@"
    check = DataValidation(type="list", formula1='"male,female,other,prefer not to say"', allow_blank=True, showErrorMessage=True, errorTitle="Not allowed", error="Choose from the list.")
    check.add(f"G2:G{TEMPLATE_ROWS + 1}")
    sheet.add_data_validation(check)

    lists = book.create_sheet("Courses")
    lists.cell(row=1, column=1, value="Open courses").font = Font(bold=True)
    lists.column_dimensions["A"].width = 30
    for row, name in enumerate(course_names, start=2):
        lists.cell(row=row, column=1, value=name)

    notes = book.create_sheet("How to fill")
    notes.column_dimensions["A"].width = 110
    for row, line in enumerate([
        "One row per student. Blue headings must be filled in; grey headings are optional.",
        "Email, First name, Last name and Mobile: the student's own details. Mobile is a 10-digit Indian number (+91 or a leading 0 is fine).",
        "Courses: the course names from the Courses sheet, exactly as written. Put several in one cell, separated by ; for example  CAT; CLAT",
        "Birth date: YYYY-MM-DD, for example 2005-03-21. Gender: male, female, other or prefer not to say.",
        "WhatsApp: leave empty to use the mobile number. Address, City and PIN code (6 digits) are optional.",
        "Photo: the file name of the student's picture, for example asha.jpg. Choose all the pictures together in the Photos step of the Import page first; they are matched by this name. A picture can go with one student only.",
        f"At most {MAX_ROWS} students in one file. Students already registered with this institute are left as they are.",
        "Each student is approved at once and given their courses. They log in with a code sent to their email.",
    ], start=1):
        notes.cell(row=row, column=1, value=line)
    out = BytesIO()
    book.save(out)
    return out.getvalue()


def _cell(value) -> str:
    """A cell as text. Numbers lose a trailing .0, and a date cell becomes YYYY-MM-DD."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def _rows(content_bytes: bytes) -> list[tuple[int, dict]]:
    """The filled-in rows of the Students sheet as (row number, {column: text}). Blank rows are left out."""
    if len(content_bytes) > MAX_BYTES:
        raise ValidationError(f"That file is too big. Keep it under {MAX_BYTES // (1024 * 1024)} MB.")
    if not content_bytes.startswith(b"PK"):
        raise ValidationError("That isn't an Excel (.xlsx) file. Download the template and fill it in.")
    try:
        book = load_workbook(BytesIO(content_bytes), read_only=True, data_only=True)
    except (BadZipFile, KeyError, ValueError, OSError):
        raise ValidationError("That isn't a readable Excel (.xlsx) file. Download the template and fill it in.")
    if SHEET not in book.sheetnames:
        raise ValidationError(f"The file has no sheet called '{SHEET}'. Download the template and fill that in.")
    rows = book[SHEET].iter_rows(values_only=True)
    header = [_cell(v) for v in next(rows, ())]
    where = {}
    for name in COLUMNS:
        for index, heading in enumerate(header):
            if " ".join(heading.lower().split()) == name.lower():
                where[name] = index
                break
    missing = [name for name in REQUIRED if name not in where]
    if missing:
        raise ValidationError(f"The column headings have changed ({', '.join(missing)} not found). Download a fresh template and copy your students into it.")
    found = []
    for number, values in enumerate(rows, start=2):
        row = {name: _cell(values[where[name]]) if name in where and where[name] < len(values) else "" for name in COLUMNS}
        if any(row.values()):
            found.append((number, row))
    if not found:
        raise ValidationError("The file has no students in it.")
    if len(found) > MAX_ROWS:
        raise ValidationError(f"The file has {len(found)} students. Upload at most {MAX_ROWS} at a time.")
    return found


def _check(row: dict, courses: dict[str, dict], today: date, admin_email: str) -> tuple[dict, dict]:
    """Check one row. Returns (the record to save, the problems by column). Problems are all reported at once."""
    problems: dict[str, str] = {}
    record: dict = {}

    try:
        email = normalize_email(row["Email"])
        if email == admin_email.lower():
            problems["Email"] = "This is the institute admin's own email, not a student's."
        else:
            record["email"] = email
    except ValidationError as error:
        problems["Email"] = str(error)

    for column, field in (("First name", "first_name"), ("Last name", "last_name")):
        value = _text(row[column], 1, 60)
        if value is None:
            problems[column] = f"Enter the {column.lower()} (up to 60 characters)."
        else:
            record[field] = value

    mobile = clean_mobile(row["Mobile"]) if row["Mobile"] else None
    if mobile is None:
        problems["Mobile"] = "Enter a 10-digit Indian mobile number."
    else:
        record["mobile"] = mobile

    by_name = {" ".join(c["name"].lower().split()): c for c in courses.values()}
    named = [" ".join(part.split()) for part in re.split(r"[;|,]", row["Courses"]) if part.strip()]
    picked, unknown = [], []
    for name in named:
        found = by_name.get(name.lower())
        if found is None:
            unknown.append(name)
        elif found["id"] not in [c["id"] for c in picked]:
            picked.append(found)
    if not named:
        problems["Courses"] = "Enter at least one course."
    elif unknown:
        problems["Courses"] = f"{'The course' if len(unknown) == 1 else 'These courses'} {', '.join(repr(u) for u in unknown)} {'isn' if len(unknown) == 1 else 'aren'}'t open here. Open courses: {', '.join(sorted(c['name'] for c in courses.values()))}."
    else:
        record["course_ids"] = [c["id"] for c in picked]
        record["course_names"] = [c["name"] for c in picked]

    birth = row["Birth date"]
    record["birth_date"] = ""
    if birth:
        try:
            born = date.fromisoformat(birth)
            age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
            if not MIN_AGE <= age <= MAX_AGE:
                problems["Birth date"] = "Enter a valid birth date."
            else:
                record["birth_date"] = born.isoformat()
        except ValueError:
            problems["Birth date"] = "Enter the birth date as YYYY-MM-DD."

    record["gender"] = ""
    if row["Gender"]:
        gender = GENDER_WORDS.get(" ".join(row["Gender"].lower().split()))
        if gender in GENDERS:
            record["gender"] = gender
        else:
            problems["Gender"] = "Use male, female, other or prefer not to say."

    if row["WhatsApp"]:
        whatsapp = clean_mobile(row["WhatsApp"])
        if whatsapp is None:
            problems["WhatsApp"] = "Enter a 10-digit WhatsApp number, or leave it empty to use the mobile."
        else:
            record["whatsapp"] = whatsapp
    else:
        record["whatsapp"] = record.get("mobile", "")

    for column, field, low, high in (("Address", "address", 5, 300), ("City", "city", 2, 60)):
        record[field] = ""
        if row[column]:
            value = _text(row[column], low, high)
            if value is None:
                problems[column] = f"{column} must be {low} to {high} characters."
            else:
                record[field] = value

    record["pin_code"] = ""
    if row["PIN code"]:
        if re.fullmatch(r"[1-9]\d{5}", row["PIN code"]):
            record["pin_code"] = row["PIN code"]
        else:
            problems["PIN code"] = "Enter a 6-digit PIN code."
    return record, problems


def read(content_bytes: bytes, scoped: TenantRepo, admin_email: str) -> dict:
    """Check a filled-in sheet. Returns {"summary", "rows"} where each row says ready, skipped (already registered) or error,
    plus the records to save under "ready_records". Saves nothing."""
    parsed = _rows(content_bytes)
    open_courses = {c["id"]: c for c in scoped.list_courses() if c.get("active", True)}
    today = clock.today_india()
    checked = [(number, row, *_check(row, open_courses, today, admin_email)) for number, row in parsed]

    emails = [record["email"] for _, _, record, _ in checked if "email" in record]
    names = sorted({PurePosixPath(row["Photo"].replace("\\", "/")).name.lower() for _, row, _, _ in checked if row["Photo"]})
    with ThreadPoolExecutor(max_workers=16) as pool:
        known = dict(zip(emails, pool.map(scoped.get_member, emails)))
        photos = dict(zip(names, pool.map(scoped.find_loose_photo, names)))

    seen: dict[str, int] = {}
    photo_rows: dict[str, int] = {}
    rows, ready = [], []
    for number, row, record, problems in checked:
        photo_name = PurePosixPath(row["Photo"].replace("\\", "/")).name.lower() if row["Photo"] else ""
        if photo_name:
            if photos.get(photo_name) is None:
                problems = {**problems, "Photo": f"The photo '{photo_name}' wasn't uploaded. Choose it in the Photos step."}
            elif photo_name in photo_rows:
                problems = {**problems, "Photo": f"The same photo is used on row {photo_rows[photo_name]}."}
            else:
                photo_rows[photo_name] = number
                record["_photo"] = photos[photo_name]
        email = record.get("email")
        shown = {"photo": bool(photo_name), "row": number, "email": email or row["Email"], "name": " ".join(p for p in (record.get("first_name"), record.get("last_name")) if p), "courses": record.get("course_names", []), "status": "ready", "message": "", "problems": problems}
        if email and email in seen:
            shown["problems"] = {**problems, "Email": f"The same email as row {seen[email]}."}
        elif email:
            seen[email] = number
        if shown["problems"]:
            shown["status"] = "error"
        elif known.get(email) is not None:
            existing = known[email]
            shown.update(status="skipped", message=f"Already registered ({existing['status']}), so left as it is.")
        else:
            ready.append(record)
        rows.append(shown)
    count = lambda status: sum(1 for r in rows if r["status"] == status)
    return {"summary": {"total": len(rows), "ready": count("ready"), "skipped": count("skipped"), "errors": count("error")}, "rows": rows, "ready_records": ready}


def create(scoped: TenantRepo, admin_email: str, records: list[dict]) -> dict:
    """Save each student as approved and give them their courses, several at a time. A failure for one never stops the rest."""
    batch, stamp = uuid4().hex, now_iso()

    def one(record: dict) -> dict:
        record = dict(record)
        photo = record.pop("_photo", None)
        member = {
            **record, "role": "student", "status": "approved", "course_id": record["course_ids"][0], "course_name": record["course_names"][0],
            "created_at": stamp, "decided_by": admin_email, "decided_at": stamp, "source": "import", "import_batch": batch,
        }
        if photo:
            member["avatar_key"] = photo["key"]
        try:
            scoped.create_member(member)
            if photo:
                scoped.attach_photo(photo["id"], record["email"])
        except ConflictError:
            return {"email": record["email"], "result": "skipped", "message": "Registered a moment ago, so left as it is.", "access_failed": []}
        failed = []
        for course_id, name in zip(record["course_ids"], record["course_names"]):
            try:
                content.grant_access(scoped, record["email"], course_id, admin_email, source="import")
            except Exception:
                failed.append(name)
        return {"email": record["email"], "result": "created", "message": "", "access_failed": failed}

    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(one, records))
    return {"batch": batch, "results": results}


def _welcome_email(tenant: dict, settings: Settings, member: dict) -> Email:
    name = tenant["branding"]["display_name"]
    names = member.get("course_names") or []
    phrase = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1] if names else "your courses"
    return Email(
        to=member["email"], from_name=name, subject=f"Welcome to {name}",
        body=(
            f"Hello {member['first_name']},\n\n"
            f"{name} has added you as a student and given you access to {phrase}.\n"
            f"Log in with this email address at {settings.frontend_url.rstrip('/')}/{tenant['slug']}/login. "
            "We'll send you a 6-digit code each time you log in."
        ),
    )


def welcome(scoped: TenantRepo, tenant: dict, settings: Settings, mailer: Mailer, emails) -> dict:
    """Email a welcome to students made by an import, once each. Only imported students can be emailed this way."""
    if not isinstance(emails, list) or not emails or not all(isinstance(e, str) for e in emails):
        raise ValidationError("List the students to email.")
    if len(emails) > MAX_WELCOME:
        raise ValidationError(f"Email up to {MAX_WELCOME} students at a time.")
    sent = failed = skipped = 0
    for raw in dict.fromkeys(e.strip().lower() for e in emails):
        member = scoped.get_member(raw)
        if member is None or member.get("role") != "student" or member.get("status") != "approved" or member.get("source") != "import" or member.get("welcomed_at"):
            skipped += 1
            continue
        if send_quietly(mailer, _welcome_email(tenant, settings, member)):
            scoped.update_member(raw, welcomed_at=now_iso())
            sent += 1
        else:
            failed += 1
    return {"sent": sent, "failed": failed, "skipped": skipped}
