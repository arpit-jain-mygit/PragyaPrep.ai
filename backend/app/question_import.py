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

from app import passages as passage_rules, questions
from app.papers import BY_ID, PAPERS
from app.tenants import ValidationError

MAX_ROWS = 500
MAX_BYTES = 2 * 1024 * 1024
SHEET = "Questions"
COLUMNS = [
    "Subject", "Topic", "Question",
    "Option A", "Option B", "Option C", "Option D",
    "Why A", "Why B", "Why C", "Why D",
    "Correct", "Difficulty", "Status",
]
LETTERS = ["A", "B", "C", "D"]
# Optional columns after the required ones: the file name of a picture the admin uploaded first. position -> column
PICTURE_COLUMNS = {"question": "Question image", "A": "Image A", "B": "Image B", "C": "Image C", "D": "Image D"}
# Optional columns for fill-in questions (one box the student types the answer into). Blank Type means multiple choice.
FILL_IN_COLUMNS = ["Type", "Answer", "Answer type", "Tolerance", "Explanation"]
# Optional: the title of a reading passage. The passage text goes on the Passages sheet (or is already in the bank).
PASSAGE_COLUMN = "Passage"
OPTIONAL_COLUMNS = list(PICTURE_COLUMNS.values()) + FILL_IN_COLUMNS + [PASSAGE_COLUMN]
PASSAGE_SHEET = "Passages"
PASSAGE_HEADER = ["Title", "Text"]
MAX_PASSAGES = 100
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def build_template() -> bytes:
    """The blank workbook the admin fills in: a Questions sheet with dropdowns, an Instructions sheet, and the subject list."""
    book = Workbook()
    sheet = book.active
    sheet.title = SHEET
    sheet.append(COLUMNS + OPTIONAL_COLUMNS)
    for index, name in enumerate(COLUMNS + OPTIONAL_COLUMNS, start=1):
        cell = sheet.cell(row=1, column=index)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="2563EB")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        width = 42 if name in ("Question", "Why A", "Why B", "Why C", "Why D", "Explanation") else 22 if name.startswith("Option") or name in ("Subject", "Topic") or name in PICTURE_COLUMNS.values() else 13
        sheet.column_dimensions[get_column_letter(index)].width = width
    sheet.freeze_panes = "A2"

    # The list of subjects and their topics, one subject per column, on its own sheet. Dropdowns read from it.
    lists = book.create_sheet("Subjects and topics")
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

    dropdown(f"='Subjects and topics'!$A$1:${last}$1", "A", "Choose a subject from the list.")
    # Topic: the topics listed under whichever subject is chosen in column A of the same row.
    match = f"MATCH($A2,'Subjects and topics'!$A$1:${last}$1,0)-1"
    topics = (
        f"=OFFSET('Subjects and topics'!$A$2,0,{match},"
        f"COUNTA(OFFSET('Subjects and topics'!$A$2,0,{match},60,1)),1)"
    )
    dropdown(topics, "B", "Choose a topic that belongs to the subject in column A.")
    dropdown('"A,B,C,D"', "L", "Type A, B, C or D.")
    dropdown('"easy,medium,hard"', "M", "Choose easy, medium or hard.")
    dropdown('"draft,published"', "N", "Choose draft or published.")
    first = len(COLUMNS) + len(PICTURE_COLUMNS) + 1  # the Type column
    dropdown('"mcq,fill_in"', get_column_letter(first), "Choose mcq (multiple choice) or fill_in.")
    dropdown('"text,number"', get_column_letter(first + 2), "Choose text or number.")

    guide = book.create_sheet("Instructions", 0)
    guide.column_dimensions["A"].width = 110
    lines = [
        ("How to add many questions at once", True),
        ("1. Fill in the Questions sheet, one question per row. Don't change the column headings, and don't rename the sheet.", False),
        ("2. Subject and Topic: choose from the dropdowns. A topic must belong to its subject (see the sheet 'Subjects and topics').", False),
        ("3. Give four different options (A to D) and a reason for every option: why it is correct, or why it is wrong.", False),
        ("4. Correct: type A, B, C or D.", False),
        ("5. Difficulty: easy, medium or hard (blank means medium). Status: draft or published (blank means draft).", False),
        ("6. Up to 500 questions per file. Save as .xlsx and upload it on the Question bank page. You will see a preview first, and nothing is saved until you confirm.", False),
        ("7. A question that is already in the bank (same subject, topic and wording) is skipped, so uploading a file twice does no harm.", False),
        ("8. Pictures (optional): first choose your PNG or JPG pictures (up to 1 MB each) in the picture step on the upload card. Then type each picture's file name, for example circuit1.png, in 'Question image' or 'Image A' to 'Image D'. A picture can be on one question only. An option that is only a picture may leave its option text empty, but still needs its reason.", False),
        ("9. Fill-in questions (one box the student types the answer into): set Type to fill_in, leave the four options, their reasons and Correct empty, and fill in Answer, Answer type and Explanation. Answer type 'text': type the answer, and add other accepted spellings after a | sign, for example Mumbai|Bombay (capitals and extra spaces don't matter). Answer type 'number': type the number; the optional Tolerance says how far off a student's number may be, for example 0.01. Leave Type empty for multiple choice. A fill-in question can have a Question image but no option pictures.", False),
        ("10. Reading passages (optional): paste the passage text (up to 5,000 characters) in the 'Passage' column of every question about it, repeating it on each row. Questions with the same text are shown together, with the passage once above them. Leave it empty for questions without a passage.", False),
        ("", False),
        ("Example row", True),
        ("Subject: Physics | Topic: Optics | Question: Which colour bends the most in a prism? | Option A: Red | Option B: Violet | Option C: Green | Option D: Yellow | "
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


def _rows(content: bytes) -> tuple[list[tuple[int, dict]], dict[str, dict]]:
    """The filled-in rows of the Questions sheet as (row number, {column: text}), and the Passages sheet as
    {lower-case title: {"title", "text", "row"}}. Blank rows are left out."""
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
    if header[:1] == ["Paper"]:
        header[0] = "Subject"  # files made from the older template called this column Paper
    if header[: len(COLUMNS)] != COLUMNS:
        raise ValidationError("The column headings have changed. Download a fresh template and copy your questions into it.")

    # The picture columns are optional: an older template without them still works.
    where = {name: header.index(name) for name in OPTIONAL_COLUMNS if name in header}
    found = []
    for number, values in enumerate(rows, start=2):
        row = {name: _cell(values[index]) if index < len(values) else "" for index, name in enumerate(COLUMNS)}
        for name in OPTIONAL_COLUMNS:
            row[name] = _cell(values[where[name]]) if name in where and where[name] < len(values) else ""
        if any(row.values()):
            found.append((number, row))
    if not found:
        raise ValidationError("The file has no questions in it.")
    if len(found) > MAX_ROWS:
        raise ValidationError(f"The file has {len(found)} questions. Upload at most {MAX_ROWS} at a time.")

    # An older file may still have a Passages sheet (Title, Text) and name passages by title. That still works.
    # The Passages sheet is optional. A repeated title keeps the first row; the second is reported when it is used.
    sheet_passages: dict[str, dict] = {}
    if PASSAGE_SHEET in book.sheetnames:
        passage_rows = book[PASSAGE_SHEET].iter_rows(values_only=True)
        head = [_cell(value) for value in next(passage_rows, ())]
        if head[:2] != PASSAGE_HEADER:
            raise ValidationError(f"The '{PASSAGE_SHEET}' sheet's headings have changed. Download a fresh template.")
        for number, values in enumerate(passage_rows, start=2):
            title, text = (_cell(values[0]) if len(values) > 0 else ""), (str(values[1] or "").strip() if len(values) > 1 else "")
            if not (title or text):
                continue
            if len(sheet_passages) >= MAX_PASSAGES:
                raise ValidationError(f"The file has more than {MAX_PASSAGES} passages. Upload fewer at a time.")
            key = " ".join(title.lower().split())
            if key in sheet_passages:
                sheet_passages[key]["repeated"] = True
            else:
                sheet_passages[key] = {"title": title, "text": text, "row": number, "repeated": False}
    return found, sheet_passages


def _to_question(row: dict) -> tuple[dict, dict[str, str]]:
    """Turn one row into question data, or say what is wrong, by column name."""
    problems: dict[str, str] = {}
    data: dict = {}

    papers = {}
    for paper in PAPERS:
        papers[paper["name"].lower()] = paper["id"]
        papers[paper["id"]] = paper["id"]
    paper_id = _pick(row["Subject"], papers)
    if paper_id is None:
        problems["Subject"] = "Choose a subject from the list." if row["Subject"] else "Subject is required."
    else:
        data["paper"] = paper_id
        topics = {topic.lower(): topic for topic in BY_ID[paper_id]["topics"]}
        topic = _pick(row["Topic"], topics)
        if topic is None:
            problems["Topic"] = f"Not a topic of {BY_ID[paper_id]['name']}." if row["Topic"] else "Topic is required."
        else:
            data["topic"] = topic

    data["text"] = row["Question"]
    kind = row["Type"].lower().replace("-", "_").replace(" ", "_") or "mcq"
    if kind not in questions.KINDS:
        problems["Type"] = "Type must be mcq or fill_in."
        kind = "mcq"
    data["kind"] = kind

    if kind == "fill_in":
        # No options for this type, so whatever is in those cells is ignored.
        answer_type = row["Answer type"].lower() or "text"
        if answer_type == "number":
            data["answer"] = {"type": "number", "value": row["Answer"], "tolerance": row["Tolerance"]}
        elif answer_type == "text":
            data["answer"] = {"type": "text", "accepted": row["Answer"].split("|")}
        else:
            data["answer"] = {"type": answer_type}
        data["explanation"] = row["Explanation"]
    else:
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
    if field == "kind":
        return "Type"
    if field == "explanation":
        return "Explanation"
    if field == "answer":
        lowered = message.lower()
        if "tolerance" in lowered:
            return "Tolerance"
        if "text or a number" in lowered:
            return "Answer type"
        return "Answer"
    if field == "paper":
        return "Subject"
    if field == "passage":
        return "Passage"
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


def _snippet(text: str) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= 40 else flat[:40].rstrip() + "…"


def _passage_for(value: str, sheet: dict[str, dict], bank_titles: dict[str, dict], bank_texts: dict[str, dict]) -> tuple[dict | None, str | None]:
    """Which passage a question row points to, or a problem message.

    The Passage cell holds the passage's text. For older files it may instead be the title of a passage on the
    Passages sheet or already saved in the bank, and that still works. Returns {"id", "title"} for one already saved,
    {"text", "title"} for text still to be saved, or {"title", "text", "via": "sheet"} for one from the Passages sheet."""
    key = " ".join(value.lower().split())
    in_file, saved = sheet.get(key), bank_titles.get(key)
    if in_file is not None:
        if in_file["repeated"]:
            return None, f"The Passages sheet has the title '{in_file['title']}' more than once."
        try:
            passage_rules.clean({"title": in_file["title"], "text": in_file["text"]})
        except questions.QuestionErrors as error:
            return None, f"Passages sheet row {in_file['row']}: {next(iter(error.errors.values()))}"
        if saved is not None:
            if not passage_rules.same_text(saved["text"], in_file["text"]):
                return None, f"A passage called '{saved['title']}' is already saved with different text. Change the title, or edit the saved one."
            return {"id": saved["id"], "title": saved["title"]}, None
        return {"title": in_file["title"], "text": in_file["text"], "via": "sheet"}, None
    if saved is not None:
        return {"id": saved["id"], "title": saved["title"]}, None
    problem = passage_rules.check_text(value)
    if problem:
        return None, problem
    same = bank_texts.get(key)
    if same is not None:
        return {"id": same["id"], "title": same["title"]}, None
    return {"text": value, "title": _snippet(value), "via": "text"}, None


def read(content: bytes, existing: list[dict], find_picture=lambda name: None, saved_passages: list[dict] = ()) -> dict:
    """Check a whole file. Returns {"ready": [...], "problems": [...], "duplicates": [...]}, and saves nothing.

    A row is ready when it passes every rule. A row that repeats a question already in the bank, or one earlier in the
    file, is a duplicate. Everything else is a problem, listed with its row number and the column to fix.

    find_picture(name) returns the uploaded picture with that file name (a dict with an "id"), or None. Each picture can
    go on one question only."""
    seen = {(item["paper"], item["topic"], " ".join(item["text"].lower().split())) for item in existing}
    ready, problems, duplicates = [], [], []
    taken: dict[str, int] = {}  # picture id -> the row that uses it
    found, sheet_passages = _rows(content)
    bank = {" ".join(item["title"].lower().split()): item for item in saved_passages}
    bank_texts = {" ".join(item["text"].lower().split()): item for item in saved_passages}

    for number, row in found:
        data, bad = _to_question(row)
        named = {slot: _picture_name(row[column]) for slot, column in PICTURE_COLUMNS.items() if row[column]}
        try:
            cleaned = questions.clean(
                {**data, **({"paper": None} if "Subject" in bad else {}), **({"topic": None} if "Topic" in bad else {})},
                set(named),
            )
        except questions.QuestionErrors as error:
            cleaned = None
            for field, message in error.errors.items():
                bad.setdefault(_column_for(field, message), message)
        if "Type" in bad:
            bad = {"Type": bad["Type"]}  # the other messages would only be about the wrong type
            cleaned = None
        if cleaned is not None and not bad:
            key = (cleaned["paper"], cleaned["topic"], " ".join(cleaned["text"].lower().split()))
            if key in seen:
                duplicates.append({"row": number, "text": cleaned["text"]})
                continue

        images: dict[str, str] = {}
        for slot, name in named.items():
            column = PICTURE_COLUMNS[slot]
            if data["kind"] == "fill_in" and slot != "question":
                bad.setdefault(column, "A fill-in question has no options, so it can't have an option picture.")
                continue
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

        passage = None
        if row[PASSAGE_COLUMN]:
            passage, message = _passage_for(row[PASSAGE_COLUMN], sheet_passages, bank, bank_texts)
            if message:
                bad.setdefault(PASSAGE_COLUMN, message)

        if bad:
            problems.append({"row": number, "errors": bad})
            continue
        seen.add(key)
        for picture_id in images.values():
            taken[picture_id] = number
        ready.append({"row": number, "question": cleaned, "images": images, "passage": passage})
    return {"ready": ready, "problems": problems, "duplicates": duplicates}
