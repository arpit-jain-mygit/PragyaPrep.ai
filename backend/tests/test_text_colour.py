"""The text colour used on white: suggested from the brand colour, chosen by the admin, and checked to read well."""
import pytest

from app.tenants import contrast, suggested_text_color
from conftest import headers

URL = "/api/admin/institute"


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


def test_the_suggestion_reads_well_on_white_for_any_brand():
    # A pale green (the kind that caused the problem) and a few others.
    for brand in ["#bbf7d0", "#fde68a", "#f9a8d4", "#2563eb", "#000000", "#ffffff"]:
        assert contrast(suggested_text_color(brand), "#ffffff") >= 4.5, brand


def _brightness(color: str) -> int:
    return sum(int(color[i:i + 2], 16) for i in (1, 3, 5))


def test_the_suggestion_only_darkens_and_keeps_readable_colours_as_they_are():
    assert suggested_text_color("#2563eb") == "#2563eb"  # already readable: unchanged
    pale = suggested_text_color("#bbf7d0")
    assert pale != "#bbf7d0"
    assert _brightness(pale) < _brightness("#bbf7d0")


def test_a_new_institute_gets_a_readable_text_colour(client, admin):
    page = client.get(URL, headers=admin).json()
    assert contrast(page["text_color"], "#ffffff") >= 4.5


def test_the_admin_can_pick_a_text_colour_that_reads_well(client, admin):
    done = client.put(URL, json={"text_color": "#14532d"}, headers=admin)
    assert done.status_code == 200, done.text
    assert done.json()["text_color"] == "#14532d"
    public = client.get("/api/tenant", headers=headers("aaptprep")).json()
    assert public["branding"]["text_color"] == "#14532d"


def test_a_text_colour_too_light_for_white_is_refused_and_nothing_changes(client, admin):
    before = client.get(URL, headers=admin).json()
    refused = client.put(URL, json={"name": "New name", "text_color": "#bbf7d0"}, headers=admin)
    assert refused.status_code == 422
    assert "too light" in refused.json()["detail"]
    after = client.get(URL, headers=admin).json()
    assert after["name"] == before["name"] and after["text_color"] == before["text_color"]


def test_an_empty_text_colour_goes_back_to_the_suggestion(client, admin):
    client.put(URL, json={"text_color": "#14532d"}, headers=admin)
    done = client.put(URL, json={"text_color": ""}, headers=admin)
    assert done.status_code == 200
    assert done.json()["text_color"] == suggested_text_color(done.json()["primary_color"])


def test_a_new_brand_colour_gets_a_fresh_suggestion(client, admin):
    client.put(URL, json={"text_color": "#14532d"}, headers=admin)
    done = client.put(URL, json={"primary_color": "#f9a8d4"}, headers=admin).json()
    assert done["primary_color"] == "#f9a8d4"
    assert done["text_color"] == suggested_text_color("#f9a8d4")
