"""Which screens an institute shows, what each one is called, and in what order.

Every feature from the product plan is listed in CATALOGUE. Two kinds:
  - built: the screen exists today. The institute can show or hide it and rename it.
  - not built: the screen is planned, not finished. It is listed so the admin can see it, but it can't be
    switched on until it is built. This keeps a switch from pointing at nothing.

A new institute starts with every built feature on (so nothing changes for institutes that already use the app),
and every planned feature off. The institute's choices live on its tenant record, as the "features" field.
"""
from app.tenants import ValidationError

MAX_LABEL = 40

# (key, group, default label, built)
CATALOGUE = [
    # Built today: students see these in My Learning and on the home page.
    ("coursework", "Learning", "Coursework", True),
    ("live_classes", "Learning", "Live classes", True),
    ("tests", "Learning", "Tests", True),
    ("results", "Learning", "Results", True),
    ("notices", "Learning", "Notices", True),
    # Planned: listed for the admin, not switchable until built.
    ("dashboard_points", "Dashboard", "Oranges", False),
    ("word_of_day", "Dashboard", "Word of the day", True),
    ("leaderboard", "Dashboard", "Leaderboard", False),
    ("videos_library", "Learn", "Videos", False),
    ("vocabulary", "Learn", "Vocabulary", False),
    ("idioms", "Learn", "Idioms", False),
    ("topic_tests", "Practice", "Topic tests", False),
    ("sectionals", "Practice", "Sectionals", False),
    ("mocks", "Practice", "Mocks", False),
    ("daily_rc", "Practice", "Daily RC", False),
    ("weekly_dilr", "Practice", "Weekly DILR", False),
    ("past_papers", "Past papers", "Past papers", False),
    ("syllabus", "Past papers", "Syllabus", False),
    ("analytics", "Analyse", "Analytics", False),
    ("swot", "Analyse", "SWOT analysis", False),
    ("forum", "Community", "Forum", False),
    ("pi_bank", "Interview", "PI question bank", False),
    ("application_tracker", "Tools", "Applications", False),
    ("eligibility", "Tools", "Eligibility", False),
    ("cutoffs", "Tools", "Cutoffs", False),
    ("loan_calculator", "Tools", "Loan calculator", False),
]

_BY_KEY = {key: {"key": key, "group": group, "default_label": label, "built": built} for key, group, label, built in CATALOGUE}


def defaults() -> dict:
    """What a new institute gets: built features on with their own names, planned features off."""
    return {"order": [key for key, *_ in CATALOGUE], "items": {key: {"enabled": built, "label": label} for key, _group, label, built in CATALOGUE}}


def _saved(tenant: dict) -> dict:
    """The institute's saved choices, merged over the defaults so a new feature added later shows up for everyone."""
    base = defaults()
    saved = tenant.get("features") or {}
    for key, item in (saved.get("items") or {}).items():
        if key in base["items"]:
            base["items"][key] = {**base["items"][key], **item}
    order = [key for key in (saved.get("order") or []) if key in base["items"]]
    base["order"] = order + [key for key in base["order"] if key not in order]
    return base


def _label(raw) -> str:
    value = " ".join(str(raw or "").split())
    if not 1 <= len(value) <= MAX_LABEL:
        raise ValidationError(f"A label must be 1 to {MAX_LABEL} characters.")
    return value


def clean(raw) -> dict:
    """Check a list of features from the admin. Only the features sent are changed; the order is the order sent.

    Raises ValidationError with the first problem, and nothing is saved.
    """
    if not isinstance(raw, list):
        raise ValidationError("Send the features as a list.")
    seen: set[str] = set()
    items: dict = {}
    order: list[str] = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValidationError("Each feature must be a set of settings.")
        key = entry.get("key")
        if key not in _BY_KEY:
            raise ValidationError(f"Unknown feature: {key}.")
        if key in seen:
            raise ValidationError(f"{_BY_KEY[key]['default_label']} is listed twice.")
        seen.add(key)
        enabled = entry.get("enabled", False)
        if not isinstance(enabled, bool):
            raise ValidationError("Switch a feature on or off.")
        if enabled and not _BY_KEY[key]["built"]:
            raise ValidationError(f"{_BY_KEY[key]['default_label']} isn't built yet, so it can't be switched on.")
        label = _label(entry.get("label", _BY_KEY[key]["default_label"]))
        items[key] = {"enabled": enabled, "label": label}
        order.append(key)
    return {"order": order, "items": items}


def save(repo, tenant: dict, body: list) -> dict:
    """Save the admin's choices. The features sent come first, in that order; anything not sent keeps its place."""
    current = _saved(tenant)
    sent = clean(body)
    merged_items = {**current["items"], **sent["items"]}
    rest = [key for key in current["order"] if key not in sent["items"]]
    stored = {"order": sent["order"] + rest, "items": merged_items}
    repo.update_tenant(tenant["slug"], features=stored)
    return view(repo.get_tenant(tenant["slug"]))


def view(tenant: dict) -> list[dict]:
    """Every feature, for the admin's page, in the institute's order."""
    current = _saved(tenant)
    out = []
    for position, key in enumerate(current["order"]):
        meta = _BY_KEY[key]
        item = current["items"][key]
        out.append({**meta, "label": item["label"], "enabled": item["enabled"], "position": position})
    return out


def public(tenant: dict) -> list[dict]:
    """What students and visitors need: the built features, with their labels, in order. Planned features are not shown."""
    return [
        {"key": item["key"], "group": item["group"], "label": item["label"], "enabled": item["enabled"]}
        for item in view(tenant)
        if item["built"]
    ]
