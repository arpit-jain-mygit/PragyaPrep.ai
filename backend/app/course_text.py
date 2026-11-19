"""Reading the text of a course's PDFs, so the study helper can find the right part of the coursework.

A PDF is read page by page. Each page's text is cut into passages of a few hundred words, and every passage remembers
its file and page, so an answer can say where it came from. A PDF with no real text (a scan) is marked 'couldn't read'
instead of being saved empty. Only text is kept; the PDF itself stays where it is."""
import io
import re

from pypdf import PdfReader

MAX_WORDS = 220  # about one screen of reading; small enough to quote, big enough to keep a sentence together
MIN_CHARS = 200  # fewer characters than this in the whole file means there is no real text to use


class NotReadable(Exception):
    """The PDF has no usable text (a scan, or a damaged file)."""


def _page_texts(data: bytes) -> list[str]:
    try:
        reader = PdfReader(io.BytesIO(data))
        return [page.extract_text() or "" for page in reader.pages]
    except Exception as error:  # a damaged PDF must not break the upload flow
        raise NotReadable("This PDF could not be opened.") from error


def _clean(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _cut(text: str, max_words: int = MAX_WORDS) -> list[str]:
    """Split one page's text into pieces of up to max_words, breaking between paragraphs or sentences where possible."""
    pieces = []
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = " ".join(paragraph.split())
        if not paragraph:
            continue
        words = paragraph.split(" ")
        if len(words) <= max_words:
            pieces.append(paragraph)
            continue
        sentences = re.split(r"(?<=[.!?])\s+", paragraph)
        current: list[str] = []
        for sentence in sentences:
            sentence_words = sentence.split(" ")
            if current and len(current) + len(sentence_words) > max_words:
                pieces.append(" ".join(current))
                current = []
            # a sentence that is itself too long is cut hard, so no passage is huge
            while len(sentence_words) > max_words:
                pieces.append(" ".join(sentence_words[:max_words]))
                sentence_words = sentence_words[max_words:]
            current += sentence_words
        if current:
            pieces.append(" ".join(current))
    return pieces


def read_pdf(data: bytes) -> dict:
    """Return {'passages': [{'page': n, 'text': ...}, ...], 'pages': total pages}. Raises NotReadable when there is no text."""
    pages = _page_texts(data)
    passages = []
    total_chars = 0
    for number, raw in enumerate(pages, start=1):
        text = _clean(raw)
        total_chars += len(text)
        for piece in _cut(text):
            passages.append({"page": number, "text": piece})
    if total_chars < MIN_CHARS or not passages:
        raise NotReadable("No readable text was found. It may be a scanned copy.")
    return {"passages": passages, "pages": len(pages)}
