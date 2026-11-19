"""Reading a course's PDFs for the study helper: the text is cut into passages with their page, scanned or broken PDFs are
marked as unreadable, and the admin can read the files again."""
import pytest

from app import course_text
from conftest import BUCKET, headers
from test_content import add_file, admin, exists, school, s3, student, url  # noqa: F401  (fixtures)


def text_pdf(pages: list[str]) -> bytes:
    """A small PDF with real, selectable text on each page (Helvetica, one line per sentence)."""
    objects = []
    kids = []
    font_id = 3 + 2 * len(pages)
    for index, text in enumerate(pages):
        page_id, stream_id = 3 + 2 * index, 4 + 2 * index
        kids.append(f"{page_id} 0 R")
        lines = "\n".join(f"BT /F1 11 Tf 40 {780 - 14 * n} Td ({line}) Tj ET" for n, line in enumerate(text.split("\n")))
        objects.append((page_id, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {stream_id} 0 R /Resources << /Font << /F1 {font_id} 0 R >> >> >>"))
        objects.append((stream_id, f"<< /Length {len(lines)} >>\nstream\n{lines}\nendstream"))
    objects = [(1, "<< /Type /Catalog /Pages 2 0 R >>"), (2, f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(pages)} >>")] + objects
    objects.append((font_id, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))
    body = b"%PDF-1.4\n"
    offsets = {}
    for number, content in sorted(objects):
        offsets[number] = len(body)
        body += f"{number} 0 obj\n{content}\nendobj\n".encode()
    xref = len(body)
    count = max(offsets) + 1
    body += f"xref\n0 {count}\n0000000000 65535 f \n".encode()
    for number in range(1, count):
        body += f"{offsets[number]:010d} 00000 n \n".encode()
    body += f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return body


LONG = " ".join(["Census 2011 counted about 121 crore people in India."] * 30)


# ---- The reader on its own ----

def test_text_is_cut_into_passages_that_keep_their_page():
    result = course_text.read_pdf(text_pdf([LONG, "Ports of India are on two coasts. " * 20]))
    assert result["pages"] == 2
    pages = {p["page"] for p in result["passages"]}
    assert pages == {1, 2}
    assert all(len(p["text"].split()) <= course_text.MAX_WORDS for p in result["passages"])
    assert "Census 2011" in result["passages"][0]["text"]


def test_a_blank_pdf_is_not_readable():
    with pytest.raises(course_text.NotReadable):
        course_text.read_pdf(text_pdf([""]))


def test_a_broken_file_is_not_readable_and_does_not_crash():
    with pytest.raises(course_text.NotReadable):
        course_text.read_pdf(b"%PDF-1.4 this is not a real pdf")


def test_cutting_keeps_sentences_together_and_never_makes_huge_pieces():
    words = " ".join(f"word{i}." for i in range(500))
    pieces = course_text._cut(words)
    assert len(pieces) > 1
    assert all(len(p.split()) <= course_text.MAX_WORDS for p in pieces)
    assert sum(len(p.split()) for p in pieces) == 500


# ---- Through the admin's upload and reindex ----

def test_a_readable_pdf_is_indexed_when_its_upload_finishes(client, school, admin, repo, s3):
    file, _ = add_file(client, s3, repo, admin, school["clat"], body=text_pdf([LONG]))
    assert file["ai_status"] == "ready"
    assert file["ai_pages"] == 1
    assert file["ai_passages"] >= 1
    stored = repo.scoped("aaptprep").list_course_passages(school["clat"]["id"])
    assert stored and all(p["file_id"] == file["id"] for p in stored)


def test_a_scanned_or_empty_pdf_is_kept_but_marked_unreadable(client, school, admin, repo, s3):
    file, _ = add_file(client, s3, repo, admin, school["clat"], name="scan.pdf", body=text_pdf([""]))
    assert file["status"] == "ready"
    assert file["ai_status"] == "unreadable"
    assert "scanned" in file["ai_note"]
    assert repo.scoped("aaptprep").list_course_passages(school["clat"]["id"]) == []


def test_videos_are_not_read(client, school, admin, repo, s3):
    mp4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
    file, _ = add_file(client, s3, repo, admin, school["clat"], name="lecture.mp4", body=mp4)
    assert file["ai_status"] is None


def test_deleting_a_file_removes_its_passages(client, school, admin, repo, s3):
    file, _ = add_file(client, s3, repo, admin, school["clat"], body=text_pdf([LONG]))
    client.delete(url(school["clat"], f"/{file['id']}"), headers=admin)
    assert repo.scoped("aaptprep").list_course_passages(school["clat"]["id"]) == []


def test_the_admin_can_read_a_course_again(client, school, admin, repo, s3):
    file, key = add_file(client, s3, repo, admin, school["clat"], body=text_pdf([LONG]))
    scoped = repo.scoped("aaptprep")
    scoped.delete_course_passages(school["clat"]["id"], file["id"])
    scoped.set_file_reading(school["clat"]["id"], file["id"], {"ai_status": "unreadable"})
    response = client.post(url(school["clat"], "/reindex"), headers=admin)
    assert response.status_code == 200, response.text
    fresh = {f["id"]: f for f in response.json()}[file["id"]]
    assert fresh["ai_status"] == "ready"
    assert scoped.list_course_passages(school["clat"]["id"])


def test_a_student_cannot_reindex(client, school, student):
    response = client.post(url(school["clat"], "/reindex"), headers=student)
    assert response.status_code in (401, 403)


def test_reindex_of_an_unknown_course_is_not_found(client, admin):
    response = client.post("/api/admin/courses/nope/files/reindex", headers=admin)
    assert response.status_code == 404
