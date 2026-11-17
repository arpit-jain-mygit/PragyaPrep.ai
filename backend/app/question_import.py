"""Question bank upload: the Excel template, and reading a filled-in file back into questions.

The file has one sheet called "Questions" with one row per question. Every row is checked with the same rules as the
form, so nothing reaches the bank that the form would have refused. Reading never saves anything: the caller decides.
"""
from io import BytesIO
from zipfile import BadZipFile

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from app import questions
from app.papers import BY_ID, PAPERS
from app.tenants import ValidationError

MAX_ROWS = 500
MAX_BYTES = 2 * 1024 * 1024
SHEET = "Questions"
COLUMNS = [
    "Paper", "Topic", "Question",
    "Option A", "Option B", "Option C", "Option D",
    "Why A", "Why B", "Why C", "Why D",
    "Correct", "Difficulty", "Status",
]
LETTERS = ["A", "B", "C", "D"]
# Optional columns after the required ones: the file name of a picture the admin uploaded first. position -> column
PICTURE_COLUMNS = {"question": "Question image", "A": "Image A", "B": "Image B", "C": "Image C", "D": "Image D"}
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def build_template() -> bytes:
    """The blank workbook the admin fills in: a Questions sheet with dropdowns, an Instructions sheet, and the paper list."""
    book = Workbook()
    sheet = book.active
    sheet.title = SHEET
    sheet.append(COLUMNS + list(PICTURE_COLUMNS.values()))
    for index, name in enumerate(COLUMNS + list(PICTURE_COLUMNS.values()), start=1):
        cell = sheet.cell(row=1, column=index)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2563EB")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        width = 42 if name in ("Question", "Why A", "Why B", "Why C", "Why D") else 22 if name.startswith("Option") or name in ("Paper", "Topic") or name in PICTURE_COLUMNS.values() else 13
        sheet.column_dimensions[get_column_letter(index)].width = width
    sheet.freeze_panes = "A2"

    # The list of papers and their topics, one paper per column, on its own sheet. Dropdowns read from it.
    lists = book.create_sheet("Papers and topics")
    for column, paper in enumerate(PAPERS, start=1):
        lists.cell(row=1, column=column, value=paper["name"]).font = Font(bold=True)
        lists.column_dimensions[get_column_letter(column)].width = 30
        for row, topic in enumerate(paper["topics"], start=2):
            lists.cell(row=row, column=column, value=topic)
    last = get_column_letter(len(PAPERS))
    rows = MAX_ROWS + 1

    def dropdown(formula: str, column: str, message: str) -> None:
        check = DataValidation(type="list", formula1=formula, allow_blank=True, showErrorMessage=True, errorTitle="Not allowed", error=message)
        check.add(f"{column}2:{column}{rows}")
        sheet.add_data_validation(check)

    dropdown(f"='Papers and topics'!$A$1:${last}$1", "A", "Choose a paper from the list.")
    # Topic: the topics listed under whichever paper is chosen in column A of the same row.
    match = f"MATCH($A2,'Papers and topics'!$A$1:${last}$1,0)-1"
    topics = (
        f"=OFFSET('Papers and topics'!$A$2,0,{match},"
        f"COUNTA(OFFSET('Papers and topics'!$A$2,0,{match},60,1)),1)"
    )
    dropdown(topics, "B", "Choose a topic that belongs to the paper in column A.")
    dropdown('"A,B,C,D"', "L", "Type A, B, C or D.")
    dropdown('"easy,medium,hard"', "M", "Choose easy, medium or hard.")
    dropdown('"draft,published"', "N", "Choose draft or published.")

    guide = book.create_sheet("Instructions", 0)
    guide.column_dimensions["A"].width = 110
    lines = [
        ("How to add many questions at once", True),
        ("1. Fill in the Questions sheet, one question per row. Don't change the column headings, and don't rename the sheet.", False),
        ("2. Paper and Topic: choose from the dropdowns. A topic must belong to its paper (see the sheet 'Papers and topics').", False),
        ("3. Give four different options (A to D) and a reason for every option: why it is correct, or why it is wrong.", False),
        ("4. Correct: type A, B, C or D.", False),
        ("5. Difficulty: easy, medium or hard (blank means medium). Status: draft or published (blank means draft).", False),
        ("6. Up to 500 questions per file. Save as .xlsx and upload it on the Question bank page. You will see a preview first, and nothing is saved until you confirm.", False),
        ("7. A question that is already in the bank (same paper, topic and wording) is skipped, so uploading a file twice does no harm.", False),
        ("8. Pictures (optional): first choose your PNG or JPG pictures (up to 1 MB each) in the picture step on the upload card. Then type each picture's file name, for example circuit1.png, in 'Question image' or 'Image A' to 'Image D'. A picture can be on one question only. An option that is only a picture may leave its option text empty, but still needs its reason.", False),
        ("", False),
        ("Example row", True),
        ("Paper: Physics | Topic: Optics | Question: Which colour bends the most in a prism? | Option A: Red | Option B: Violet | Option C: Green | Option D: Yellow | "
         "Why A: Red has the longest wavelength, so it bends the least. | Why B: Violet has the shortest wavelength, so it bends the most. | "
         "Why C: Green bends more than red but less than violet. | Why D: Yellow sits in the middle of the spectrum. | Correct: B | Difficulty: easy | Status: draft", False),
    ]
    for row, (line, bold) in enumerate(lines, start=1):
        cell = guide.cell(row=row, column=1, value=line)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        if bold:
            cell.font = Font(bold=True, size=13)

    out = BytesIO()
    book.save(out)
    return out.getvalue()


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def _pick(value: str, choices: dict[str, str]) -> str | None:
    return choices.get(" ".join(value.lower().split()))


