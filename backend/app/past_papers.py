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
