"""Study Hub wallet: the wizard, its points and candies, the candy shop and the board.

A wizard is made once, with a name, and gets a six-letter code. The code brings the wizard back on any
device. Points, candies and the streak live on the wizard. Each answered question is remembered, so a
question is only paid for once. The board lists wizards in this institute, by points.

Stored in the institute's own table:
  T#<slug>#WIZ#<CODE> / PROFILE   the wizard (name, points, candies, streak, shop items owned and worn)
  T#<slug>#WIZ#<CODE> / WM#<id>   one Wren & Martin question answered (done, wrong tries)
The board uses the GSI1 index: GSI1PK = T#<slug>#WIZBOARD, GSI1SK = zero-padded points, then the code.
"""
import random

from boto3.dynamodb.conditions import Key

from app import study_hub_game as game
from app import study_hub_shop as shop
from app import study_hub_wm as wren_martin
from app.repo import _plain, _put_new, now_iso

# No 0/O or 1/I/L, so codes are easy to read aloud and hard to mistype.
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class WizardNotFound(Exception):
    pass


class WizardError(Exception):
    """A shop or wear step that can't happen. The status and message go straight to the page."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _wizard_key(scoped, code: str) -> dict:
    return {"PK": f"T#{scoped.slug}#WIZ#{code}", "SK": "PROFILE"}


def _answer_key(scoped, code: str, question_id: str) -> dict:
    return {"PK": f"T#{scoped.slug}#WIZ#{code}", "SK": f"WM#{question_id}"}


def _save(scoped, wizard: dict) -> None:
    """Write the wizard and keep its board position (GSI1) up to date."""
    code = wizard["code"]
    item = {
        **wizard,
        **_wizard_key(scoped, code),
        "type": "WIZARD",
        "GSI1PK": f"T#{scoped.slug}#WIZBOARD",
        "GSI1SK": f"{int(wizard.get('points', 0)):010d}#{code}",
    }
    scoped.table.put_item(Item=item)


def _new_code(scoped) -> str:
    """A code no wizard in this institute has. Tries a few times, then gives up."""
    for _ in range(20):
        code = "".join(random.choice(CODE_ALPHABET) for _ in range(6))
        if scoped.table.get_item(Key=_wizard_key(scoped, code)).get("Item") is None:
            return code
    raise RuntimeError("Could not create a wizard code")


def create(scoped, name: str) -> dict:
    code = _new_code(scoped)
    wizard = {
        "code": code, "name": name, "points": 0, "candies": 0, "streak": 0,
        "owned": [], "equipped": {}, "created_at": now_iso(),
    }
    _put_new(scoped.table, {**wizard, **_wizard_key(scoped, code), "type": "WIZARD",
                            "GSI1PK": f"T#{scoped.slug}#WIZBOARD", "GSI1SK": f"{0:010d}#{code}"})
    return wizard


def load(scoped, code: str) -> dict:
    item = _plain(scoped.table.get_item(Key=_wizard_key(scoped, code.upper())).get("Item"))
    if item is None:
        raise WizardNotFound()
    return item


def view(wizard: dict) -> dict:
    """What the page needs to show a wizard. Nothing internal."""
    return {
        "code": wizard["code"], "name": wizard["name"], "points": int(wizard.get("points", 0)),
        "candies": int(wizard.get("candies", 0)), "streak": int(wizard.get("streak", 0)),
        "owned": list(wizard.get("owned", [])), "equipped": dict(wizard.get("equipped", {})),
    }


def answered(scoped, code: str) -> dict:
    """Question id -> the stored state, for every Wren & Martin question this wizard has answered."""
    resp = scoped.table.query(
        KeyConditionExpression=Key("PK").eq(f"T#{scoped.slug}#WIZ#{code}") & Key("SK").begins_with("WM#")
    )
    return {item["SK"][3:]: _plain(item) for item in resp.get("Items", [])}


def chapter_questions(scoped, code: str, chapter: int) -> list[dict]:
    """A chapter's questions for this wizard, each marked done when it has been answered right."""
    done = answered(scoped, code)
    out = []
    for q in wren_martin.questions(chapter):
        state = done.get(q["id"]) or {}
        out.append({**q, "done": bool(state.get("done"))})
    return out


