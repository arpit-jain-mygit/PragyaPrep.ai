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
# The group is the heading in the student's left menu, in this order. The rows are the menu items under it.
# Built items can be switched on. Planned items are listed so the admin can name and order them, but can't be
# switched on until they are built.
CATALOGUE = [
    # Dashboard: the home page. Its cards are built; the overview tiles are planned.
    ("dashboard_points", "Dashboard", "Oranges", True),
    ("word_of_day", "Dashboard", "Word of the day", True),
    ("leaderboard", "Dashboard", "Leaderboard", True),
    ("yesterday_winners", "Dashboard", "Yesterday's winners", True),
    ("daily_challenge", "Dashboard", "Daily challenge", True),  # the dashboard card for today's Daily RC passage
    ("word_battle", "Vocab builder", "Word battle", False),
    ("flashcards", "Vocab builder", "Flashcards", False),
    ("word_list", "Vocab builder", "Word list", False),
    ("crossword", "Vocab builder", "Crossword", False),
    ("phrasal_verbs", "Vocab builder", "Phrasal verbs", False),
    ("activity", "Overview", "Activity", False),
    ("unresolved_doubts", "Overview", "Unresolved doubts", False),
    ("free_resources", "Overview", "Free resources", False),
    # Learn
    ("coursework", "Learn", "Videos", True),
    ("vocabulary", "Learn", "Vocabulary", True),
    ("idioms", "Learn", "Idioms", True),
    # Practice
    ("topic_tests", "Practice", "Topic tests", True),
    ("sectionals", "Practice", "Sectionals", True),
    ("mocks", "Practice", "Mocks", True),
    ("daily_rc", "Practice", "Daily RC", True),
    ("weekly_dilr", "Practice", "Weekly DILR", True),
    # Past papers
    ("past_papers", "Past papers", "Attempt", True),
    ("past_papers_explore", "Past papers", "Explore", True),
    ("syllabus", "Past papers", "Syllabus", True),
    ("filter_topics", "Past papers", "Filter topics", True),
    # Analyse
    ("analyse_topic_tests", "Analyse", "Topic tests", True),
    ("analyse_sectionals", "Analyse", "Sectionals", True),
    ("analyse_mocks", "Analyse", "Mocks", True),
    ("swot", "Analyse", "SWOT analysis", True),
    # Forum and interview
    ("forum", "Forum", "Home", False),
    ("forum_explore", "Forum", "Explore", False),
    ("pi_bank", "Interview", "Question bank", True),
    ("interview_guide", "Interview", "Guide", False),
    # Help
    ("feedback", "Help", "Feedback", True),
    ("help", "Help", "Help", True),
    # Tools
    ("application_tracker", "Tools", "Applications", True),
    ("eligibility", "Tools", "Eligibility", True),
    ("tools_syllabus", "Tools", "Syllabus", True),
    ("cutoffs", "Tools", "Cutoffs", True),
    ("loan_calculator", "Tools", "Loan calculator", False),
    # Screen register: see wireframe-mapping.md. Every wireframe screen has a key above.
# As-is: not in the wireframes, kept unchanged. Shown after the wireframe groups.
    ("live_classes", "My learning", "Live classes", True),
    ("tests", "My learning", "Tests", True),
    ("results", "My learning", "Results", True),
    ("notices", "My learning", "Notices", True),
]

_BY_KEY = {key: {"key": key, "group": group, "default_label": label, "built": built} for key, group, label, built in CATALOGUE}
# The icons a menu item can show. Each name must be drawn in the student app's icon set (frontend/src/app/ui/icon.ts);
# a test checks that every name here is there. The admin picks from this list.
MENU_ICONS = [
    "grid", "home", "play", "book", "book-open", "clipboard", "file", "layers", "chart", "calendar", "list", "filter",
    "search", "shuffle", "flag", "target", "history", "clock", "check", "message", "user", "wrench", "smile", "star",
    "help", "bell", "building", "video", "pencil",
]

