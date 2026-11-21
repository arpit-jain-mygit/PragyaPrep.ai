"""Student-view design: the admin picks one of three designs, and students see the one chosen."""
import pytest

from app import features

URL = "/api/admin/features/design"
TENANT = {"X-Tenant": "aaptprep"}


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


def test_a_new_institute_starts_with_exam_mode_and_students_see_it(client, admin):
    assert client.get("/api/tenant", headers=TENANT).json()["design"] == "exam"
    body = client.get(URL, headers=admin).json()
    assert body["design"] == "exam"
    assert [option["key"] for option in body["options"]] == ["exam", "warm", "mentor"]


def test_the_admin_can_pick_one_of_the_three_designs(client, admin):
    response = client.put(URL, json={"design": "Mentor"}, headers=admin)
    assert response.status_code == 200
    assert response.json()["design"] == "mentor"
    assert client.get("/api/tenant", headers=TENANT).json()["design"] == "mentor"


def test_a_design_outside_the_three_is_refused(client, admin):
    response = client.put(URL, json={"design": "neon"}, headers=admin)
    assert response.status_code == 422
    assert response.json()["detail"] == "Choose one of the three designs."
    assert client.put(URL, json={"design": 3}, headers=admin).status_code == 422


def test_saving_other_settings_keeps_the_design(client, admin):
    client.put(URL, json={"design": "warm"}, headers=admin)
    client.put("/api/admin/features/icon-colour", json={"colour": "#059669"}, headers=admin)
    client.put("/api/admin/features/headings", json={"Tools": "target"}, headers=admin)
    rows = client.get("/api/admin/features", headers=admin).json()["features"]
    sent = [{"key": row["key"], "enabled": row["enabled"], "label": row["label"], "icon": row["icon"]} for row in rows]
    client.put("/api/admin/features", json=sent, headers=admin)
    assert client.get("/api/tenant", headers=TENANT).json()["design"] == "warm"


def test_the_three_designs_are_the_ones_the_website_knows(client):
    assert [option["key"] for option in features.DESIGNS] == ["exam", "warm", "mentor"]