def progress(scoped, code: str) -> dict:
    """How many questions are done in each chapter, as {chapter: count}."""
    counts: dict[str, int] = {}
    for qid, state in answered(scoped, code).items():
        if state.get("done"):
            chapter = str(state.get("chapter"))
            counts[chapter] = counts.get(chapter, 0) + 1
    return {"done": counts}


def answer(scoped, wizard: dict, chapter: int, question_id: str, choice: int) -> dict | None:
    """Mark one Wren & Martin answer. Right answers pay points and candies once; a wrong try resets the streak.
    Returns None when the question is unknown."""
    question = wren_martin.question_with_answer(chapter, question_id)
    if question is None:
        return None
    code = wizard["code"]
    state_key = _answer_key(scoped, code, question_id)
    state = _plain(scoped.table.get_item(Key=state_key).get("Item")) or {
        **state_key, "done": False, "wrong": 0, "chapter": chapter,
    }

    if state["done"]:
        return {"correct": True, "already_answered": True, "points_awarded": 0, "candies_awarded": 0,
                "explanation": question["explanation"], **_totals(wizard)}

    if choice == question["correct"]:
        first_try = state["wrong"] == 0
        points, candies, streak = game.score_answer(first_try, int(wizard.get("streak", 0)))
        state["done"] = True
        scoped.table.put_item(Item=state)
        wizard["points"] = int(wizard.get("points", 0)) + points
        wizard["candies"] = int(wizard.get("candies", 0)) + candies
        wizard["streak"] = streak
        _save(scoped, wizard)
        return {"correct": True, "already_answered": False, "points_awarded": points, "candies_awarded": candies,
                "first_try": first_try, "explanation": question["explanation"], **_totals(wizard)}

    state["wrong"] = int(state.get("wrong", 0)) + 1
    scoped.table.put_item(Item=state)
    wizard["streak"] = 0
    _save(scoped, wizard)
    return {"correct": False, "already_answered": False, "points_awarded": 0, "candies_awarded": 0,
            "explanation": question["reasons"][choice], **_totals(wizard)}


def _totals(wizard: dict) -> dict:
    return {"points": int(wizard.get("points", 0)), "candies": int(wizard.get("candies", 0)),
            "streak": int(wizard.get("streak", 0))}


def buy(scoped, wizard: dict, item_id: str) -> None:
    """Buy a shop item with candies. Raises WizardError when it can't be bought."""
    item = shop.find(item_id)
    if item is None:
        raise WizardError(404, "Unknown item")
    owned = list(wizard.get("owned", []))
    if item["id"] in owned:
        raise WizardError(409, "You already own this")
    if int(wizard.get("candies", 0)) < item["price"]:
        raise WizardError(400, "Not enough candies yet. Keep answering!")
    wizard["candies"] = int(wizard.get("candies", 0)) - item["price"]
    owned.append(item["id"])
    wizard["owned"] = owned
    _save(scoped, wizard)


def wear(scoped, wizard: dict, item_id: str) -> None:
    """Wear an owned item (one per slot). Raises WizardError when the item isn't owned."""
    item = shop.find(item_id)
    if item is None or item["id"] not in wizard.get("owned", []):
        raise WizardError(403, "Buy this item first")
    equipped = dict(wizard.get("equipped", {}))
    equipped[item["slot"]] = item["id"]
    wizard["equipped"] = equipped
    _save(scoped, wizard)


def board(scoped, limit: int) -> list[dict]:
    """The institute's board: names and points, highest first."""
    resp = scoped.table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq(f"T#{scoped.slug}#WIZBOARD"),
        ScanIndexForward=False,
        Limit=limit,
    )
    return [{"name": r["name"], "points": int(r.get("points", 0))} for r in (_plain(i) for i in resp.get("Items", []))]