def _rows(content: bytes) -> list[tuple[int, dict]]:
    """The filled-in rows of the Questions sheet as (row number, {column: text}). Blank rows are left out."""
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
    header = [_cell(value) for value in next(rows, ())]
    if header[: len(COLUMNS)] != COLUMNS:
        raise ValidationError("The column headings have changed. Download a fresh template and copy your questions into it.")

    # The picture columns are optional: an older template without them still works.
    where = {name: header.index(name) for name in list(PICTURE_COLUMNS.values()) if name in header}
    found = []
    for number, values in enumerate(rows, start=2):
        row = {name: _cell(values[index]) if index < len(values) else "" for index, name in enumerate(COLUMNS)}
        for name in PICTURE_COLUMNS.values():
            row[name] = _cell(values[where[name]]) if name in where and where[name] < len(values) else ""
        if any(row.values()):
            found.append((number, row))
    if not found:
        raise ValidationError("The file has no questions in it.")
    if len(found) > MAX_ROWS:
        raise ValidationError(f"The file has {len(found)} questions. Upload at most {MAX_ROWS} at a time.")
    return found


def _to_question(row: dict) -> tuple[dict, dict[str, str]]:
    """Turn one row into question data, or say what is wrong, by column name."""
    problems: dict[str, str] = {}
    data: dict = {}

    papers = {}
    for paper in PAPERS:
        papers[paper["name"].lower()] = paper["id"]
        papers[paper["id"]] = paper["id"]
    paper_id = _pick(row["Paper"], papers)
    if paper_id is None:
        problems["Paper"] = "Choose a paper from the list." if row["Paper"] else "Paper is required."
    else:
        data["paper"] = paper_id
        topics = {topic.lower(): topic for topic in BY_ID[paper_id]["topics"]}
        topic = _pick(row["Topic"], topics)
        if topic is None:
            problems["Topic"] = f"Not a topic of {BY_ID[paper_id]['name']}." if row["Topic"] else "Topic is required."
        else:
            data["topic"] = topic

    data["text"] = row["Question"]
    data["options"] = [{"text": row[f"Option {letter}"], "why": row[f"Why {letter}"]} for letter in LETTERS]

    correct = row["Correct"].upper()
    data["correct"] = LETTERS.index(correct) if correct in LETTERS else None
    data["difficulty"] = row["Difficulty"].lower() or "medium"
    data["status"] = row["Status"].lower() or "draft"
    return data, problems


# Which form field a problem belongs to, so it is shown against the right spreadsheet column.
def _column_for(field: str, message: str) -> str:
    if field == "text":
        return "Question"
    if field == "correct":
        return "Correct"
    if field == "difficulty":
        return "Difficulty"
    if field == "status":
        return "Status"
    if field == "options":
        for number, letter in enumerate(LETTERS, start=1):
            if f"reason for option {number}" in message:
                return f"Why {letter}"
            if message.startswith(f"Option {number} "):
                return f"Option {letter}"
        return "Options"
    return field.capitalize()


def _picture_name(value: str) -> str:
    """A file name as typed in the sheet, made comparable: no folder, no capitals, no stray spaces."""
    return value.strip().replace("\\", "/").rsplit("/", 1)[-1].strip().lower()


def read(content: bytes, existing: list[dict], find_picture=lambda name: None) -> dict:
    """Check a whole file. Returns {"ready": [...], "problems": [...], "duplicates": [...]}, and saves nothing.

    A row is ready when it passes every rule. A row that repeats a question already in the bank, or one earlier in the
    file, is a duplicate. Everything else is a problem, listed with its row number and the column to fix.

    find_picture(name) returns the uploaded picture with that file name (a dict with an "id"), or None. Each picture can
    go on one question only."""
    seen = {(item["paper"], item["topic"], " ".join(item["text"].lower().split())) for item in existing}
    ready, problems, duplicates = [], [], []
    taken: dict[str, int] = {}  # picture id -> the row that uses it

    for number, row in _rows(content):
        data, bad = _to_question(row)
        named = {slot: _picture_name(row[column]) for slot, column in PICTURE_COLUMNS.items() if row[column]}
        try:
            cleaned = questions.clean(
                {**data, **({"paper": None} if "Paper" in bad else {}), **({"topic": None} if "Topic" in bad else {})},
                set(named),
            )
        except questions.QuestionErrors as error:
            cleaned = None
            for field, message in error.errors.items():
                bad.setdefault(_column_for(field, message), message)
        if cleaned is not None and not bad:
            key = (cleaned["paper"], cleaned["topic"], " ".join(cleaned["text"].lower().split()))
            if key in seen:
                duplicates.append({"row": number, "text": cleaned["text"]})
                continue

        images: dict[str, str] = {}
        for slot, name in named.items():
            column = PICTURE_COLUMNS[slot]
            if not name:
                bad.setdefault(column, "Type the picture's file name.")
                continue
            picture = find_picture(name)
            if picture is None:
                bad.setdefault(column, f"The picture '{name}' hasn't been uploaded.")
            elif picture["id"] in taken:
                bad.setdefault(column, f"The picture '{name}' is already used by row {taken[picture['id']]}. A picture can be on one question only.")
            else:
                images[slot] = picture["id"]

        if bad:
            problems.append({"row": number, "errors": bad})
            continue
        seen.add(key)
        for picture_id in images.values():
            taken[picture_id] = number
        ready.append({"row": number, "question": cleaned, "images": images})
    return {"ready": ready, "problems": problems, "duplicates": duplicates}
