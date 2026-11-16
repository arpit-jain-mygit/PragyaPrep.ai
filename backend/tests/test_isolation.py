"""Isolation tests: one institute can never read, change or collide with another's data.

This is the biggest risk of sharing tables between institutes, so these tests try hard to cross the line.
"""
import pytest

from app.repo import ConflictError, TenantRepo


class SpyTable:
    """Wraps the real table and records the key of every row a repository touches."""

    def __init__(self, table):
        self._table = table
        self.touched: list[str] = []

    def get_item(self, **kwargs):
        self.touched.append(kwargs["Key"]["PK"])
        return self._table.get_item(**kwargs)

    def put_item(self, **kwargs):
        self.touched.append(kwargs["Item"]["PK"])
        return self._table.put_item(**kwargs)

    def update_item(self, **kwargs):
        self.touched.append(kwargs["Key"]["PK"])
        return self._table.update_item(**kwargs)

    def delete_item(self, **kwargs):
        self.touched.append(kwargs["Key"]["PK"])
        return self._table.delete_item(**kwargs)


def member(email: str, **extra) -> dict:
    return {"email": email, "role": "student", "status": "pending", "first_name": "Asha", "last_name": "Rao", **extra}


def test_the_same_email_in_two_institutes_is_two_separate_people(repo):
    repo.scoped("alpha").create_member(member("asha@example.com", status="approved"))
    repo.scoped("beta").create_member(member("asha@example.com", status="rejected"))

    assert repo.scoped("alpha").get_member("asha@example.com")["status"] == "approved"
    assert repo.scoped("beta").get_member("asha@example.com")["status"] == "rejected"


def test_an_institute_cannot_see_a_person_registered_only_with_another(repo):
    repo.scoped("alpha").create_member(member("asha@example.com"))
    assert repo.scoped("beta").get_member("asha@example.com") is None


def test_changing_a_person_in_one_institute_leaves_the_other_untouched(repo):
    repo.scoped("alpha").create_member(member("asha@example.com"))
    repo.scoped("beta").create_member(member("asha@example.com"))

    repo.scoped("alpha").update_member("asha@example.com", status="suspended")

    assert repo.scoped("alpha").get_member("asha@example.com")["status"] == "suspended"
    assert repo.scoped("beta").get_member("asha@example.com")["status"] == "pending"


def test_updating_a_person_who_only_exists_elsewhere_creates_nothing(repo):
    repo.scoped("alpha").create_member(member("asha@example.com"))
    repo.scoped("beta").update_member("asha@example.com", status="approved")
    assert repo.scoped("beta").get_member("asha@example.com") is None
    assert repo.scoped("alpha").get_member("asha@example.com")["status"] == "pending"


def test_registering_the_same_email_twice_in_one_institute_is_a_conflict(repo):
    repo.scoped("alpha").create_member(member("asha@example.com"))
    with pytest.raises(ConflictError):
        repo.scoped("alpha").create_member(member("ASHA@example.com"))


def test_every_row_a_scoped_repo_touches_belongs_to_its_own_institute(repo):
    spy = SpyTable(repo.table)
    scoped = TenantRepo(spy, "alpha")

    scoped.create_member(member("asha@example.com"))
    scoped.get_member("asha@example.com")
    scoped.get_member("someone.else@example.com")
    scoped.update_member("asha@example.com", status="approved")

    assert spy.touched, "the spy recorded nothing"
    assert all(key.startswith("T#alpha#") for key in spy.touched), spy.touched


def test_a_short_name_that_starts_like_another_does_not_overlap_it(repo):
    # "abc" and "abc-def": a prefix match on "T#abc" would wrongly cover both. The '#' after the name prevents it.
    repo.scoped("abc-def").create_member(member("asha@example.com"))
    assert repo.scoped("abc").get_member("asha@example.com") is None
    assert repo.scoped("abc").get_member("def#MEMBER#asha@example.com") is None


@pytest.mark.parametrize("slug", ["", "a", "ab", "A#b", "abc#def", "abc#", "../x", "9abc", "abc def", "a" * 31])
def test_a_repo_cannot_be_built_for_a_malformed_institute_name(repo, slug):
    with pytest.raises(ValueError):
        repo.scoped(slug)


def test_a_person_with_a_hash_in_their_email_cannot_reach_another_institute(repo):
    repo.scoped("beta").create_member(member("asha@example.com"))
    sneaky = "x#MEMBER#asha@example.com"
    assert repo.scoped("alpha").get_member(sneaky) is None


def test_institute_records_and_member_rows_never_mix(repo, make_tenant):
    make_tenant("alpha")
    # The institute's own record is platform data. A scoped repo can't find it as a member.
    assert repo.scoped("alpha").get_member("TENANT#alpha") is None
    assert repo.get_tenant("alpha")["slug"] == "alpha"


def test_requests_for_two_institutes_see_their_own_branding(client, make_tenant):
    make_tenant("alpha", "Alpha Institute")
    make_tenant("beta", "Beta Academy")

    alpha = client.get("/api/tenant", headers={"X-Tenant": "alpha"}).json()
    beta = client.get("/api/tenant", headers={"X-Tenant": "beta"}).json()

    assert alpha["name"] == "Alpha Institute"
    assert beta["name"] == "Beta Academy"
    assert "beta" not in str(alpha).lower().replace("alpha", "")
