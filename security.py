"""Security, hashing, and token handling."""
import base64
import hashlib
import hmac
import json
import time
from typing import Optional

from fastapi import Header, HTTPException

from config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET, PASSWORD_SECRET
from permissions import Actor


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_password(password: str) -> str:
    salt = hashlib.sha256(PASSWORD_SECRET.encode()).hexdigest()[:16]
    return hashlib.sha256((salt + password).encode()).hexdigest()


def check_password(password: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    return hmac.compare_digest(hash_password(password), hashed)


def encrypt_password(password: str) -> str:
    key = PASSWORD_SECRET.encode("utf-8")
    data = password.encode("utf-8")
    enc = bytes([b ^ key[i % len(key)] for i, b in enumerate(data)])
    return base64.b64encode(enc).decode("ascii")


def decrypt_password(enc_text: str) -> str:
    key = PASSWORD_SECRET.encode("utf-8")
    data = base64.b64decode(enc_text.encode("ascii"))
    dec = bytes([b ^ key[i % len(key)] for i, b in enumerate(data)])
    return dec.decode("utf-8")


def password_fields(password: str) -> dict:
    return {
        "password_hash": hash_password(password),
        "password_enc": encrypt_password(password),
    }


def create_token(actor: Actor) -> str:
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    payload = {
        "sub": actor.id,
        "name": actor.name,
        "role": actor.role,
        "email": actor.email,
        "exp": int(time.time()) + (JWT_EXPIRE_MINUTES * 60),
    }
    part1 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    part2 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        f"{part1}.{part2}".encode("utf-8"),
        hashlib.sha256
    ).digest()
    part3 = _b64url_encode(signature)
    return f"{part1}.{part2}.{part3}"


def get_current_actor(authorization: Optional[str] = Header(None)) -> Actor:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        part1, part2, part3 = token.split(".")
        expected_sig = hmac.new(
            JWT_SECRET.encode("utf-8"),
            f"{part1}.{part2}".encode("utf-8"),
            hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_b64url_decode(part3), expected_sig):
            raise HTTPException(401, "Token signature invalid.")
        payload = json.loads(_b64url_decode(part2).decode("utf-8"))
        if payload.get("exp", 0) < time.time():
            raise HTTPException(401, "Token expired.")
        return Actor(
            id=payload["sub"],
            name=payload["name"],
            role=payload["role"],
            email=payload.get("email", ""),
        )
    except Exception:
        raise HTTPException(401, "Invalid token.")

