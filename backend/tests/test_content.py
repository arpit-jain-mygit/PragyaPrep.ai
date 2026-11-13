"""Content tests: upload rules, grants, checked uploads, and signed download links for PDFs and MP4s."""
import boto3

from conftest import BUCKET, login

PDF_BYTES = b"%PDF-1.4\n" + b"x" * 200
MP4_BYTES = b"\x00\x00\x00\x18ftypmp42" + bytes(range(256)) * 4


def _create_course(client, admin_headers, title="CAT Quant") -> str:
    response = client.post("/api/admin/courses", headers=admin_headers, json={"title": title})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _grant(client, admin_headers, course_id, login_id):
    response = client.post(f"/api/admin/courses/{course_id}/grants", headers=admin_headers, json={"login_id": login_id})
    assert response.status_code == 201, response.text


def _upload(client, admin_headers, course_id, filename, data, title="Lesson 1"):
    """Do the full upload the way the browser does: ask for a form, post the file to S3, then confirm."""
    ticket = client.post(
        f"/api/admin/courses/{course_id}/content/upload-url",
        headers=admin_headers,
        json={"title": title, "filename": filename, "size_bytes": len(data)},
    )
    if ticket.status_code != 201:
        return ticket
    content_id = ticket.json()["content_id"]
    storage_key = client.app.state.repo.get_content(content_id)["storage_key"]
    boto3.client("s3", region_name="ap-south-1").put_object(Bucket=BUCKET, Key=storage_key, Body=data)
    return client.post(f"/api/admin/content/{content_id}/complete", headers=admin_headers)


def _course_content_ids(client, headers, course_id):
    response = client.get(f"/api/courses/{course_id}", headers=headers)
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["content_items"]]


def test_student_without_grant_sees_nothing(client, admin_headers, make_student):
    course_id = _create_course(client, admin_headers)
    _upload(client, admin_headers, course_id, "notes.pdf", PDF_BYTES)
    make_student()
    headers = login(client, "STU001", "student-pass-1")

    assert client.get("/api/courses", headers=headers).json() == []
    assert client.get(f"/api/courses/{course_id}", headers=headers).status_code == 404


def test_granted_student_gets_a_working_pdf_link(client, admin_headers, make_student):
    course_id = _create_course(client, admin_headers)
    uploaded = _upload(client, admin_headers, course_id, "notes.pdf", PDF_BYTES)
    assert uploaded.status_code == 200, uploaded.text
    content_id = uploaded.json()["id"]
    make_student()
    _grant(client, admin_headers, course_id, "STU001")
    headers = login(client, "STU001", "student-pass-1")

    assert _course_content_ids(client, headers, course_id) == [content_id]
    link = client.get(f"/api/content/{content_id}/url", headers=headers)
    assert link.status_code == 200
    assert link.json()["expires_in"] == 300
    assert "content/" in link.json()["url"] and BUCKET in link.json()["url"]


def test_mp4_upload_is_accepted(client, admin_headers):
    course_id = _create_course(client, admin_headers)
    response = _upload(client, admin_headers, course_id, "class.mp4", MP4_BYTES)
    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "video"
    assert response.json()["status"] == "ready"


def test_pending_upload_is_hidden_from_students(client, admin_headers, make_student):
    course_id = _create_course(client, admin_headers)
    ticket = client.post(
        f"/api/admin/courses/{course_id}/content/upload-url",
        headers=admin_headers,
        json={"title": "Not yet", "filename": "notes.pdf", "size_bytes": 100},
    )
    assert ticket.status_code == 201
    make_student()
    _grant(client, admin_headers, course_id, "STU001")
    headers = login(client, "STU001", "student-pass-1")
    assert _course_content_ids(client, headers, course_id) == []


def test_renamed_file_is_rejected_and_removed(client, admin_headers):
    course_id = _create_course(client, admin_headers)
    response = _upload(client, admin_headers, course_id, "fake.pdf", b"this is plain text, not a PDF")
    assert response.status_code == 400
    assert client.app.state.repo.list_course_content(course_id) == []


def test_unsupported_extension_is_refused_before_upload(client, admin_headers):
    course_id = _create_course(client, admin_headers)
    response = client.post(
        f"/api/admin/courses/{course_id}/content/upload-url",
        headers=admin_headers,
        json={"title": "Program", "filename": "run.exe", "size_bytes": 100},
    )
    assert response.status_code == 400


def test_old_video_formats_are_refused(client, admin_headers):
    course_id = _create_course(client, admin_headers)
    for name in ("clip.mov", "clip.webm", "clip.m4v"):
        response = client.post(
            f"/api/admin/courses/{course_id}/content/upload-url",
            headers=admin_headers,
            json={"title": "Clip", "filename": name, "size_bytes": 100},
        )
        assert response.status_code == 400, name


def test_declared_size_over_limit_is_refused(client, admin_headers):
    course_id = _create_course(client, admin_headers)
    response = client.post(
        f"/api/admin/courses/{course_id}/content/upload-url",
        headers=admin_headers,
        json={"title": "Huge", "filename": "huge.pdf", "size_bytes": 2 * 1024 * 1024},
    )
    assert response.status_code == 413


def test_file_larger_than_limit_is_removed_on_confirm(client, admin_headers):
    course_id = _create_course(client, admin_headers)
    ticket = client.post(
        f"/api/admin/courses/{course_id}/content/upload-url",
        headers=admin_headers,
        json={"title": "Sneaky", "filename": "big.pdf", "size_bytes": 100},
    )
    content_id = ticket.json()["content_id"]
    storage_key = client.app.state.repo.get_content(content_id)["storage_key"]
    # Simulate a browser that uploads more than the limit, which S3 would normally refuse.
    boto3.client("s3", region_name="ap-south-1").put_object(
        Bucket=BUCKET, Key=storage_key, Body=b"%PDF-" + b"0" * (2 * 1024 * 1024)
    )
    response = client.post(f"/api/admin/content/{content_id}/complete", headers=admin_headers)
    assert response.status_code == 400
    assert client.app.state.repo.get_content(content_id) is None


def test_revoking_access_hides_the_course(client, admin_headers, make_student):
    course_id = _create_course(client, admin_headers)
    _upload(client, admin_headers, course_id, "notes.pdf", PDF_BYTES)
    make_student()
    _grant(client, admin_headers, course_id, "STU001")
    headers = login(client, "STU001", "student-pass-1")
    assert client.get(f"/api/courses/{course_id}", headers=headers).status_code == 200

    assert client.delete(f"/api/admin/courses/{course_id}/grants/STU001", headers=admin_headers).status_code == 204
    assert client.get(f"/api/courses/{course_id}", headers=headers).status_code == 404


def test_student_cannot_upload(client, admin_headers, make_student):
    course_id = _create_course(client, admin_headers)
    make_student()
    headers = login(client, "STU001", "student-pass-1")
    response = client.post(
        f"/api/admin/courses/{course_id}/content/upload-url",
        headers=headers,
        json={"title": "Sneaky", "filename": "notes.pdf", "size_bytes": 100},
    )
    assert response.status_code == 403


def test_duplicate_course_title_is_rejected(client, admin_headers):
    _create_course(client, admin_headers, title="CAT Quant")
    response = client.post("/api/admin/courses", headers=admin_headers, json={"title": "cat quant"})
    assert response.status_code == 409
