"""Live classes from an Excel sheet: the template, checking a filled-in sheet row by row, and creating the classes.

Each row is one live class. The Video and PDF columns hold the file names of recordings and slides the admin has already
uploaded to the course (several names in one cell, separated by ;). Nothing is saved until the caller confirms.
"""
import re
from datetime import date, datetime
from io import BytesIO
from uuid import uuid4
from zipfile import BadZipFile

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from app import live_classes
from app.repo import TenantRepo, now_iso
from app.student_import import XLSX_TYPE, _cell
from app.tenants import ValidationError

MAX_ROWS = 300
MAX_BYTES = 2 * 1024 * 1024
SHEET = "Live classes"
REQUIRED = ["Title", "Date"]
OPTIONAL = ["Time", "Description", "Video", "PDF", "Link", "Status"]
COLUMNS = REQUIRED + OPTIONAL
__all__ = ["XLSX_TYPE", "build_template", "read", "create"]


def build_template(course_name: str, files: list[dict]) -> bytes:
    """The blank workbook: a sheet to fill in, the course's uploaded files to copy names from, and how to fill it in."""
    book = Workbook()
    sheet = book.active
    sheet.title = SHEET
    sheet.append(COLUMNS)
    for index, name in enumerate(COLUMNS, start=1):
        cell = sheet.cell(row=1, column=index)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2563EB" if name in REQUIRED else "6B7280")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.column_dimensions[get_column_letter(index)].width = 40 if name in ("Title", "Description", "Video", "PDF", "Link") else 14
    sheet.freeze_panes = "A2"
    for row in range(2, MAX_ROWS + 2):
        sheet[f"B{row}"].number_format = "@"  # dates as text, so YYYY-MM-DD stays as typed
        sheet[f"C{row}"].number_format = "@"
    status = DataValidation(type="list", formula1='"draft,published"', allow_blank=True, showErrorMessage=True, errorTitle="Not allowed", error="Choose draft or published.")
    status.add(f"G2:G{MAX_ROWS + 1}")
    sheet.add_data_validation(status)

    listed = book.create_sheet("Uploaded files")
    for index, heading in enumerate(["File name", "Type", "Title"], start=1):
        listed.cell(row=1, column=index, value=heading).font = Font(bold=True)
        listed.column_dimensions[get_column_letter(index)].width = 44
    for row, file in enumerate(sorted((f for f in files if f.get("status") == "ready"), key=lambda f: (f.get("filename") or f["title"]).lower()), start=2):
        listed.cell(row=row, column=1, value=file.get("filename") or file["title"])
        listed.cell(row=row, column=2, value="Video" if file["kind"] == "mp4" else "PDF")
        listed.cell(row=row, column=3, value=file["title"])

    notes = book.create_sheet("How to fill")
    notes.column_dimensions["A"].width = 120
    for row, line in enumerate([
        f"Live classes for {course_name}. One row per class. Blue headings must be filled in; grey headings are optional.",
        "Title and Date (YYYY-MM-DD, for example 2027-02-10). Time is optional, as HH:MM, for example 18:30.",
        "Video and PDF: the file names of the recordings and slides, as listed on the 'Uploaded files' sheet. Upload the files to the course first, on the Live classes tab. Put several in one cell separated by ;",
        "Link: an optional web link (a video link, for example) starting with http:// or https://.",
        "Status: draft (the default) or published. Students only see published classes, and a published class needs a recording, slides, a link or a description.",
        f"At most {MAX_ROWS} classes in one file. A class with the same title and date as one already there is left as it is.",
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
        raise ValidationError("The file has no live classes in it.")
    if len(found) > MAX_ROWS:
        raise ValidationError(f"The file has {len(found)} classes. Upload at most {MAX_ROWS} at a time.")
    return found


def _files_for(cell: str, kind: str, files: list[dict]) -> tuple[list[dict], list[str]]:
    """The course files a Video or PDF cell names, and the names that matched nothing (or matched the wrong kind)."""
    found, missing = [], []
    for name in (" ".join(part.lower().split()) for part in re.split(r"[;|]", cell) if part.strip()):
        wanted = {name, re.sub(r"\.(mp4|pdf)$", "", name)}
        match = next((f for f in files if f.get("status") == "ready" and wanted & live_classes.file_names(f)), None)
        if match is None:
            missing.append(name)
        elif match["kind"] != kind:
            missing.append(f"{name} (not a {'video' if kind == 'mp4' else 'PDF'})")
        elif match["id"] not in [f["id"] for f in found]:
            found.append(match)
    return found, missing


def _check(row: dict, files: list[dict]) -> tuple[dict, dict]:
    problems: dict[str, str] = {}
    record: dict = {}
    for column, field, clean in (("Title", "title", live_classes.clean_title), ("Time", "held_time", live_classes.clean_time), ("Description", "description", live_classes.clean_note)):
        try:
            record[field] = clean(row[column])
        except ValidationError as error:
            problems[column] = str(error)
    try:
        record["held_on"] = live_classes.clean_date(row["Date"])
    except ValidationError as error:
        problems["Date"] = str(error)
    materials = []
    for column, kind in (("Video", "mp4"), ("PDF", "pdf")):
        found, missing = _files_for(row[column], kind, files)
        materials += [{"type": "file", "file_id": f["id"]} for f in found]
        if missing:
            problems[column] = f"Not among this course's uploaded files: {', '.join(missing)}. Upload them on the Live classes tab first."
    if row["Link"]:
        if re.match(r"^https?://[^\s]+$", row["Link"], re.IGNORECASE) and len(row["Link"]) <= 500:
            materials.append({"type": "link", "url": row["Link"], "title": ""})
        else:
            problems["Link"] = "A link must start with http:// or https:// and have no spaces."
    record["materials"] = materials
    status = (row["Status"] or "draft").lower()
    if status not in live_classes.STATUSES:
        problems["Status"] = "Use draft or published."
    elif status == "published" and not materials and not record.get("description"):
        problems["Status"] = "A published class needs a recording, slides, a link or a description."
    else:
        record["status"] = status
    return record, problems


def read(content: bytes, scoped: TenantRepo, course_id: str) -> dict:
    """Check a sheet. Returns {"summary", "rows"} and the records to save under "ready_records". Saves nothing."""
    parsed = _rows(content)
    files = scoped.list_files(course_id)
    existing = {(c["title"].lower(), c["held_on"]) for c in scoped.list_live(course_id)}
    seen: dict[tuple, int] = {}
    rows, ready = [], []
    for number, row in parsed:
        record, problems = _check(row, files)
        shown = {"row": number, "title": record.get("title") or row["Title"], "held_on": record.get("held_on") or row["Date"],
                 "files": len([m for m in record.get("materials", []) if m["type"] == "file"]), "status": "ready", "message": "", "problems": problems}
        key = (record.get("title", "").lower(), record.get("held_on"))
        if not problems and key in existing:
            shown.update(status="skipped", message="A class with this title and date is already there, so it was left as it is.")
        elif not problems and key in seen:
            shown["problems"] = {"Title": f"The same title and date as row {seen[key]}."}
            shown["status"] = "error"
        elif problems:
            shown["status"] = "error"
        else:
            seen[key] = number
            ready.append(record)
        rows.append(shown)
    count = lambda status: sum(1 for r in rows if r["status"] == status)
    return {"summary": {"total": len(rows), "ready": count("ready"), "skipped": count("skipped"), "errors": count("error")}, "rows": rows, "ready_records": ready}


def create(scoped: TenantRepo, course_id: str, records: list[dict], admin_email: str) -> int:
    stamp = now_iso()
    for record in records:
        scoped.put_live(course_id, {**record, "id": uuid4().hex, "created_at": stamp, "created_by": admin_email, "source": "import"})
    return len(records)
