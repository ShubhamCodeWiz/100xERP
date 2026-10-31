"""Experience letter (executives, employees) and internship certificate (interns).

The server supplies the facts: time served, every task assigned to the person and a QR
code pointing at the public verify page. The LaTeX is written and compiled by the browser
(static/js/doc-latex.js, doc-compile.js, doc-pdf.js). The one thing the server does is
relay the browser's source to the public compilers when the browser cannot reach them
itself (/api/latex/compile); it never runs TeX and stores nothing."""
import hashlib
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from config import (
    COMPANY_ADDRESS,
    COMPANY_NAME,
    HR_EMAIL,
    PUBLIC_BASE_URL,
    SIGNATORY_NAME,
    SIGNATORY_TITLE,
)
from database import db
from latexrelay import LatexError, compile_remote
from performance import _require_view, _target
from permissions import ROLE_LABELS, Actor, document_type_for, takes_description
from qr import make_qr
from security import get_current_actor
from templating import templates
from tenure import completion, fmt_date, parse_date, span_text

router = APIRouter()

MAX_LISTED_TASKS = 40   # assigned duties/projects printed on the letter; the rest are counted


def _code(user_id: str) -> str:
    """Short verification code derived from the user id (used in the ref and the QR link)."""
    return hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:10].upper()


def _reference(target: dict, kind: str) -> str:
    start = parse_date(target.get("created_at"))
    prefix = "INT" if kind == "internship_certificate" else "EXP"
    return f"100X/{prefix}/{start.year}/{_code(target['id'])}"


def _designation(target: dict) -> str:
    role, department = target["role"], target.get("department", "")
    if department and role == "intern":
        return f"{department} {ROLE_LABELS[role]}"
    return ROLE_LABELS[role]


def _base_url(request: Request) -> str:
    return PUBLIC_BASE_URL or str(request.base_url).rstrip("/")


def _assigned_tasks(tasks: list) -> list:
    """Every duty / project assigned to the person, oldest first, whatever its status."""
    ordered = sorted(tasks, key=lambda t: t.get("assigned_at") or "")
    return [{"title": t["title"], "assigned_on": fmt_date(parse_date(t.get("assigned_at")))} for t in ordered]


def _document_data(target: dict, kind: str, request: Request) -> dict:
    today = date.today()
    start = parse_date(target.get("created_at"))
    role = target["role"]
    tasks = db.get("tasks", target["id"], [])
    assigned = _assigned_tasks(tasks)
    verify_url = f"{_base_url(request)}/verify/{_code(target['id'])}"
    try:
        qr = make_qr(verify_url)
    except ValueError:      # address too long for the built-in generator: skip the QR code
        qr = []
    return {
        "kind": kind,
        "name": target["name"],
        "role": role,
        "department": target.get("department", ""),
        "designation": _designation(target),
        "description": target.get("description", "") if takes_description(role) else "",
        "start": fmt_date(start),
        "end": fmt_date(today),
        "span": span_text(start, today),
        "issued_on": fmt_date(today),
        "ref": _reference(target, kind),
        "verify_url": verify_url,
        "qr": qr,
        **completion(tasks),
        "assigned_tasks": assigned[:MAX_LISTED_TASKS],
        "assigned_more": max(0, len(assigned) - MAX_LISTED_TASKS),
        "company_name": COMPANY_NAME,
        "company_address": COMPANY_ADDRESS,
        "signatory_name": SIGNATORY_NAME,
        "signatory_title": SIGNATORY_TITLE,
        "hr_email": HR_EMAIL,
    }


@router.get("/document", response_class=HTMLResponse, include_in_schema=False)
def document_page(request: Request):
    return templates.TemplateResponse(
        request, "document.html", {"show_nav": True, "active": "performance"}
    )


@router.get("/api/performance/{user_id}/document-data")
def document_data(user_id: str, request: Request, actor: Actor = Depends(get_current_actor)):
    target = _target(user_id)
    _require_view(actor, target)
    doc_type = document_type_for(target["role"])
    if doc_type is None:
        raise HTTPException(400, "This role has no document.")
    return _document_data(target, doc_type[0], request)


@router.get("/verify/{code}", response_class=HTMLResponse, include_in_schema=False)
def verify_page(code: str, request: Request):
    """Public page the QR code opens. Shows only name, designation and start date."""
    code = code.strip().upper()
    found = None
    for user in db.all("users").values():
        doc_type = document_type_for(user["role"])
        if doc_type and _code(user["id"]) == code:
            found = (user, doc_type[0])
            break
    if found is None:
        return templates.TemplateResponse(
            request, "verify.html", {"doc": None, "cert_label": code[:20]}, status_code=404
        )
    user, kind = found
    start = parse_date(user.get("created_at"))
    today = date.today()
    doc = {
        "type": kind,
        "name": user["name"],
        "designation": _designation(user),
        "start": fmt_date(start),
        "span": span_text(start, today),
        "checked_on": fmt_date(today),
    }
    return templates.TemplateResponse(
        request, "verify.html", {"doc": doc, "cert_label": _reference(user, kind)}
    )


class CompileRequest(BaseModel):
    tex: str = Field(min_length=20, max_length=150_000)


@router.post("/api/latex/compile")
def compile_latex(body: CompileRequest, actor: Actor = Depends(get_current_actor)):
    """Fallback for the browser: forward LaTeX source to the public compilers, return the PDF."""
    if not body.tex.lstrip().startswith("\\documentclass"):
        raise HTTPException(400, "This is not a LaTeX document.")
    try:
        pdf = compile_remote(body.tex)
    except LatexError as err:
        raise HTTPException(502, str(err))
    return Response(pdf, media_type="application/pdf")
