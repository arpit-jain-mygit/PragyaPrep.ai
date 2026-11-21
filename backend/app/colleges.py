"""Colleges for the Tools screens: the institute's own college data, entered by its admin.

- Eligibility: each college has a list of rules (for example "born on or after" a date, or "10th at least 60%").
  The student types their details in the browser, and the browser checks them against the rules. Nothing the
  student types is saved.
- Cutoffs: the cut-off marks for each college, by year, category and section (Exam, SA, MCQ, VA), with seats and
  applicant numbers when the admin has them.
"""
from datetime import date
from time import time_ns
from uuid import uuid4

from app.repo import TenantRepo, now_iso
from app.tenants import ValidationError

MAX_NAME = 80
MAX_RULES = 12
CATEGORIES = ("General", "EWS", "NC-OBC", "SC", "ST", "PwD")
SECTIONS = ("Exam", "SA", "MCQ", "VA")
# Each rule type, with the value it needs: "date", "percent", "year", or "none" (the rule is simply on).
RULE_TYPES = {
    "dob_on_or_after": "date",
    "min_tenth_percent": "percent",
    "min_twelfth_percent": "percent",
    "tenth_year_or_later": "year",
    "twelfth_year_or_later": "year",
    "twelfth_maths": "none",
}


def _text(raw) -> str:
    return raw.strip() if isinstance(raw, str) else ""


def _number(raw):
    """A number from the form, or None when it is not a number. Booleans are not numbers here."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            return float(raw.strip()) if "." in raw else int(raw.strip())
        except ValueError:
            return None
    return None


def clean_rule(rule: dict, problems: list[str]) -> dict | None:
    kind = rule.get("type")
    if kind not in RULE_TYPES:
        problems.append("Choose a rule from the list.")
        return None
    need = RULE_TYPES[kind]
    if need == "none":
        return {"type": kind, "value": True}
    raw = rule.get("value")
    if need == "date":
        try:
            return {"type": kind, "value": date.fromisoformat(_text(raw)).isoformat()}
        except ValueError:
            problems.append("A date rule needs a real date.")
            return None
    if need == "percent":
        value = _number(raw)
        if value is None or not 0 <= value <= 100:
            problems.append("A percent rule needs a number from 0 to 100.")
            return None
        return {"type": kind, "value": int(value)}
    value = _number(raw)
    if not isinstance(value, int) or not 1990 <= value <= 2100:
        problems.append("A year rule needs a year from 1990 to 2100.")
        return None
    return {"type": kind, "value": value}


def clean_college(body: dict) -> dict:
    """Check one college from the admin. Every mistake is reported together, in plain words."""
    problems: list[str] = []
    name = _text(body.get("name"))
    if not name:
        problems.append("Type the college name.")
    elif len(name) > MAX_NAME:
        problems.append(f"The college name can be at most {MAX_NAME} characters.")
    raw_rules = body.get("rules") or []
    if not isinstance(raw_rules, list):
        problems.append("The rules must be a list.")
        raw_rules = []
    if len(raw_rules) > MAX_RULES:
        problems.append(f"A college can have at most {MAX_RULES} rules.")
    rules = []
    for rule in raw_rules[:MAX_RULES]:
        cleaned = clean_rule(rule if isinstance(rule, dict) else {}, problems)
        if cleaned:
            rules.append(cleaned)
    if problems:
        raise ValidationError(" ".join(dict.fromkeys(problems)))
    return {"name": name, "rules": rules}


def clean_cutoff(body: dict) -> dict:
    """Check one cutoff row from the admin. Every mistake is reported together."""
    problems: list[str] = []
    year = _number(body.get("year"))
    if not isinstance(year, int) or not 2000 <= year <= 2100:
        problems.append("The year must be from 2000 to 2100.")
    category = body.get("category")
    if category not in CATEGORIES:
        problems.append("Choose a category from the list.")
    section = body.get("section")
    if section not in SECTIONS:
        problems.append("Choose a section from the list.")
    cutoff = _number(body.get("cutoff"))
    if not isinstance(cutoff, int) or not 0 <= cutoff <= 1000:
        problems.append("The cutoff must be a whole number from 0 to 1000.")
    counts = {}
    for key in ("seats", "applicants", "qualified"):
        value = body.get(key)
        if value in (None, ""):
            counts[key] = None
            continue
        number = _number(value)
        if not isinstance(number, int) or number < 0:
            problems.append(f"The {key} must be a whole number, or left empty.")
        counts[key] = number
    if problems:
        raise ValidationError(" ".join(dict.fromkeys(problems)))
    row_id = f"CUT#{year}#{category}#{section}"
    return {"id": row_id, "year": year, "category": category, "section": section, "cutoff": cutoff, **counts}


# ---- Admin ----

def add_college(scoped: TenantRepo, body: dict) -> dict:
    now = now_iso()
    record = {"id": uuid4().hex, **clean_college(body), "created_at": now, "updated_at": now, "added_at": time_ns()}
    scoped.create_college(record)
    return record


def change_college(scoped: TenantRepo, college_id: str, body: dict) -> dict | None:
    existing = scoped.get_college(college_id)
    if existing is None:
        return None
    record = {**existing, **clean_college(body), "updated_at": now_iso()}
    scoped.update_college(record)
    return record


def remove_college(scoped: TenantRepo, college_id: str) -> bool:
    if scoped.get_college(college_id) is None:
        return False
    for row in scoped.list_cutoffs(college_id):
        scoped.delete_cutoff(college_id, row["id"])
    scoped.delete_college(college_id)
    return True


def add_cutoff(scoped: TenantRepo, college_id: str, body: dict) -> dict | None:
    """Save a cutoff row. A row for the same year, category and section replaces the old one."""
    if scoped.get_college(college_id) is None:
        return None
    row = {**clean_cutoff(body), "updated_at": now_iso()}
    scoped.put_cutoff(college_id, row)
    return row


def remove_cutoff(scoped: TenantRepo, college_id: str, row_id: str) -> bool:
    if not any(row["id"] == row_id for row in scoped.list_cutoffs(college_id)):
        return False
    scoped.delete_cutoff(college_id, row_id)
    return True


def admin_list(scoped: TenantRepo) -> list[dict]:
    """Every college, in the order it was added, with its rules."""
    return scoped.list_colleges()


# ---- Student ----

def for_eligibility(scoped: TenantRepo) -> list[dict]:
    """Each college's name and rules, in the order added. The student's details never reach the server."""
    return [{"id": row["id"], "name": row["name"], "rules": row.get("rules", [])} for row in scoped.list_colleges()]


def for_cutoffs(scoped: TenantRepo, college_id: str, year: int | None) -> dict | None:
    """One college's cutoffs for one year (the latest year when none is chosen), with the years available."""
    college = scoped.get_college(college_id)
    if college is None:
        return None
    rows = scoped.list_cutoffs(college_id)
    years = sorted({row["year"] for row in rows}, reverse=True)
    chosen = year if year in years else (years[0] if years else None)
    shown = [row for row in rows if row["year"] == chosen]
    shown.sort(key=lambda row: (CATEGORIES.index(row["category"]), SECTIONS.index(row["section"])))
    return {"college": {"id": college["id"], "name": college["name"]}, "years": years, "year": chosen, "rows": shown}


def college_names(scoped: TenantRepo) -> list[dict]:
    """Each college with the years it has cutoffs for, for the pickers."""
    out = []
    for college in scoped.list_colleges():
        years = sorted({row["year"] for row in scoped.list_cutoffs(college["id"])}, reverse=True)
        out.append({"id": college["id"], "name": college["name"], "years": years})
    return out
