"""Answers from the coursework. The answer is written only when the search is confident (see study_search.is_confident), from
the top passages, and always names where it came from.

The model that writes the answer can be swapped. FakeAnswerModel needs no AI: it quotes the sentence of the passage that holds
the most question words, so it can never say anything the notes don't. Claude (through Bedrock) replaces it later."""
import re
from typing import Protocol

from app import study_search
from app.repo import TenantRepo

MAX_PASSAGES = 3  # the answer is written from at most this many passages


class AnswerModel(Protocol):
    def write(self, question: str, passages: list[dict]) -> str: ...


class FakeAnswerModel:
    """Quotes the best sentence from the top passage and names its source. It counts its calls, so tests can check when it runs."""

    def __init__(self) -> None:
        self.calls = 0

    def write(self, question: str, passages: list[dict]) -> str:
        self.calls += 1
        best = passages[0]
        sentence = _best_sentence(best["snippet"], best["matched"])
        return f"{sentence} (From {best['file']}, page {best['page']}.)"


def _best_sentence(text: str, matched: list[str]) -> str:
    """The sentence with the most question words in it (the first one if they tie)."""
    words = set(matched)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    if not sentences:
        return text.strip()
    def hits(sentence: str) -> int:
        return len(words & {"".join(ch for ch in w.lower() if ch.isalnum()) for w in sentence.split()})
    return max(sentences, key=lambda s: (hits(s), -sentences.index(s)))


MODEL: AnswerModel = FakeAnswerModel()


def answer(scoped: TenantRepo, member: dict, question: str, model: AnswerModel | None = None) -> dict:
    """Search, then answer only if the best passage covers enough of the question. Otherwise no model is called."""
    model = model or MODEL
    hits = study_search.search(scoped, member, question)
    if not study_search.is_confident(hits):
        return {"answered": False, "answer": None, "citations": [], "hits": hits}
    top = [h for h in hits if h["coverage"] >= study_search.MIN_COVERAGE][:MAX_PASSAGES]
    text = model.write(question, top)
    seen, citations = set(), []
    for h in top:
        key = (h["file_id"], h["page"])
        if key not in seen:
            seen.add(key)
            citations.append({"course_id": h["course_id"], "file_id": h["file_id"], "file": h["file"], "page": h["page"], "subtopic": h["subtopic"]})
    return {"answered": True, "answer": text, "citations": citations, "hits": hits}
