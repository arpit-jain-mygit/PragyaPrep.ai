"""Cambridge Lower Secondary Maths Stage 8: chapter notes, chapter quizzes and student-made tests.

Content comes from backend/data/cambridge/ch*.json (one file per group of chapters). Each question has:
  stem, options (2 or 4), answer (the correct option text), explanation,
  optional blank (the stem with a "____" gap, for fill-in-the-blank),
  optional tf (a statement and whether it is true, for true-or-false),
  optional write (false when the question only makes sense with its options).

Nothing is stored. Each item id carries the question id, the format and, for multiple choice,
a random seed that sets the order of the options. Grading rebuilds the same order from the seed,
so the correct letter is never sent to the student before they answer.

Formats (same letters as the Wren & Martin tests):
  A  multiple choice        every question
  B  fill in the blank      questions with a blank
  C  true or false          questions with a statement
  D  write the answer       questions with write != false; the student types the answer
"""
import json
import random
import re
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "study_hub" / "cambridge"
FORMATS = ("A", "B", "C", "D")
LETTERS = "ABCD"
GAP_PREFIX = re.compile(r"^Fill in the gap:\s*", re.I)


@lru_cache(maxsize=1)
def _all():
    chapters = {}
    for path in sorted(DATA_DIR.glob("ch*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for ch in data["chapters"]:
            chapters[ch["chapter"]] = ch
    return chapters


def chapters():
    """Chapter list in book order: number, title and how many questions each has."""
    return [{"chapter": n, "title": ch["title"], "questions": len(ch["questions"])}
            for n, ch in sorted(_all().items())]


def chapter(number):
    return _all().get(number)


def questions(number):
    ch = chapter(number)
    return ch["questions"] if ch else []


def _find(number, qid):
    for q in questions(number):
        if q["id"] == qid:
            return q
    return None


def _order(seed, n):
    """Order of the original option positions for a given seed. Seed 0 keeps the original order."""
    order = list(range(n))
    if seed:
        random.Random(seed).shuffle(order)
    return order


def _shown_options(q, seed):
    order = _order(seed, len(q["options"]))
    return [q["options"][i] for i in order]


def _normal(text):
    return re.sub(r"\s+", "", str(text or "")).lower().rstrip(".!?")


def _gap_text(q):
    return GAP_PREFIX.sub("", q["blank"], count=1).strip()


def public_question(q, seed):
    """The question as the student sees it in a quiz: options in a seeded order, never the answer."""
    return {"id": f"{q['id']}|A|{seed}", "stem": q["stem"], "options": _shown_options(q, seed)}


def quiz(number):
    """One chapter's quiz: every question as multiple choice, options shuffled per question."""
    out = []
    for q in questions(number):
        seed = random.randint(1, 99999)
        out.append(public_question(q, seed))
    return out


def build(chosen, formats, count):
    """A random test: up to `count` items from the chosen chapters and formats. Answers are not included."""
    pool = []
    for number in chosen:
        for q in questions(number):
            if "A" in formats:
                pool.append(("A", q))
            if "B" in formats and q.get("blank"):
                pool.append(("B", q))
            if "C" in formats and q.get("tf"):
                pool.append(("C", q))
            if "D" in formats and q.get("write", True) and not q.get("tf"):
                pool.append(("D", q))
    random.shuffle(pool)
    out = []
    for fmt, q in pool[:count]:
        base = {"chapter": int(q["id"][1:3]), "format": fmt}
        if fmt == "A":
            seed = random.randint(1, 99999)
            out.append({**base, **public_question(q, seed)})
        elif fmt == "B":
            out.append({**base, "id": f"{q['id']}|B", "stem": _gap_text(q)})
        elif fmt == "C":
            out.append({**base, "id": f"{q['id']}|C", "stem": q["tf"]["text"]})
        else:
            out.append({**base, "id": f"{q['id']}|D", "stem": q["stem"]})
    return out


def _expected(item_id):
    """Return (question, format, seed, expected display text, answer for matching) or None if unknown."""
    parts = item_id.split("|")
    if len(parts) < 2 or not re.fullmatch(r"c\d{2}-q\d{2}", parts[0]):
        return None
    q = _find(int(parts[0][1:3]), parts[0])
    if q is None:
        return None
    fmt = parts[1]
    if fmt == "A":
        seed = int(parts[2]) if len(parts) == 3 and parts[2].isdigit() else 0
        return q, fmt, seed, q["answer"]
    if fmt == "B" and q.get("blank"):
        return q, fmt, 0, q["answer"]
    if fmt == "C" and q.get("tf"):
        return q, fmt, 0, "True" if q["tf"]["true"] else "False"
    if fmt == "D" and q.get("write", True) and not q.get("tf"):
        return q, fmt, 0, q["answer"]
    return None


def grade(answers):
    """answers: list of {id, answer}. Returns per-item results and the score."""
    results = []
    for entry in answers:
        item_id = str(entry.get("id", ""))
        given = str(entry.get("answer", ""))
        found = _expected(item_id)
        if found is None:
            results.append({"id": item_id, "known": False, "correct": False})
            continue
        q, fmt, seed, expected = found
        if fmt == "A":
            shown = _shown_options(q, seed)
            picked = LETTERS.find(given.strip().upper()[:1]) if given.strip() else -1
            ok = 0 <= picked < len(shown) and shown[picked] == expected
            display = f"{LETTERS[shown.index(expected)]}. {expected}"
        else:
            ok = _normal(given) == _normal(expected)
            display = expected
        results.append({"id": item_id, "known": True, "correct": ok, "expected": display,
                        "explanation": q["explanation"]})
    return {"results": results, "score": sum(1 for r in results if r["correct"]), "total": len(results)}
