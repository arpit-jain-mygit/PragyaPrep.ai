"""Menu icons: each screen in the student's left menu shows an icon, and the admin can choose which one."""
import re
from pathlib import Path

import pytest

from app import features

URL = "/api/admin/features"
ICON_FILE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "app" / "ui" / "icon.ts"


def _frontend_menu_icons() -> list[str]:
    """The MENU_ICONS list in the student app's icon file, read as text (the two lists must match)."""
    text = ICON_FILE.read_text()
    block = re.search(r"export const MENU_ICONS = \[(.*?)\];", text, re.S).group(1)
    return re.findall(r"'([a-z-]+)'", block)


def _drawn_icons() -> set[str]:
    """Every icon name the icon file can draw."""
    text = ICON_FILE.read_text()
    block = text[text.index("const ICONS: Record<string, string[]> = {"):]
    return set(re.findall(r"^  '?([a-z-]+)'?: \[", block, re.M))


def test_every_menu_icon_is_drawn_by_the_student_app():
    assert set(features.MENU_ICONS) <= _drawn_icons()


def test_the_admin_and_the_student_app_offer_the_same_icons():
    assert sorted(features.MENU_ICONS) == sorted(_frontend_menu_icons())


def test_every_screen_has_a_default_icon_from_the_list():
    assert set(features.DEFAULT_ICONS) == {key for key, *_ in features.CATALOGUE}
    assert all(icon in features.MENU_ICONS for icon in features.DEFAULT_ICONS.values())


def test_a_new_institute_gets_the_default_icons():
    rows = features.view({"features": None})
    assert {row["key"]: row["icon"] for row in rows}["coursework"] == "play"


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


def test_the_admin_can_choose_an_icon_and_students_see_it(client, admin, make_tenant):
    rows = client.get(URL, headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": row["enabled"], "label": row["label"], "icon": "target" if row["key"] == "coursework" else row["icon"]} for row in rows]
    assert client.put(URL, json=sent, headers=admin).status_code == 200
    public = client.get("/api/tenant", headers={"X-Tenant": "aaptprep"}).json()["features"]
    assert next(item["icon"] for item in public if item["key"] == "coursework") == "target"


@pytest.mark.parametrize("bad", ["", "not-an-icon", None, 3])
def test_an_icon_outside_the_list_is_refused(bad):
    with pytest.raises(features.ValidationError) as caught:
        features.clean([{"key": "coursework", "enabled": True, "label": "Videos", "icon": bad}])
    assert str(caught.value) == "Choose an icon from the list."


HEADINGS = "/api/admin/features/headings"


def test_each_menu_heading_starts_with_its_icon_and_students_see_it(client, admin):
    public = client.get("/api/tenant", headers={"X-Tenant": "aaptprep"}).json()["menu_headings"]
    assert public["Learn"] == "book-open" and public["Dashboard"] == "grid"


def test_the_admin_can_change_a_heading_icon_and_the_others_keep_theirs(client, admin):
    assert client.put(HEADINGS, json={"Learn": "target"}, headers=admin).status_code == 200
    headings = client.get("/api/tenant", headers={"X-Tenant": "aaptprep"}).json()["menu_headings"]
    assert headings["Learn"] == "target"
    assert headings["Practice"] == "clipboard"


def test_saving_the_screens_keeps_the_heading_icons(client, admin):
    client.put(HEADINGS, json={"Tools": "target"}, headers=admin)
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": row["enabled"], "label": row["label"], "icon": row["icon"]} for row in rows]
    assert client.put("/api/admin/features", json=sent, headers=admin).status_code == 200
    headings = client.get("/api/tenant", headers={"X-Tenant": "aaptprep"}).json()["menu_headings"]
    assert headings["Tools"] == "target"


def test_an_unknown_heading_or_icon_is_refused(client, admin):
    assert client.put(HEADINGS, json={"Nonsense": "target"}, headers=admin).status_code == 422
    response = client.put(HEADINGS, json={"Learn": "not-an-icon"}, headers=admin)
    assert response.status_code == 422
    assert response.json()["detail"] == "Choose an icon from the list."
