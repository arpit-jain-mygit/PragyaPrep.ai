"""Pictures on questions: uploaded first, checked, then attached to a question or to one of its options."""
import pytest

from conftest import BUCKET, headers

URL = "/api/admin/questions"
IMG = "/api/admin/question-images"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 40


@pytest.fixture
def school(make_tenant, add_member):
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    add_member("aaptprep", "asha@example.com")


@pytest.fixture
def admin(school, sign_in):
    return sign_in("aaptprep", "ritesh@example.com")


@pytest.fixture
def s3(client):
    return client.app.state.storage.s3


def exists(s3, key) -> bool:
    return "Contents" in s3.list_objects_v2(Bucket=BUCKET, Prefix=key)


def question(**overrides) -> dict:
    body = {
        "paper": "physics", "topic": "Optics", "text": "Which ray diagram is right?",
        "options": [{"text": f"Option {n}", "why": f"Reason {n}"} for n in "ABCD"],
        "correct": 1, "difficulty": "easy", "status": "draft",
    }
    return {**body, **overrides}


def put(client, s3, repo, image_id, body=PNG, slug="aaptprep"):
    image = repo.scoped(slug).get_image(image_id)
    s3.put_object(Bucket=BUCKET, Key=image["key"], Body=body)
    return image["key"]


def ready_picture(client, s3, repo, admin, name="diagram.png", body=PNG):
    started = client.post(IMG, json={"filename": name, "size": len(body)}, headers=admin).json()
    put(client, s3, repo, started["id"], body)
    done = client.post(f"{IMG}/{started['id']}/complete", headers=admin)
    assert done.status_code == 200, done.text
    return started["id"]


# ---- Who may ----

def test_only_an_admin_can_use_pictures(client, school, admin, sign_in):
    student = sign_in("aaptprep", "asha@example.com")
    calls = [("post", IMG, {"filename": "a.png", "size": 10}), ("post", f"{IMG}/x/complete", None), ("delete", f"{IMG}/x", None)]
    for method, path, body in calls:
        assert client.request(method, path, json=body, headers=headers("aaptprep")).status_code == 401
        assert client.request(method, path, json=body, headers=student).status_code == 403


# ---- Uploading ----

def test_a_picture_goes_to_the_institutes_folder_and_gets_a_signed_form(client, admin, repo, s3):
    started = client.post(IMG, json={"filename": "Circuit.PNG", "size": len(PNG)}, headers=admin).json()
    assert started["upload"]["url"] and started["upload"]["fields"]["Content-Type"] == "image/png"
    image = repo.scoped("aaptprep").get_image(started["id"])
    assert image["key"].startswith("aaptprep/question-images/") and image["key"].endswith(".png")
    assert image["status"] == "uploading" and image["ttl"]


