"""Keyword search over the coursework a student can open. No AI is involved: it finds the passages whose words match the
question, and returns where each one sits in the plan (course > subject > topic > sub-topic) and its page.

Only what a student may see is searched:
- courses the student has active access to;
- files that are attached to a published sub-topic of that course;
- files whose text was read (passages exist).
Nothing else is searched, so an unpublished sub-topic or another course never leaks into an answer.

Ranking, in short:
- common words in a question ("which", "has", "highest") are ignored;
- a word that appears in few passages counts more than one that appears in many (so "Vembanad" beats "state");
- a self-check question list ("Answer: ...") is ranked below the notes it tests;
- each hit shows a short snippet around the matched words, not the whole passage."""
import math
import re

from app import content
from app import papers as paper_list
from app.repo import TenantRepo

# Words that carry no meaning for a search. Question words, helping verbs and words like "highest" that every question has.
STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "by", "can", "could", "did", "do", "does", "for", "from", "had", "has", "have",
    "how", "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "our", "should", "so", "than", "that", "the", "their", "them",
    "there", "these", "they", "this", "to", "was", "we", "were", "what", "when", "where", "which", "who", "whom", "why", "will", "with",
    "would", "you", "your", "about", "tell", "explain", "give", "find", "show", "more", "most", "many", "much", "some", "any",
    "highest", "lowest", "biggest", "smallest", "best", "worst", "first", "last", "name", "define", "meaning",
}
MAX_HITS = 8
MAX_QUERY = 200
SNIPPET_WORDS = 40  # about two lines of a phone screen either side of the match
SELF_CHECK_MARK = "answer:"  # the self-check lists in the notes write each answer this way
SELF_CHECK_FACTOR = 0.5  # a self-check passage counts for half as much as a note
# Coverage: the share of the question's words (weighted by rarity) that the best passage contains. Below this, the answer step
# is not run and the student sees "not in your coursework". Start strict; tune it on real questions.
MIN_COVERAGE = 0.6


class QueryTooShort(Exception):
    pass


def terms(text: str) -> list[str]:
    """The words that matter in a question or a passage: lowercase, no common words, no single letters."""
    return [w for w in re.findall(r"[a-z0-9]+", str(text).lower()) if len(w) > 1 and w not in STOP_WORDS]


def _placements(scoped: TenantRepo, course_id: str) -> dict[str, list[dict]]:
    """For each file of a course: the published sub-topics it is attached to, with their place in the plan."""
    nodes = scoped.list_work(course_id)
    topics = {n["id"]: n for n in nodes if n["kind"] == "topic"}
    found: dict[str, list[dict]] = {}
    for sub in (n for n in nodes if n["kind"] == "subtopic" and n.get("status") == "published"):
        topic = topics.get(sub.get("parent_id"))
        if topic is None:
            continue
        subject = paper_list.BY_ID.get(topic["paper_id"], {}).get("name", topic["paper_id"])
        for item in sub.get("materials") or []:
            if item.get("type") == "file":
                found.setdefault(item["file_id"], []).append({"subject": subject, "topic": topic["title"], "subtopic": sub["title"]})
    return found


def _weights(wanted: list[str], pool: list[dict]) -> dict[str, float]:
    """A rare word weighs more than a common one: log(1 + passages / (1 + passages that use the word))."""
    total = max(len(pool), 1)
    used = {w: 0 for w in wanted}
    for passage in pool:
        seen = set(passage["terms"])
        for w in wanted:
            if w in seen:
                used[w] += 1
    return {w: math.log(1 + total / (1 + used[w])) for w in wanted}


def _snippet(text: str, wanted: list[str], weights: dict[str, float]) -> str:
    """About SNIPPET_WORDS words around the place where the most question words sit together, so the student sees the
    sentence that answers, not the whole page."""
    words = text.split()
    if len(words) <= SNIPPET_WORDS:
        return text
    keys = ["".join(ch for ch in word.lower() if ch.isalnum()) for word in words]
    matches = [i for i, key in enumerate(keys) if key in weights]
    if not matches:
        return " ".join(words[:SNIPPET_WORDS]) + " ..."
    best_start, best_total = matches[0], -1.0
    for first in matches:
        window = range(first, min(len(words), first + SNIPPET_WORDS))
        seen = {keys[i] for i in window if keys[i] in weights}
        total = sum(weights[k] for k in seen)
        if total > best_total:
            best_start, best_total = first, total
    start = best_start
    end = min(len(words), start + SNIPPET_WORDS)
    prefix = "... " if start > 0 else ""
    suffix = " ..." if end < len(words) else ""
    return prefix + " ".join(words[start:end]) + suffix


def is_confident(hits: list[dict]) -> bool:
    """True when the best passage covers enough of the question to be worth an answer. No hits means no."""
    return bool(hits) and hits[0]["coverage"] >= MIN_COVERAGE


def search(scoped: TenantRepo, member: dict, query: str) -> list[dict]:
    """The best matching passages this student may read, best first. Empty when nothing matches."""
    text = " ".join(str(query or "").split())[:MAX_QUERY]
    wanted = list(dict.fromkeys(terms(text)))
    if not wanted:
        raise QueryTooShort()
    phrase = text.lower()

    open_ids = {a["course_id"] for a in scoped.list_access(member["email"]) if content.is_active(a)}
    courses = {c["id"]: c for c in scoped.list_courses() if c.get("active", True) and c["id"] in open_ids}

    # Every passage the student may read, with its place in the plan. The rarity of a word is worked out over these.
    pool = []
    for course_id, course in courses.items():
        placed = _placements(scoped, course_id)
        if not placed:
            continue
        files = {f["id"]: f for f in scoped.list_files(course_id) if f.get("status") == "ready" and f.get("ai_status") == "ready"}
        for passage in scoped.list_course_passages(course_id):
            file = files.get(passage["file_id"])
            if file is None or passage["file_id"] not in placed:
                continue
            pool.append({"course_id": course_id, "course": course["name"], "file_id": file["id"], "file": file["title"], "passage": passage, "places": placed[passage["file_id"]], "terms": terms(passage["text"])})

    weights = _weights(wanted, pool)
    hits = []
    for item in pool:
        passage = item["passage"]
        counts: dict[str, int] = {}
        for word in item["terms"]:
            counts[word] = counts.get(word, 0) + 1
        score = sum(weights[w] * min(counts.get(w, 0), 3) for w in wanted)
        if score == 0:
            continue
        if phrase and phrase in passage["text"].lower():
            score += 5
        if SELF_CHECK_MARK in passage["text"].lower():
            score *= SELF_CHECK_FACTOR
        snippet = _snippet(passage["text"], wanted, weights)
        present = set(item["terms"])
        coverage = sum(weights[w] for w in wanted if w in present) / sum(weights.values())
        for place in item["places"]:
            hits.append({
                "coverage": round(coverage, 2),
                "course_id": item["course_id"], "course": item["course"], **place, "file_id": item["file_id"], "file": item["file"], "page": passage["page"],
                "snippet": snippet, "score": round(score, 2),
            })
    hits.sort(key=lambda h: (-h["score"], h["course"], h["file"], h["page"]))
    return hits[:MAX_HITS]
