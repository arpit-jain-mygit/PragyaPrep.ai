"""Paging the admin's registrations list: newest first, a cursor in the X-Next-Cursor header, and no person missed or repeated."""
import pytest

from conftest import headers


@pytest.fixture
def school(make_tenant):
    """AaptPrep with its admin Ritesh. The students are added straight to the database, so each one has a set time."""
    make_tenant("aaptprep", "AaptPrep", "ritesh@example.com")
    return "aaptprep"


@pytest.fixture
def admin(school, sign_in):
    return sign_in(school, "ritesh@example.com")


def add(repo, tenant: str, number: int, status: str, role: str = "student") -> str:
    """Add a person whose registration time is the given minute, so the order is known: a bigger number is newer."""
    email = f"person{number:03d}@example.com"
    repo.scoped(tenant).create_member({
        "email": email, "role": role, "status": status, "first_name": "P", "last_name": str(number),
        "created_at": f"2027-01-01T10:{number:02d}:00+05:30",
    })
    return email


def page(client, admin, query: str = "", cursor: str | None = None):
    """One call to the list. Returns (the emails, the next cursor or None)."""
    url = f"/api/admin/registrations?{query}"
    if cursor is not None:
        url += f"&before={cursor}"
    response = client.get(url, headers=admin)
    assert response.status_code == 200, response.text
    next_cursor = response.headers.get("X-Next-Cursor", "")
    return [person["email"] for person in response.json()], (next_cursor or None)


def walk(client, admin, query: str, limit: int):
    """Follow the cursors from the first page to the last. Returns every page in order."""
    pages, cursor = [], None
    for _ in range(100):  # a safety stop, so a broken cursor cannot loop forever
        emails, cursor = page(client, admin, f"{query}&limit={limit}", cursor)
        pages.append(emails)
        if cursor is None:
            return pages
    raise AssertionError("the cursor never ran out")


def test_pages_come_newest_first_and_cover_everyone_once(client, repo, admin, school):
    made = [add(repo, school, number, "pending") for number in range(1, 8)]
    pages = walk(client, admin, "status=pending", limit=3)
    assert [len(p) for p in pages] == [3, 3, 1]
    flat = [email for p in pages for email in p]
    assert flat == list(reversed(made))  # newest (highest number) first, nobody repeated or missed


def test_all_statuses_merge_into_one_newest_first_list(client, repo, admin, school):
    made = []
    for number in range(1, 10):
        status = ["pending", "approved", "rejected"][number % 3]
        made.append(add(repo, school, number, status))
    flat = [email for p in walk(client, admin, "status=all", limit=4) for email in p]
    assert flat == list(reversed(made))


def test_a_single_status_only_gives_that_status(client, repo, admin, school):
    for number in range(1, 7):
        add(repo, school, number, "approved" if number % 2 else "pending")
    flat = [email for p in walk(client, admin, "status=approved", limit=2) for email in p]
    assert len(flat) == 3
    assert all(int(email[6:9]) % 2 == 1 for email in flat)


def test_parents_are_not_listed_and_pages_still_fill(client, repo, admin, school):
    # Parents sit between the students, so a page of students must read past them.
    for number in range(1, 9):
        add(repo, school, number, "pending", role="parent" if number % 2 else "student")
    pages = walk(client, admin, "status=pending", limit=2)
    assert [len(p) for p in pages if p] == [2, 2]  # a full page can be followed by an empty one
    flat = [email for p in pages for email in p]
    assert flat == ["person008@example.com", "person006@example.com", "person004@example.com", "person002@example.com"]


def test_no_limit_gives_everyone_with_no_cursor(client, repo, admin, school):
    made = [add(repo, school, number, "pending") for number in range(1, 5)]
    emails, cursor = page(client, admin, "status=pending")
    assert emails == list(reversed(made))
    assert cursor is None


def test_the_last_page_has_no_cursor_and_an_empty_list_is_fine(client, repo, admin, school):
    add(repo, school, 1, "pending")
    emails, cursor = page(client, admin, "status=pending&limit=5")
    assert emails == ["person001@example.com"]
    assert cursor is None
    emails, cursor = page(client, admin, "status=rejected&limit=5")
    assert emails == [] and cursor is None


def test_the_limit_must_be_between_1_and_100(client, admin):
    assert client.get("/api/admin/registrations?limit=0", headers=admin).status_code == 422
    assert client.get("/api/admin/registrations?limit=101", headers=admin).status_code == 422


def test_an_unknown_status_is_still_refused_when_paging(client, admin):
    assert client.get("/api/admin/registrations?status=nonsense&limit=5", headers=admin).status_code == 422


def test_pages_never_show_another_institute(client, repo, make_tenant, admin, school):
    make_tenant("otherprep", "OtherPrep", "boss@example.com")
    add(repo, "otherprep", 50, "pending")
    mine = add(repo, school, 1, "pending")
    flat = [email for p in walk(client, admin, "status=all", limit=5) for email in p]
    assert flat == [mine]
