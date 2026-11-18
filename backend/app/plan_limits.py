"""What a plan allows. A free institute can have one student and one parent; paid institutes have no limit here."""
FREE_PLAN = "free"
FREE_LIMITS = {"student": 1, "parent": 1}


class PlanLimit(Exception):
    """The institute's plan doesn't allow this. 'message' is safe to show."""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def is_free(tenant: dict) -> bool:
    return tenant.get("plan") == FREE_PLAN


def check(scoped, tenant: dict, role: str, adding: int = 1) -> None:
    """Raise PlanLimit when adding this many people of this role would pass a free institute's limit."""
    if not is_free(tenant) or adding <= 0:
        return
    limit = FREE_LIMITS[role]
    have = sum(1 for m in scoped.all_members_by_status("approved") if m.get("role") == role)
    if have + adding > limit:
        word = "student" if role == "student" else "parent"
        raise PlanLimit(f"The Free plan includes {limit} {word}. Upgrade to add more.")