def test_a_real_picture_is_accepted_and_given_a_link(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    done = client.post(f"{IMG}/{image_id}/complete", headers=admin).json()
    assert done["id"] == image_id and done["url"].startswith("http")
    assert repo.scoped("aaptprep").get_image(image_id)["status"] == "ready"


def test_jpg_is_accepted_too(client, admin, repo, s3):
    assert ready_picture(client, s3, repo, admin, name="photo.jpeg", body=JPG)


@pytest.mark.parametrize("name", ["a.gif", "a.svg", "a.pdf", "noending", "a.PNG.exe"])
def test_other_types_are_refused(client, admin, name):
    response = client.post(IMG, json={"filename": name, "size": 10}, headers=admin)
    assert response.status_code == 422 and "PNG or JPG" in response.json()["detail"]


@pytest.mark.parametrize("size", [0, -1, 1024 * 1024 + 1, True, "5"])
def test_bad_sizes_are_refused(client, admin, size):
    assert client.post(IMG, json={"filename": "a.png", "size": size}, headers=admin).status_code == 422


def test_exactly_one_megabyte_is_allowed(client, admin):
    assert client.post(IMG, json={"filename": "a.png", "size": 1024 * 1024}, headers=admin).status_code == 201


def test_a_fake_picture_is_removed(client, admin, repo, s3):
    started = client.post(IMG, json={"filename": "fake.png", "size": 20}, headers=admin).json()
    key = put(client, s3, repo, started["id"], b"this is not a picture at all")
    response = client.post(f"{IMG}/{started['id']}/complete", headers=admin)
    assert response.status_code == 422 and "isn't a real PNG or JPG" in response.json()["detail"]
    assert not exists(s3, key) and repo.scoped("aaptprep").get_image(started["id"]) is None


def test_a_picture_that_never_arrived_is_refused(client, admin):
    started = client.post(IMG, json={"filename": "a.png", "size": 20}, headers=admin).json()
    response = client.post(f"{IMG}/{started['id']}/complete", headers=admin)
    assert response.status_code == 422 and "hasn't arrived" in response.json()["detail"]


def test_a_picture_bigger_than_announced_is_removed(client, admin, repo, s3):
    started = client.post(IMG, json={"filename": "a.png", "size": 10}, headers=admin).json()
    key = put(client, s3, repo, started["id"], PNG)
    assert client.post(f"{IMG}/{started['id']}/complete", headers=admin).status_code == 422
    assert not exists(s3, key)


def test_completing_an_unknown_picture_is_404(client, admin):
    assert client.post(f"{IMG}/nope/complete", headers=admin).status_code == 404


# ---- Attaching to a question ----

def test_a_question_can_have_a_picture_on_the_question_and_on_options(client, admin, repo, s3):
    q_img = ready_picture(client, s3, repo, admin)
    b_img = ready_picture(client, s3, repo, admin, name="b.jpg", body=JPG)
    response = client.post(URL, json=question(images={"question": q_img, "B": b_img}), headers=admin)
    assert response.status_code == 201, response.text
    saved = response.json()
    assert set(saved["images"]) == {"question", "B"}
    assert saved["images"]["question"]["id"] == q_img and saved["images"]["question"]["url"].startswith("http")
    row = repo.scoped("aaptprep").get_image(q_img)
    assert row["question_id"] == saved["id"] and "ttl" not in row
    assert client.get(URL, headers=admin).json()[0]["images"]["B"]["id"] == b_img


def test_the_stored_path_is_never_shown(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    saved = client.post(URL, json=question(images={"question": image_id}), headers=admin).json()
    assert set(saved["images"]["question"]) == {"id", "url"}


def test_an_option_with_a_picture_may_leave_its_text_empty(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    options = [{"text": "", "why": "It shows the right ray."}] + [{"text": f"Option {n}", "why": "r"} for n in "BCD"]
    response = client.post(URL, json=question(options=options, images={"A": image_id}), headers=admin)
    assert response.status_code == 201 and response.json()["options"][0]["text"] == ""


def test_an_option_with_no_text_and_no_picture_is_still_refused(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    options = [{"text": "Option A", "why": "r"}, {"text": "", "why": "r"}] + [{"text": f"Option {n}", "why": "r"} for n in "CD"]
    errors = client.post(URL, json=question(options=options, images={"A": image_id}), headers=admin).json()["errors"]
    assert errors["options"] == "Option 2 is required."


def test_the_reason_is_still_required_when_there_is_a_picture(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    options = [{"text": "", "why": ""}] + [{"text": f"Option {n}", "why": "r"} for n in "BCD"]
    errors = client.post(URL, json=question(options=options, images={"A": image_id}), headers=admin).json()["errors"]
    assert errors["options"] == "The reason for option 1 is required."


def test_two_options_with_only_pictures_are_not_called_the_same(client, admin, repo, s3):
    a, b = ready_picture(client, s3, repo, admin), ready_picture(client, s3, repo, admin)
    options = [{"text": "", "why": "r1"}, {"text": "", "why": "r2"}, {"text": "C", "why": "r"}, {"text": "D", "why": "r"}]
    assert client.post(URL, json=question(options=options, images={"A": a, "B": b}), headers=admin).status_code == 201


def test_an_unknown_picture_unready_picture_or_position_is_refused(client, admin, repo, s3):
    started = client.post(IMG, json={"filename": "a.png", "size": 10}, headers=admin).json()  # never completed
    ready = ready_picture(client, s3, repo, admin)
    for images in ({"question": "nope"}, {"question": started["id"]}, {"E": ready}):
        errors = client.post(URL, json=question(images=images), headers=admin).json()["errors"]
        assert "images" in errors, images


def test_a_picture_can_only_be_on_one_question(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    assert client.post(URL, json=question(images={"question": image_id}), headers=admin).status_code == 201
    again = client.post(URL, json=question(text="Another", images={"question": image_id}), headers=admin)
    assert again.status_code == 422 and "images" in again.json()["errors"]


def test_picture_problems_come_with_the_other_mistakes(client, admin):
    errors = client.post(URL, json=question(text="", images={"question": "nope"}), headers=admin).json()["errors"]
    assert set(errors) == {"text", "images"}


# ---- Changing and removing ----

def test_a_picture_can_be_replaced_and_the_old_one_is_deleted(client, admin, repo, s3):
    old = ready_picture(client, s3, repo, admin)
    saved = client.post(URL, json=question(images={"question": old}), headers=admin).json()
    old_key = repo.scoped("aaptprep").get_image(old)["key"]
    new = ready_picture(client, s3, repo, admin, name="new.jpg", body=JPG)
    response = client.patch(f"{URL}/{saved['id']}", json={"images": {"question": new}}, headers=admin)
    assert response.status_code == 200 and response.json()["images"]["question"]["id"] == new
    assert not exists(s3, old_key) and repo.scoped("aaptprep").get_image(old) is None
    assert repo.scoped("aaptprep").get_image(new)["question_id"] == saved["id"]


def test_a_picture_can_be_removed_with_null(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    saved = client.post(URL, json=question(images={"question": image_id}), headers=admin).json()
    key = repo.scoped("aaptprep").get_image(image_id)["key"]
    response = client.patch(f"{URL}/{saved['id']}", json={"images": {"question": None}}, headers=admin)
    assert response.json()["images"] == {} and not exists(s3, key)


def test_editing_other_fields_keeps_the_pictures(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    saved = client.post(URL, json=question(images={"question": image_id}), headers=admin).json()
    edited = client.patch(f"{URL}/{saved['id']}", json={"text": "New wording"}, headers=admin).json()
    assert edited["images"]["question"]["id"] == image_id


def test_removing_the_text_of_an_option_without_a_picture_is_refused(client, admin, repo, s3):
    saved = client.post(URL, json=question(), headers=admin).json()
    options = [{"text": "", "why": "r"}] + saved["options"][1:]
    assert client.patch(f"{URL}/{saved['id']}", json={"options": options}, headers=admin).status_code == 422


def test_an_option_text_can_be_cleared_when_it_has_a_picture(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    saved = client.post(URL, json=question(), headers=admin).json()
    options = [{"text": "", "why": "r"}] + saved["options"][1:]
    response = client.patch(f"{URL}/{saved['id']}", json={"options": options, "images": {"A": image_id}}, headers=admin)
    assert response.status_code == 200


def test_deleting_a_question_deletes_its_pictures(client, admin, repo, s3):
    a, b = ready_picture(client, s3, repo, admin), ready_picture(client, s3, repo, admin)
    saved = client.post(URL, json=question(images={"question": a, "C": b}), headers=admin).json()
    keys = [repo.scoped("aaptprep").get_image(i)["key"] for i in (a, b)]
    assert client.delete(f"{URL}/{saved['id']}", headers=admin).status_code == 204
    assert not any(exists(s3, key) for key in keys)
    assert repo.scoped("aaptprep").get_image(a) is None and repo.scoped("aaptprep").get_image(b) is None


# ---- Throwing away an unused picture ----

def test_an_unused_picture_can_be_discarded(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    key = repo.scoped("aaptprep").get_image(image_id)["key"]
    assert client.delete(f"{IMG}/{image_id}", headers=admin).status_code == 204
    assert not exists(s3, key) and repo.scoped("aaptprep").get_image(image_id) is None
    assert client.delete(f"{IMG}/{image_id}", headers=admin).status_code == 404


def test_a_picture_on_a_question_cannot_be_discarded_that_way(client, admin, repo, s3):
    image_id = ready_picture(client, s3, repo, admin)
    client.post(URL, json=question(images={"question": image_id}), headers=admin)
    response = client.delete(f"{IMG}/{image_id}", headers=admin)
    assert response.status_code == 409 and repo.scoped("aaptprep").get_image(image_id)


# ---- Privacy between institutes ----

def test_another_institute_cannot_use_or_remove_a_picture(client, admin, repo, s3, make_tenant, sign_in):
    image_id = ready_picture(client, s3, repo, admin)
    make_tenant("other-school", "Other", "boss@example.com")
    other = sign_in("other-school", "boss@example.com")
    assert client.post(f"{IMG}/{image_id}/complete", headers=other).status_code == 404
    assert client.delete(f"{IMG}/{image_id}", headers=other).status_code == 404
    errors = client.post(URL, json=question(images={"question": image_id}), headers=other).json()["errors"]
    assert "images" in errors
    assert repo.scoped("aaptprep").get_image(image_id)["status"] == "ready"


# ---- Finding questions with pictures ----

def test_the_list_can_be_filtered_to_questions_with_or_without_pictures(client, admin, repo, s3, fake_clock):
    plain = client.post(URL, json=question(text="No picture"), headers=admin).json()
    fake_clock.advance(1)
    on_question = client.post(URL, json=question(text="Picture on question", images={"question": ready_picture(client, s3, repo, admin)}), headers=admin).json()
    fake_clock.advance(1)
    on_option = client.post(URL, json=question(text="Picture on option", images={"D": ready_picture(client, s3, repo, admin)}), headers=admin).json()

    ids = lambda params: [q["id"] for q in client.get(URL, params=params, headers=admin).json()]
    assert ids({"pictures": "yes"}) == [on_option["id"], on_question["id"]]
    assert ids({"pictures": "no"}) == [plain["id"]]
    assert len(ids({})) == 3 and len(ids({"pictures": ""})) == 3


def test_the_pictures_filter_combines_with_the_others(client, admin, repo, s3):
    client.post(URL, json=question(text="Physics pic", images={"question": ready_picture(client, s3, repo, admin)}), headers=admin)
    client.post(URL, json=question(paper="chemistry", topic="Solutions", text="Chem pic", images={"question": ready_picture(client, s3, repo, admin)}), headers=admin)
    found = client.get(URL, params={"pictures": "yes", "paper": "chemistry"}, headers=admin).json()
    assert [q["text"] for q in found] == ["Chem pic"]


def test_a_question_loses_the_tag_when_its_pictures_are_removed(client, admin, repo, s3):
    saved = client.post(URL, json=question(images={"question": ready_picture(client, s3, repo, admin)}), headers=admin).json()
    client.patch(f"{URL}/{saved['id']}", json={"images": {"question": None}}, headers=admin)
    assert client.get(URL, params={"pictures": "yes"}, headers=admin).json() == []


def test_excel_imported_pictures_are_found_too(client, admin, repo, s3):
    from test_question_import import good_row, pic_book, post, stage
    stage(client, admin, repo, "imp.png")
    post(client, admin, pic_book([good_row(**{"Question image": "imp.png"}), good_row(Question="Second?")]), confirm=True)
    assert [q["text"] for q in client.get(URL, params={"pictures": "yes"}, headers=admin).json()] == ["Which colour bends the most?"]
