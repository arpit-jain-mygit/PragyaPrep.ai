"""Parents from an Excel sheet: the template, checking a filled-in sheet row by row, and creating the parents.

Each row is one parent with the email of their child (several children in one cell, separated by ;). The children must already be
students of the institute. A parent who already exists gets the new children added. Nothing is saved until the caller confirms.
"""
import re
from io import BytesIO
from zipfile import BadZipFile

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app import parents
from app.config import Settings
from app.mailer import Mailer, send_quietly
from app.repo import TenantRepo
from app.student_import import XLSX_TYPE, _cell
from app.tenants import ValidationError, normalize_email

MAX_ROWS = 300
MAX_BYTES = 2 * 1024 * 1024
MAX_WELCOME = 40  # welcome emails per request, so a request stays well inside its time limit
SHEET = "Parents"
REQUIRED = ["Email", "First name", "Last name", "Student email"]
OPTIONAL = ["Mobile"]
COLUMNS = REQUIRED + OPTIONAL
__all__ = ["XLSX_TYPE", "build_template", "read", "create"]


def build_template() -> bytes:
    book = Workbook()
    sheet = book.active
    sheet.title = SHEET
    sheet.append(COLUMNS)
    for index, name in enumerate(COLUMNS, start=1):
        cell = sheet.cell(row=1, column=index)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2563EB" if name in REQUIRED else "6B7280")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.column_dimensions[get_column_letter(index)].width = 34 if "mail" in name else 18
    sheet.freeze_panes = "A2"
    for row in range(2, MAX_ROWS + 2):
        sheet[f"E{row}"].number_format = "@"  # a mobile number is text, so a leading zero or +91 is kept
    notes = book.create_sheet("How to fill")
    notes.column_dimensions["A"].width = 110
    for row, line in enumerate([
        "One row per parent. Blue headings must be filled in; the grey one is optional.",
        "Email, First name and Last name: the parent's own details. They log in with the email address, with a code sent to it.",
        "Student email: the email of their child, exactly as the student is registered here. The student must already be registered or imported. For two or more children, separate the emails with ;",
        "Mobile: a 10-digit Indian number (+91 or a leading 0 is fine). Optional.",
        f"At most {MAX_ROWS} rows in one file. A parent already added gets any new children linked. A link that exists already is left as it is.",
    ], start=1):
        notes.cell(row=row, column=1, value=line)
    out = BytesIO()
    book.save(out)
    return out.getvalue()


def _rows(content: bytes) -> list[tuple[int, dict]]:
    if len(content) > MAX_BYTES:
        raise ValidationError("That file is too big. Keep it under 2 MB.")
    if not content.startswith(b"PK"):
        raise ValidationError("That isn't an Excel (.xlsx) file. Download the template and fill it in.")
    try:
        book = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except (BadZipFile, KeyError, ValueError, OSError):
        raise ValidationError("That isn't a readable Excel (.xlsx) file. Download the template and fill it in.")
    if SHEET not in book.sheetnames:
        raise ValidationError(f"The file has no sheet called '{SHEET}'. Download the template and fill that in.")
    rows = book[SHEET].iter_rows(values_only=True)
    header = [" ".join(_cell(v).lower().split()) for v in next(rows, ())]
    where = {name: header.index(name.lower()) for name in COLUMNS if name.lower() in header}
    missing = [name for name in REQUIRED if name not in where]
    if missing:
        raise ValidationError(f"The column headings have changed ({', '.join(missing)} not found). Download a fresh template.")
    found = []
    for number, values in enumerate(rows, start=2):
        row = {name: _cell(values[where[name]]) if name in where and where[name] < len(values) else "" for name in COLUMNS}
        if any(row.values()):
            found.append((number, row))
    if not found:
        raise ValidationError("The file has no parents in it.")
    if len(found) > MAX_ROWS:
        raise ValidationError(f"The file has {len(found)} rows. Upload at most {MAX_ROWS} at a time.")
    return found


def _check(row: dict, scoped: TenantRepo, admin_email: str) -> tuple[dict, dict]:
    record, problems = parents.clean_people(row["First name"], row["Last name"], row["Mobile"], row["Email"], admin_email)
    problems = {{"email": "Email", "first_name": "First name", "last_name": "Last name", "mobile": "Mobile"}[k]: v for k, v in problems.items()}
    children, bad = [], []
    for raw in (part.strip() for part in re.split(r"[;|,]", row["Student email"]) if part.strip()):
        try:
            email = normalize_email(raw)
            parents.find_student(scoped, email)
            if email not in children:
                children.append(email)
        except ValidationError as error:
            bad.append(str(error))
    if not row["Student email"].strip():
        problems["Student email"] = "Enter the student's email."
    elif bad:
        problems["Student email"] = " ".join(bad)
    record["children"] = children
    return record, problems


def read(content: bytes, scoped: TenantRepo, admin_email: str) -> dict:
    """Check a sheet. Returns {"summary", "rows"} and the records to save under "ready_records". Saves nothing."""
    rows, ready, seen = [], [], {}
    for number, row in _rows(content):
        record, problems = _check(row, scoped, admin_email)
        shown = {"row": number, "email": record.get("email") or row["Email"], "name": " ".join(p for p in (record.get("first_name"), record.get("last_name")) if p), "children": record["children"], "status": "ready", "message": "", "problems": problems}
        email = record.get("email")
        existing = scoped.get_member(email) if email else None
        if email and email in seen:
            shown["problems"] = {**problems, "Email": f"The same email as row {seen[email]}. Put several students in one cell, separated by ;"}
        elif email:
            seen[email] = number
        if existing is not None and existing.get("role") != parents.PARENT and "Email" not in shown["problems"]:
            shown["problems"] = {**shown["problems"], "Email": f"Already registered here as a {existing.get('role')}."}
        if shown["problems"]:
            shown["status"] = "error"
        elif existing is not None and set(record["children"]) <= set(existing.get("children", [])):
            shown.update(status="skipped", message="Already linked to these students, so left as it is.")
        elif existing is not None and len({*existing.get("children", []), *record["children"]}) > parents.MAX_CHILDREN:
            shown.update(status="error", problems={"Student email": f"A parent can have up to {parents.MAX_CHILDREN} children."})
        else:
            ready.append(record)
        rows.append(shown)
    count = lambda status: sum(1 for r in rows if r["status"] == status)
    return {"summary": {"total": len(rows), "ready": count("ready"), "skipped": count("skipped"), "errors": count("error")}, "rows": rows, "ready_records": ready}


def create(scoped: TenantRepo, tenant: dict, settings: Settings, mailer: Mailer, records: list[dict], admin_email: str) -> dict:
    """Make each parent or link the children. Welcome emails go to the first new parents (up to a limit)."""
    created = linked = emailed = 0
    for record in records:
        children = record.pop("children")
        parent, is_new = parents.link(scoped, record, children, admin_email)
        names = [parents._name(scoped.get_member(c)) for c in children]
        if is_new:
            created += 1
            if emailed < MAX_WELCOME and send_quietly(mailer, parents._welcome_email(tenant, settings, parent, names)):
                emailed += 1
        else:
            linked += 1
    return {"created": created, "linked": linked, "emailed": emailed}
