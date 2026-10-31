"""Login page and JWT issuing."""
import hmac
import threading
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from config import (
    ADMIN_ID,
    ADMIN_NAME,
    ADMIN_PASSWORD,
    LOGIN_MAX_FAILURES,
    LOGIN_WINDOW_SECONDS,
)
from database import db
from permissions import ADMIN, Actor, capabilities
from schemas import LoginRequest
from security import check_password, create_token, get_current_actor
from templating import render_template

router = APIRouter()

_failures: dict[str, deque] = defaultdict(deque)
_failures_lock = threading.Lock()


def _throttle_key(request: Request, user_id: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}|{user_id}"


def _assert_not_throttled(key: str) -> None:
    now = time.monotonic()
    with _failures_lock:
        attempts = _failures[key]
        while attempts and now - attempts[0] > LOGIN_WINDOW_SECONDS:
            attempts.popleft()
        if len(attempts) >= LOGIN_MAX_FAILURES:
            raise HTTPException(
                status_code=429,
                detail="Too many failed sign-in attempts. Please wait a few minutes and try again.",
            )


def _record_failure(key: str) -> None:
    with _failures_lock:
        _failures[key].append(time.monotonic())


def _authenticate(user_id: str, password: str):
    if user_id == ADMIN_ID:
        if hmac.compare_digest(password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")):
            return Actor(id=ADMIN_ID, name=ADMIN_NAME, role=ADMIN)
        return None
    user = db.get("users", user_id)
    if not check_password(password, user["password_hash"] if user else None):
        return None
    return Actor(id=user["id"], name=user["name"], role=user["role"], email=user.get("email", ""))


@router.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/login")


@router.get("/login", response_class=HTMLResponse, include_in_schema=False)
def login_page(request: Request):
    return render_template("login.html", request)


@router.post("/api/auth/login")
def login(body: LoginRequest, request: Request):
    user_id = body.user_id.strip().lower()
    key = _throttle_key(request, user_id)
    _assert_not_throttled(key)

    actor = _authenticate(user_id, body.password)
    if actor is None:
        _record_failure(key)
        raise HTTPException(status_code=401, detail="Invalid user ID or password.")

    with _failures_lock:
        _failures.pop(key, None)
    return {
        "access_token": create_token(actor),
        "token_type": "bearer",
        "user": capabilities(actor),
    }


@router.get("/api/auth/me")
def me(actor: Actor = Depends(get_current_actor)):
    return capabilities(actor)