# The icon each menu item starts with, following the wireframes. The admin can change any of them.
DEFAULT_ICONS = {
    "dashboard_points": "grid", "word_of_day": "star", "leaderboard": "chart", "yesterday_winners": "flag", "daily_challenge": "target",
    "word_battle": "pencil", "flashcards": "layers", "word_list": "list", "crossword": "grid", "phrasal_verbs": "message",
    "activity": "user", "unresolved_doubts": "help", "free_resources": "book",
    "coursework": "play", "vocabulary": "book", "idioms": "book-open",
    "topic_tests": "clipboard", "sectionals": "file", "mocks": "layers", "daily_rc": "calendar", "weekly_dilr": "calendar",
    "past_papers": "history", "past_papers_explore": "search", "syllabus": "list", "filter_topics": "filter",
    "analyse_topic_tests": "chart", "analyse_sectionals": "chart", "analyse_mocks": "chart", "swot": "target",
    "forum": "message", "forum_explore": "search", "pi_bank": "user", "interview_guide": "book-open",
    "feedback": "smile", "help": "help",
    "application_tracker": "clipboard", "eligibility": "check", "tools_syllabus": "list", "cutoffs": "clock", "loan_calculator": "wrench",
    "live_classes": "video", "tests": "clipboard", "results": "chart", "notices": "bell",
}


# The menu headings (the groups in the student's left menu, plus the Dashboard link) and the icon each starts with.
# The admin can change them on the Features and labels page; they are kept apart from the screens.
HEADING_ICONS = {
    "Dashboard": "grid", "Vocab builder": "book", "Overview": "chart", "Learn": "book-open", "Practice": "clipboard",
    "Past papers": "history", "Analyse": "chart", "Forum": "message", "Interview": "user", "Tools": "wrench",
    "Help": "help", "My learning": "video",
}


# The colours an institute can pick for the student's menu icons. Each one is strong enough to read on white
# (at least 3 to 1 contrast, the WCAG guide for icons). The first one is the recommendation, and the default.
ICON_COLOURS = [
    {"hex": "#4f46e5", "name": "Indigo"},
    {"hex": "#0891b2", "name": "Cyan"},
    {"hex": "#059669", "name": "Emerald"},
    {"hex": "#7c3aed", "name": "Violet"},
    {"hex": "#db2777", "name": "Pink"},
    {"hex": "#dc2626", "name": "Red"},
    {"hex": "#d97706", "name": "Amber"},
    {"hex": "#0f172a", "name": "Ink"},
]
DEFAULT_ICON_COLOUR = ICON_COLOURS[0]["hex"]
_COLOUR_HEXES = {option["hex"] for option in ICON_COLOURS}

# The student-view designs the admin can choose from. The key is what the website uses; the name is what the admin sees.
# The first one is the default, so an institute that never chooses keeps the look it already has.
DESIGNS = [
    {"key": "exam", "name": "Exam Mode", "text": "Dark and data-first. Built around mocks and percentiles."},
    {"key": "warm", "name": "Warm Focus", "text": "Light cream and amber. Calm, with a dark card for where you left off."},
    {"key": "mentor", "name": "Friendly Mentor", "text": "Mobile-first. One column, a bottom menu, and a daily plan at hand."},
    {"key": "study", "name": "Study Planner", "text": "Crisp and structured. A weekly timetable and a syllabus map."},
    {"key": "arena", "name": "Arena", "text": "Gamified. XP, leagues, daily challenges and badges."},
    {"key": "studyhub", "name": "Study Hub", "text": "Cream and blue, with rounded tiles. The look of the Study Hub, with points and candies."},
]
DEFAULT_DESIGN = DESIGNS[0]["key"]
_DESIGN_KEYS = {option["key"] for option in DESIGNS}


def defaults() -> dict:
    """What a new institute gets: built features on with their own names, planned features off."""
    return {
        "order": [key for key, *_ in CATALOGUE],
        "items": {key: {"enabled": built, "label": label, "icon": DEFAULT_ICONS.get(key, "list")} for key, _group, label, built in CATALOGUE},
        "headings": dict(HEADING_ICONS),
        "icon_colour": DEFAULT_ICON_COLOUR,
        "design": DEFAULT_DESIGN,
    }


def _saved(tenant: dict) -> dict:
    """The institute's saved choices, merged over the defaults so a new feature added later shows up for everyone."""
    base = defaults()
    saved = tenant.get("features") or {}
    for key, item in (saved.get("items") or {}).items():
        if key in base["items"]:
            base["items"][key] = {**base["items"][key], **item}
    order = [key for key in (saved.get("order") or []) if key in base["items"]]
    base["order"] = order + [key for key in base["order"] if key not in order]
    for name, icon in (saved.get("headings") or {}).items():
        if name in base["headings"] and icon in MENU_ICONS:
            base["headings"][name] = icon
    if saved.get("icon_colour") in _COLOUR_HEXES:
        base["icon_colour"] = saved["icon_colour"]
    if saved.get("design") in _DESIGN_KEYS:
        base["design"] = saved["design"]
    return base


