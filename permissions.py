"""Single source of truth for who may do what.

Routers call these helpers and return the results (capabilities, can_* flags) to
the front end, which never re-implements the rules.
"""
from dataclasses import dataclass

ADMIN = "admin"
EXECUTIVE = "executive"
EMPLOYEE = "employee"
INTERN = "intern"

# Roles stored in the db (the admin is built in).
STAFF_ROLES = (EXECUTIVE, EMPLOYEE, INTERN)
ROLE_LABELS = {ADMIN: "Admin", EXECUTIVE: "Executive", EMPLOYEE: "Employee", INTERN: "Intern"}

_ALL = {EXECUTIVE, EMPLOYEE, INTERN}

# Which roles an actor may create, edit and delete.
# Executives cannot touch other executives. Employees and interns manage nobody.
_MANAGE = {
    ADMIN: _ALL,
    EXECUTIVE: {EMPLOYEE, INTERN},
    EMPLOYEE: set(),
    INTERN: set(),
}

# Which roles show up in the people directory (panel).
_DIRECTORY = {
    ADMIN: _ALL,
    EXECUTIVE: _ALL,
    EMPLOYEE: set(),
    INTERN: set(),
}

# Whose dashboard an actor may open (own dashboard is always allowed).
_DASHBOARD_VIEW = {
    ADMIN: _ALL,
    EXECUTIVE: _ALL,
    EMPLOYEE: set(),
    INTERN: set(),
}

# Whose tasks / documents an actor may assign, update and upload.
_DASHBOARD_EDIT = {
    ADMIN: _ALL,
    EXECUTIVE: {EMPLOYEE, INTERN},
    EMPLOYEE: set(),
    INTERN: set(),
}

# Whose password an actor may view (and change). Executives never see other
# executives' passwords: that would let them sign in as a peer.
_PASSWORD_VIEW = {
    ADMIN: _ALL,
    EXECUTIVE: {EMPLOYEE, INTERN},
    EMPLOYEE: set(),
    INTERN: set(),
}

# Promotion ladder and who may use each step (kept for a future promote button).
PROMOTION_PATH = {INTERN: EMPLOYEE, EMPLOYEE: EXECUTIVE}
_PROMOTE_TO = {
    ADMIN: {EMPLOYEE, EXECUTIVE},     # intern -> employee, employee -> executive
    EXECUTIVE: {EMPLOYEE},            # intern -> employee only
    EMPLOYEE: set(),
    INTERN: set(),
}

# Roles that carry a free-text description.
DESCRIPTION_ROLES = {EXECUTIVE, EMPLOYEE}

# Document generated for a role: (type key, label).
_DOCUMENT_TYPES = {
    EXECUTIVE: ("experience_letter", "Experience letter"),
    EMPLOYEE: ("experience_letter", "Experience letter"),
    INTERN: ("internship_certificate", "Internship certificate"),
}
DOCUMENT_LABELS = dict(_DOCUMENT_TYPES.values())


@dataclass(frozen=True)
class Actor:
    id: str
    name: str
    role: str
    email: str = ""


def creatable_roles(actor: Actor) -> list[str]:
    return [r for r in STAFF_ROLES if r in _MANAGE[actor.role]]


def viewable_roles(actor: Actor) -> list[str]:
    return [r for r in STAFF_ROLES if r in _DIRECTORY[actor.role]]


def can_manage_role(actor: Actor, role: str) -> bool:
    return role in _MANAGE[actor.role]


def can_view_directory(actor: Actor) -> bool:
    return bool(_DIRECTORY[actor.role])


def can_view_dashboard(actor: Actor, target: dict) -> bool:
    return actor.id == target["id"] or target["role"] in _DASHBOARD_VIEW[actor.role]


def can_edit_dashboard(actor: Actor, target_role: str) -> bool:
    return target_role in _DASHBOARD_EDIT[actor.role]


def can_view_password(actor: Actor, target_role: str) -> bool:
    return target_role in _PASSWORD_VIEW[actor.role]


def can_change_role(actor: Actor) -> bool:
    """Only the built-in admin may change a person's role."""
    return actor.role == ADMIN


def takes_description(role: str) -> bool:
    return role in DESCRIPTION_ROLES


def next_role(role: str):
    """Role a user would be promoted to, or None at the top of the ladder."""
    return PROMOTION_PATH.get(role)


def can_promote(actor: Actor, role: str) -> bool:
    target = PROMOTION_PATH.get(role)
    return target is not None and target in _PROMOTE_TO[actor.role]


def document_type_for(role: str):
    return _DOCUMENT_TYPES.get(role)


def denial(actor: Actor, target_role: str, action: str) -> str:
    """Human-readable reason shown in the error overlay."""
    if actor.role == EXECUTIVE and target_role == EXECUTIVE:
        return "Executives cannot modify other executives."
    return f"{ROLE_LABELS[actor.role]}s cannot {action} {ROLE_LABELS[target_role].lower()} accounts."


def promotion_denial(actor: Actor, role: str) -> str:
    target = PROMOTION_PATH.get(role)
    if target is None:
        return f"{ROLE_LABELS[role]}s cannot be promoted any further."
    return (
        f"{ROLE_LABELS[actor.role]}s cannot promote {ROLE_LABELS[role].lower()}s "
        f"to {ROLE_LABELS[target].lower()}."
    )


def capabilities(actor: Actor) -> dict:
    return {
        "id": actor.id,
        "name": actor.name,
        "role": actor.role,
        "email": actor.email,
        "can_view_directory": can_view_directory(actor),
        "viewable_roles": viewable_roles(actor),
        "creatable_roles": creatable_roles(actor),
    }
