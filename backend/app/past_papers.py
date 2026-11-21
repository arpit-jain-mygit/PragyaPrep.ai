"""Past papers: the institute's past-year papers (tests of kind past_paper, each with its year), and what they show.

- Attempt and Explore list the papers by year, so a student can sit one or look at its sections and counts.
- Syllabus is a table: each topic, with how many of its questions came up in each year's paper.
- Filter topics lists each subject's topics with those counts, so a student can practise one topic.
"""
from collections import defaultdict


from app.repo import TenantRepo

PAST_PAPER = "past_paper"


def _questions(scoped: TenantRepo) -> dict[str, dict]:
    return {row["id"]: row for row in scoped.list_questions()}


def past_papers(scoped: TenantRepo) -> list[dict]:
    """Every published past paper, newest year first, with its question count."""
    papers = [test for test in scoped.list_tests() if test.get("kind") == PAST_PAPER and test.get("status") == "published"]
    papers.sort(key=lambda test: (-(test.get("year") or 0), test.get("title") or ""))
    return [
        {"id": test["id"], "title": test["title"], "year": test.get("year"), "question_count": len(test.get("question_ids") or [])}
        for test in papers
    ]


def syllabus(scoped: TenantRepo) -> dict:
    """Topics by year: how many of each topic's questions are in each year's past paper, with a total."""
    questions = _questions(scoped)
    counts: dict[tuple[str, str], dict[int, int]] = defaultdict(lambda: defaultdict(int))
    years: set[int] = set()
    for test in scoped.list_tests():
        if test.get("kind") != PAST_PAPER or test.get("status") != "published" or not test.get("year"):
            continue
        year = test["year"]
        years.add(year)
        for question_id in test.get("question_ids") or []:
            question = questions.get(question_id)
            if question:
                counts[(question["paper"], question["topic"])][year] += 1
    rows = []
    for (paper, topic), by_year in sorted(counts.items()):
        rows.append({"paper": paper, "topic": topic, "counts": {str(year): by_year.get(year, 0) for year in sorted(years)}, "total": sum(by_year.values())})
    return {"years": sorted(years), "rows": rows}


def filter_topics(scoped: TenantRepo) -> list[dict]:
    """Each subject's topics that appear in the past papers, with the number of questions, for practice."""
    grouped: dict[str, dict[str, int]] = defaultdict(dict)
    for row in syllabus(scoped)["rows"]:
        grouped[row["paper"]][row["topic"]] = row["total"]
    return [{"paper": paper, "topics": [{"name": name, "count": count} for name, count in topics.items()]} for paper, topics in grouped.items()]


VIEWER_LIMIT = 50
DIFFICULTY_LEVELS = ("easy", "medium", "hard")


def _years_by_question(scoped: TenantRepo) -> dict[str, set[int]]:
    """Which past-paper years each question appears in, so the viewer can filter by year."""
    years: dict[str, set[int]] = defaultdict(set)
    for test in scoped.list_tests():
        if test.get("kind") != PAST_PAPER or test.get("status") != "published" or not test.get("year"):
            continue
        for question_id in test.get("question_ids") or []:
            years[question_id].add(test["year"])
    return years


def question_years(scoped: TenantRepo) -> list[int]:
    """Every past-paper year the institute has, newest first, for the year filter."""
    return sorted({test["year"] for test in scoped.list_tests() if test.get("kind") == PAST_PAPER and test.get("status") == "published" and test.get("year")}, reverse=True)


def question_viewer(scoped: TenantRepo, paper: str | None = None, topic: str | None = None, difficulty: str | None = None, year: int | None = None) -> dict:
    """Published questions that match the filters, for a student to read. Each option shows its reason, and the answer is included
    so the student can check their work. A blank filter matches everything. At most VIEWER_LIMIT questions are returned.
    """
    from app.questions import SLOTS

    years = _years_by_question(scoped)
    matches = []
    for row in scoped.list_questions():
        if row.get("status") != "published":
            continue
        if paper and row.get("paper") != paper:
            continue
        if topic and row.get("topic") != topic:
            continue
        if difficulty and row.get("difficulty") != difficulty:
            continue
        if year and year not in years.get(row["id"], set()):
            continue
        if row.get("kind") == "fill_in":
            answer = {"kind": "fill_in", "answer": row.get("answer"), "explanation": row.get("explanation")}
        else:
            options = [{"letter": SLOTS[index + 1], "text": option.get("text", ""), "why": option.get("why", "")} for index, option in enumerate(row.get("options") or [])]
            correct = row.get("correct")
            answer = {"kind": row.get("kind", "mcq"), "options": options, "correct_letter": SLOTS[correct + 1] if isinstance(correct, int) else None}
        matches.append({
            "id": row["id"], "paper": row.get("paper"), "topic": row.get("topic"), "difficulty": row.get("difficulty"),
            "text": row.get("text"), "years": sorted(years.get(row["id"], set()), reverse=True), **answer,
        })
    matches.sort(key=lambda item: (item["paper"] or "", item["topic"] or "", item["id"]))
    return {"total": len(matches), "questions": matches[:VIEWER_LIMIT], "limit": VIEWER_LIMIT}