def _label(raw) -> str:
    value = " ".join(str(raw or "").split())
    if not 1 <= len(value) <= MAX_LABEL:
        raise ValidationError(f"A label must be 1 to {MAX_LABEL} characters.")
    return value


def _icon(raw) -> str:
    if raw not in MENU_ICONS:
        raise ValidationError("Choose an icon from the list.")
    return raw


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
        icon = _icon(entry.get("icon", DEFAULT_ICONS.get(key, "list")))
        items[key] = {"enabled": enabled, "label": label, "icon": icon}
        order.append(key)
    return {"order": order, "items": items}


def save(repo, tenant: dict, body: list) -> dict:
    """Save the admin's choices. The features sent come first, in that order; anything not sent keeps its place."""
    current = _saved(tenant)
    sent = clean(body)
    merged_items = {**current["items"], **sent["items"]}
    rest = [key for key in current["order"] if key not in sent["items"]]
    stored = {"order": sent["order"] + rest, "items": merged_items, "headings": current["headings"], "icon_colour": current["icon_colour"], "design": current["design"]}
    repo.update_tenant(tenant["slug"], features=stored)
    return view(repo.get_tenant(tenant["slug"]))


def view(tenant: dict) -> list[dict]:
    """Every feature, for the admin's page, in the institute's order."""
    current = _saved(tenant)
    out = []
    for position, key in enumerate(current["order"]):
        meta = _BY_KEY[key]
        item = current["items"][key]
        out.append({**meta, "label": item["label"], "enabled": item["enabled"], "icon": item["icon"], "position": position})
    return out


def is_on(tenant: dict, key: str) -> bool:
    """Whether the institute shows a built screen to students."""
    return any(item["key"] == key and item["enabled"] for item in public(tenant))


def public(tenant: dict) -> list[dict]:
    """What students and visitors need: the built features, with their labels, in order. Planned features are not shown."""
    return [
        {"key": item["key"], "group": item["group"], "label": item["label"], "enabled": item["enabled"], "icon": item["icon"]}
        for item in view(tenant)
        if item["built"]
    ]


def headings(tenant: dict) -> dict:
    """The icon for each menu heading, as students see them: heading name to icon name."""
    return dict(_saved(tenant)["headings"])


def save_headings(repo, tenant: dict, body) -> dict:
    """Save the admin's icon for one or more menu headings. Headings not sent keep their icon. Returns every heading's icon."""
    if not isinstance(body, dict):
        raise ValidationError("Send the headings as a map of heading to icon.")
    current = _saved(tenant)
    for name, icon in body.items():
        if name not in HEADING_ICONS:
            raise ValidationError(f"Unknown menu heading: {name}.")
        current["headings"][name] = _icon(icon)
    repo.update_tenant(tenant["slug"], features={"order": current["order"], "items": current["items"], "headings": current["headings"], "icon_colour": current["icon_colour"], "design": current["design"]})
    return headings(repo.get_tenant(tenant["slug"]))


def icon_colour(tenant: dict) -> str:
    """The colour of the menu icons, as students see them: a hex colour from ICON_COLOURS."""
    return _saved(tenant)["icon_colour"]


def save_icon_colour(repo, tenant: dict, body) -> str:
    """Save the colour of the menu icons. It must be one of ICON_COLOURS."""
    if not isinstance(body, dict) or not isinstance(body.get("colour"), str):
        raise ValidationError("Send the colour as a hex code from the list.")
    colour = body["colour"].strip().lower()
    if colour not in _COLOUR_HEXES:
        raise ValidationError("Choose a colour from the list.")
    current = _saved(tenant)
    repo.update_tenant(tenant["slug"], features={"order": current["order"], "items": current["items"], "headings": current["headings"], "icon_colour": colour, "design": current["design"]})
    return icon_colour(repo.get_tenant(tenant["slug"]))


def design(tenant: dict) -> str:
    """The student-view design the institute chose: one of DESIGNS' keys."""
    return _saved(tenant)["design"]


def save_design(repo, tenant: dict, body) -> str:
    """Save the student-view design. It must be one of DESIGNS."""
    if not isinstance(body, dict) or not isinstance(body.get("design"), str):
        raise ValidationError("Send the design as one of the choices listed.")
    key = body["design"].strip().lower()
    if key not in _DESIGN_KEYS:
        raise ValidationError("Choose one of the designs listed.")
    current = _saved(tenant)
    repo.update_tenant(tenant["slug"], features={"order": current["order"], "items": current["items"], "headings": current["headings"], "icon_colour": current["icon_colour"], "design": key})
    return design(repo.get_tenant(tenant["slug"]))
