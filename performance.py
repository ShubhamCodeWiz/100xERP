"""Performance dashboard: assigned tasks (completion status + remarks), documents
and promotion history. Executives and the admin assign tasks; the person whose
dashboard it is can only read it."""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse

from config import ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_BYTES, UPLOAD_DIR
from database import db, utcnow_iso
from permissions import (
    DOCUMENT_LABELS,
    Actor,
    can_edit_dashboard,
    can_view_dashboard,
    denial,
    document_type_for,
    takes_description,
)
from schemas import TaskCreate, TaskUpdate
from security import get_current_actor
from templating import templates

router = APIRouter()

_STATUSES = ("pending", "in_progress", "completed")


def _target(user_id: str) -> dict:
    user = db.get("users", user_id.strip().lower())
    if user is None:
        raise HTTPException(404, "User not found.")
    return user


def _summary(tasks: list) -> dict:
    counts = {status: 0 for status in _STATUSES}
    for task in tasks:
        counts[task["status"]] = counts.get(task["status"], 0) + 1
    return {"total": len(tasks), **counts}


def _document_view(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "type": doc["type"],
        "label": DOCUMENT_LABELS.get(doc["type"], "Document"),
        "filename": doc["filename"],
        "size": doc["size"],
        "uploaded_at": doc["uploaded_at"],
        "uploaded_by": doc["uploaded_by"],
        "uploaded_by_name": doc["uploaded_by_name"],
    }


def _payload(target: dict, actor: Actor) -> dict:
    doc_type = document_type_for(target["role"])
    can_edit = can_edit_dashboard(actor, target["role"])
    tasks = sorted(db.get("tasks", target["id"], []), key=lambda t: t["assigned_at"], reverse=True)
    documents = sorted(
        db.get("documents", target["id"], []), key=lambda d: d["uploaded_at"], reverse=True
    )
    promotions = list(reversed(db.get("promotions", target["id"], [])))
    return {
        "user": {
            "id": target["id"],
            "name": target["name"],
            "email": target.get("email", ""),
            "role": target["role"],
            "department": target.get("department", ""),
            "description": target.get("description", "") if takes_description(target["role"]) else "",
            "created_at": target.get("created_at"),
            "created_by_name": target.get("created_by_name"),
            "last_edited_at": target.get("last_edited_at"),
            "last_edited_by_name": target.get("last_edited_by_name"),
        },
        "tasks": tasks,
        "summary": _summary(tasks),
        "documents": [_document_view(d) for d in documents],
        "promotions": promotions,
        "doc_kind": doc_type[0] if doc_type else None,    # what "Generate" produces
        "doc_label": doc_type[1] if doc_type else None,
        "can_edit": can_edit,
        "can_upload": can_edit and doc_type is not None,
    }


def _require_view(actor: Actor, target: dict) -> None:
    if not can_view_dashboard(actor, target):
        raise HTTPException(403, "You can only view your own performance dashboard.")


def _require_edit(actor: Actor, target: dict, action: str) -> None:
    if not can_edit_dashboard(actor, target["role"]):
        raise HTTPException(403, denial(actor, target["role"], action))


@router.get("/performance", response_class=HTMLResponse, include_in_schema=False)
def performance_page(request: Request):
    return templates.TemplateResponse(
        request, "performance.html", {"show_nav": True, "active": "performance"}
    )


@router.get("/api/performance/{user_id}")
def get_dashboard(user_id: str, actor: Actor = Depends(get_current_actor)):
    target = _target(user_id)
    _require_view(actor, target)
    return _payload(target, actor)


# ---------------------------------------------------------------- tasks

@router.post("/api/performance/{user_id}/tasks", status_code=201)
def create_task(user_id: str, body: TaskCreate, actor: Actor = Depends(get_current_actor)):
    target = _target(user_id)
    _require_edit(actor, target, "assign tasks to")
    now = utcnow_iso()
    task = {
        "id": uuid.uuid4().hex,
        "title": body.title,
        "details": body.details,
        "due_date": body.due_date,
        "status": body.status,
        "remarks": body.remarks,
        "assigned_by": actor.id,
        "assigned_by_name": actor.name,
        "assigned_at": now,
        "completed_at": now if body.status == "completed" else None,
        "last_edited_at": None,
        "last_edited_by": None,
        "last_edited_by_name": None,
    }
    with db.lock:
        tasks = db.get("tasks", target["id"], [])
        tasks.append(task)
        db.put("tasks", target["id"], tasks)
    return _payload(target, actor)


