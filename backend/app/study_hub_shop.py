"""Candy shop: wizard items bought with candies and worn on the avatar.

Slots: hat, wand and pet. A player can own any items and wear one per slot.
Prices are in candies, which kids earn one per correct answer.
"""

SLOTS = ("hat", "wand", "pet")

CATALOG = [
    {"id": "hat-cap", "slot": "hat", "name": "Cosy Cap", "emoji": "🧢", "price": 10},
    {"id": "hat-grad", "slot": "hat", "name": "Graduation Cap", "emoji": "🎓", "price": 25},
    {"id": "hat-top", "slot": "hat", "name": "Top Hat", "emoji": "🎩", "price": 40},
    {"id": "hat-crown", "slot": "hat", "name": "Golden Crown", "emoji": "👑", "price": 80},
    {"id": "wand-sparkle", "slot": "wand", "name": "Sparkle Wand", "emoji": "✨", "price": 15},
    {"id": "wand-magic", "slot": "wand", "name": "Magic Wand", "emoji": "🪄", "price": 35},
    {"id": "wand-crystal", "slot": "wand", "name": "Crystal Ball", "emoji": "🔮", "price": 60},
    {"id": "pet-owl", "slot": "pet", "name": "Wise Owl", "emoji": "🦉", "price": 30},
    {"id": "pet-cat", "slot": "pet", "name": "Spell Cat", "emoji": "🐱", "price": 30},
    {"id": "pet-dragon", "slot": "pet", "name": "Baby Dragon", "emoji": "🐉", "price": 100},
]

BY_ID = {item["id"]: item for item in CATALOG}


def find(item_id):
    return BY_ID.get(item_id)
