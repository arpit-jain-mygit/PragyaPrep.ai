"""The Features & labels page: an institute chooses which screens show, what they are called, and their order."""
import pytest

from app import features
from app.tenants import ValidationError
from conftest import headers

URL = "/api/admin/features"
BUILT = [key for key, _group, _label, built in features.CATALOGUE if built]
PLANNED = [key for key, _group, _label, built in features.CATALOGUE if not built]


@pytest.fixture
def admin(make_tenant, sign_in):
    make_tenant("aaptprep", "AaptPrep", "ritesh@aaptprep.example.com")
    return sign_in("aaptprep", "ritesh@aaptprep.example.com")


def _listed(client, admin_headers):
    return client.get(URL, headers=admin_headers).json()["features"]


def _as_sent(rows):
    """The shape the admin page sends back: every row, with its key, label and switch."""
    return [{"key": row["key"], "enabled": row["enabled"], "label": row["label"]} for row in rows]


def test_a_new_institute_has_built_features_on_and_planned_ones_off(client, admin):
    rows = {row["key"]: row for row in _listed(client, admin)}
    assert set(rows) == {key for key, *_ in features.CATALOGUE}
    assert all(rows[key]["enabled"] for key in BUILT)
    assert not any(rows[key]["enabled"] for key in PLANNED)
    assert rows["tests"]["label"] == "Tests"


def test_the_admin_can_rename_and_hide_a_built_feature(client, admin):
    rows = _as_sent(_listed(client, admin))
    for row in rows:
        if row["key"] == "results":
            row["label"] = "My scores"
        if row["key"] == "notices":
            row["enabled"] = False
    saved = client.put(URL, json=rows, headers=admin)
    assert saved.status_code == 200, saved.text
    by_key = {row["key"]: row for row in saved.json()["features"]}
    assert by_key["results"]["label"] == "My scores"
    assert by_key["notices"]["enabled"] is False


def test_the_admin_can_change_the_order(client, admin):
    rows = _as_sent(_listed(client, admin))
    rows = [rows[-1]] + rows[:-1]
    saved = client.put(URL, json=rows, headers=admin).json()["features"]
    assert [row["key"] for row in saved] == [row["key"] for row in rows]
    assert [row["position"] for row in saved] == list(range(len(saved)))


def test_a_planned_feature_cannot_be_switched_on(client, admin):
    rows = _as_sent(_listed(client, admin))
    for row in rows:
        if row["key"] == "mocks":
            row["enabled"] = True
    refused = client.put(URL, json=rows, headers=admin)
    assert refused.status_code == 422
    assert "isn't built yet" in refused.json()["detail"]


def test_a_refused_save_changes_nothing(client, admin):
    before = _listed(client, admin)
    rows = _as_sent(before)
    rows[0]["label"] = "Renamed"
    rows[1]["label"] = ""  # empty label: refused
    assert client.put(URL, json=rows, headers=admin).status_code == 422
    assert _listed(client, admin) == before


def test_labels_must_be_short_and_not_blank(client, admin):
    rows = _as_sent(_listed(client, admin))
    rows[0]["label"] = "x" * (features.MAX_LABEL + 1)
    assert client.put(URL, json=rows, headers=admin).status_code == 422


def test_unknown_or_repeated_features_are_refused(client, admin):
    rows = _as_sent(_listed(client, admin))
    assert client.put(URL, json=rows + [{"key": "made_up", "enabled": True, "label": "X"}], headers=admin).status_code == 422
    assert client.put(URL, json=rows + [rows[0]], headers=admin).status_code == 422


def test_students_and_parents_can_not_change_the_features(client, admin, add_member, sign_in):
    add_member("aaptprep", "student@example.com")
    student = sign_in("aaptprep", "student@example.com")
    refused = client.put(URL, json=_as_sent(_listed(client, admin)), headers=student)
    assert refused.status_code == 403, refused.text
    assert client.get(URL, headers=student).status_code == 403


def test_the_public_tenant_info_lists_the_built_features_in_order_with_their_switches(client, admin):
    rows = _as_sent(_listed(client, admin))
    for row in rows:
        if row["key"] == "notices":
            row["enabled"] = False
        if row["key"] == "coursework":
            row["label"] = "Coursework (new name)"
    client.put(URL, json=rows, headers=admin)
    public = client.get("/api/tenant", headers=headers("aaptprep")).json()["features"]
    assert [item["key"] for item in public] == [row["key"] for row in rows if row["key"] in BUILT]
    by_key = {item["key"]: item for item in public}
    assert by_key["notices"]["enabled"] is False
    assert by_key["coursework"]["label"] == "Coursework (new name)"
    assert "mocks" not in by_key


def test_one_institute_can_not_change_another_institutes_features(client, admin, make_tenant, sign_in):
    make_tenant("other", "Other", "admin@other.example.com")
    other = sign_in("other", "admin@other.example.com")
    rows = _as_sent(_listed(client, other))
    for row in rows:
        if row["key"] == "tests":
            row["label"] = "Other's tests"
    client.put(URL, json=rows, headers=other)
    mine = {row["key"]: row for row in _listed(client, admin)}
    assert mine["tests"]["label"] == "Tests"


def test_features_module_fills_in_features_added_later(make_tenant):
    """An institute saved before a new feature existed still sees that feature, with its default."""
    tenant = {"slug": "x", "features": {"order": ["tests"], "items": {"tests": {"enabled": False, "label": "Exams"}}}}
    listed = {row["key"]: row for row in features.view(tenant)}
    assert listed["tests"]["label"] == "Exams" and listed["tests"]["enabled"] is False
    assert listed["coursework"]["enabled"] is True
    assert features.view(tenant)[0]["key"] == "tests"


def test_clean_refuses_bad_switches():
    with pytest.raises(ValidationError):
        features.clean([{"key": "tests", "enabled": "yes", "label": "Tests"}])
    with pytest.raises(ValidationError):
        features.clean("not a list")