@router.put("/api/performance/{user_id}/tasks/{task_id}")
def update_task(
    user_id: str, task_id: str, body: TaskUpdate, actor: Actor = Depends(get_current_actor)
):
    target = _target(user_id)
    _require_edit(actor, target, "update tasks for")
    changes = body.model_dump(exclude_none=True)
    now = utcnow_iso()
    with db.lock:
        tasks = db.get("tasks", target["id"], [])
        task = next((t for t in tasks if t["id"] == task_id), None)
        if task is None:
            raise HTTPException(404, "Task not found.")
        task.update(changes)
        task["completed_at"] = (task.get("completed_at") or now) if task["status"] == "completed" else None
        task["last_edited_at"] = now
        task["last_edited_by"] = actor.id
        task["last_edited_by_name"] = actor.name
        db.put("tasks", target["id"], tasks)
    return _payload(target, actor)


@router.delete("/api/performance/{user_id}/tasks/{task_id}")
def delete_task(user_id: str, task_id: str, actor: Actor = Depends(get_current_actor)):
    target = _target(user_id)
    _require_edit(actor, target, "delete tasks for")
    with db.lock:
        tasks = db.get("tasks", target["id"], [])
        if not any(t["id"] == task_id for t in tasks):
            raise HTTPException(404, "Task not found.")
        db.put("tasks", target["id"], [t for t in tasks if t["id"] != task_id])
    return _payload(target, actor)


# ------------------------------------------------------------ documents
# (uploaded copies of signed documents; generating a letter/certificate lives in documents.py)

@router.post("/api/performance/{user_id}/documents", status_code=201)
def upload_document(
    user_id: str, file: UploadFile = File(...), actor: Actor = Depends(get_current_actor)
):
    target = _target(user_id)
    _require_edit(actor, target, "upload documents for")
    doc_type = document_type_for(target["role"])
    if doc_type is None:
        raise HTTPException(400, "This role has no uploadable document type.")

    original = Path((file.filename or "").replace("\\", "/")).name.strip()
    original = "".join(ch for ch in original if ch.isprintable())[:120]
    if not original:
        raise HTTPException(400, "Please choose a file to upload.")
    extension = Path(original).suffix.lower()
    if extension not in ALLOWED_UPLOAD_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_UPLOAD_EXTENSIONS))
        raise HTTPException(400, f"Unsupported file type. Allowed types: {allowed}.")

    doc_id = uuid.uuid4().hex
    folder = UPLOAD_DIR / target["id"]
    folder.mkdir(parents=True, exist_ok=True)
    stored_name = f"{doc_id}{extension}"
    destination = folder / stored_name

    size = 0
    try:
        with destination.open("wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        413, f"File is too large. The limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
                    )
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "The uploaded file is empty.")
    except BaseException:
        destination.unlink(missing_ok=True)
        raise

    record = {
        "id": doc_id,
        "type": doc_type[0],
        "filename": original,
        "stored_name": stored_name,
        "size": size,
        "uploaded_at": utcnow_iso(),
        "uploaded_by": actor.id,
        "uploaded_by_name": actor.name,
    }
    with db.lock:
        documents = db.get("documents", target["id"], [])
        documents.append(record)
        db.put("documents", target["id"], documents)
    return _document_view(record)


def _find_document(target: dict, doc_id: str) -> dict:
    for doc in db.get("documents", target["id"], []):
        if doc["id"] == doc_id:
            return doc
    raise HTTPException(404, "Document not found.")


@router.get("/api/performance/{user_id}/documents/{doc_id}")
def download_uploaded_document(user_id: str, doc_id: str, actor: Actor = Depends(get_current_actor)):
    target = _target(user_id)
    _require_view(actor, target)
    doc = _find_document(target, doc_id)
    root = UPLOAD_DIR.resolve()
    path = (UPLOAD_DIR / target["id"] / doc["stored_name"]).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(404, "The file is no longer available.")
    return FileResponse(
        path, filename=doc["filename"], headers={"X-Content-Type-Options": "nosniff"}
    )


@router.delete("/api/performance/{user_id}/documents/{doc_id}")
def delete_uploaded_document(user_id: str, doc_id: str, actor: Actor = Depends(get_current_actor)):
    target = _target(user_id)
    _require_edit(actor, target, "delete documents for")
    with db.lock:
        documents = db.get("documents", target["id"], [])
        doc = next((d for d in documents if d["id"] == doc_id), None)
        if doc is None:
            raise HTTPException(404, "Document not found.")
        db.put("documents", target["id"], [d for d in documents if d["id"] != doc_id])
    (UPLOAD_DIR / target["id"] / doc["stored_name"]).unlink(missing_ok=True)
    return {"ok": True}
