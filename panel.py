"""Panel page and the people (users) API: create, edit (admin: role too), delete, view password."""
import shutil

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse

from config import UPLOAD_DIR
from database import db, utcnow_iso
from permissions import (
    STAFF_ROLES,
    Actor,
    can_change_role,
    can_manage_role,
    can_view_dashboard,
    can_view_directory,
    can_view_password,
    denial,
    takes_description,
    viewable_roles,
)
from schemas import UserCreate, UserUpdate
from security import decrypt_password, get_current_actor, password_fields
from templating import templates

router = APIRouter()


def _stamp_edit(user: dict, actor: Actor, now: str) -> None:
    user["last_edited_at"] = now
    user["last_edited_by"] = actor.id
    user["last_edited_by_name"] = actor.name


def _public(user: dict, actor: Actor) -> dict:
    """User record as the front end sees it. Never includes any password data."""
    role = user["role"]
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user.get("email", ""),
        "role": role,
        "department": user.get("department", ""),
        "description": user.get("description", ""),
        "created_at": user.get("created_at"),
        "created_by": user.get("created_by"),
        "created_by_name": user.get("created_by_name"),
        "last_edited_at": user.get("last_edited_at"),
        "last_edited_by": user.get("last_edited_by"),
        "last_edited_by_name": user.get("last_edited_by_name"),
        "can_edit": can_manage_role(actor, role),
        "can_view_password": can_view_password(actor, role),
        "can_view_dashboard": can_view_dashboard(actor, user),
        "can_change_role": can_change_role(actor),
    }


@router.get("/panel", response_class=HTMLResponse, include_in_schema=False)
def panel_page(request: Request):
    return templates.TemplateResponse(request, "panel.html", {"show_nav": True, "active": "panel"})


@router.get("/api/users")
def list_users(q: str = "", role: str = "", actor: Actor = Depends(get_current_actor)):
    if not can_view_directory(actor):
        raise HTTPException(403, "You do not have access to the people directory.")
    allowed = set(viewable_roles(actor))
    needle = q.strip().lower()
    matches = []
    for user in db.all("users").values():
        if user["role"] not in allowed or (role and user["role"] != role):
            continue
        haystack = " ".join(
            [user["id"], user["name"], user.get("email", ""), user.get("department", "")]
        ).lower()
        if needle and needle not in haystack:
            continue
        matches.append(user)
    matches.sort(key=lambda u: (STAFF_ROLES.index(u["role"]), u["name"].lower()))
    return [_public(u, actor) for u in matches]


@router.post("/api/users", status_code=201)
def create_user(body: UserCreate, actor: Actor = Depends(get_current_actor)):
    if not can_manage_role(actor, body.role):
        raise HTTPException(403, denial(actor, body.role, "create"))
    record = {
        "id": body.user_id,
        "name": body.name,
        "email": body.email,
        "role": body.role,
        "department": body.department,
        "description": body.description if takes_description(body.role) else "",
        **password_fields(body.password),
        "created_at": utcnow_iso(),
        "created_by": actor.id,
        "created_by_name": actor.name,
        "last_edited_at": None,
        "last_edited_by": None,
        "last_edited_by_name": None,
    }
    with db.lock:
        if db.get("users", body.user_id) is not None:
            raise HTTPException(409, f"User ID '{body.user_id}' is already taken.")
        db.put("users", body.user_id, record)
    return _public(record, actor)


@router.put("/api/users/{user_id}")
def update_user(user_id: str, body: UserUpdate, actor: Actor = Depends(get_current_actor)):
    user_id = user_id.strip().lower()
    changes = body.model_dump(exclude_none=True)
    password = changes.pop("password", None)
    new_password_fields = password_fields(password) if password else None

    with db.lock:
        user = db.get("users", user_id)
        if user is None:
            raise HTTPException(404, "User not found.")
        if not can_manage_role(actor, user["role"]):
            raise HTTPException(403, denial(actor, user["role"], "edit"))

        old_role = user["role"]
        new_role = changes.get("role")
        role_changed = bool(new_role) and new_role != old_role
        if role_changed and not can_change_role(actor):
            raise HTTPException(403, "Only the admin can change roles.")

        if not takes_description(new_role or old_role):
            changes.pop("description", None)   # interns have none; stored text is kept
        user.update(changes)
        if new_password_fields:
            user.update(new_password_fields)
        now = utcnow_iso()
        _stamp_edit(user, actor, now)
        db.put("users", user_id, user)

        if role_changed:   # keep a record of who changed the role, shown on the dashboard
            history = db.get("promotions", user_id, [])
            history.append({
                "from_role": old_role,
                "to_role": new_role,
                "promoted_by": actor.id,
                "promoted_by_name": actor.name,
                "promoted_at": now,
            })
            db.put("promotions", user_id, history)
    return _public(user, actor)


@router.get("/api/users/{user_id}/password")
def reveal_password(user_id: str, actor: Actor = Depends(get_current_actor)):
    user = db.get("users", user_id.strip().lower())
    if user is None:
        raise HTTPException(404, "User not found.")
    if not can_view_password(actor, user["role"]):
        raise HTTPException(403, denial(actor, user["role"], "view the password of"))
    plain = decrypt_password(user["password_enc"]) if user.get("password_enc") else None
    if plain is None:
        raise HTTPException(
            409, "This account's password cannot be shown. Set a new password to enable it."
        )
    return {"password": plain}


@router.delete("/api/users/{user_id}")
def delete_user(user_id: str, actor: Actor = Depends(get_current_actor)):
    user_id = user_id.strip().lower()
    with db.lock:
        user = db.get("users", user_id)
        if user is None:
            raise HTTPException(404, "User not found.")
        if not can_manage_role(actor, user["role"]):
            raise HTTPException(403, denial(actor, user["role"], "delete"))
        for collection in ("users", "tasks", "documents", "promotions"):
            db.remove(collection, user_id)
    # The user exists, so its id already passed the create-time pattern: safe as a folder name.
    shutil.rmtree(UPLOAD_DIR / user_id, ignore_errors=True)
    return {"ok": True}
