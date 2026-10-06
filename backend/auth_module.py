from __future__ import annotations

import hashlib
import hmac
import json
import base64
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from config import settings
from database import db


ROLES = {
    "front_desk": {"name": "Front Desk"},
    "outlet_cashier": {"name": "Outlet Cashier"},
    "housekeeping": {"name": "Housekeeping"},
    "storekeeper": {"name": "Storekeeper"},
    "procurement": {"name": "Procurement"},
    "accountant": {"name": "Accountant"},
    "manager": {"name": "Manager"},
    "admin": {"name": "Administrator"},
}


@dataclass
class StaffUser:
    id: Optional[int] = None
    email: str = ""
    full_name: str = ""
    password_hash: str = ""
    role: str = "front_desk"
    is_active: bool = True


@dataclass
class AuditLog:
    actor_id: Optional[int]
    action: str
    entity_type: str
    entity_id: str
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def hash_password(password: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), b"hotel-backend", 200_000).hex()


def verify_password(password: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password), stored_hash)


def create_staff_user(email: str, password: str, full_name: str, role: str = "front_desk") -> StaffUser:
    email = email.strip().lower()
    if role not in ROLES:
        raise ValueError(f"Unknown staff role: {role}")
    if db.query("staff_users", email=email):
        raise ValueError("A staff account with this email already exists")
    if not email or not password:
        raise ValueError("Email and password are required")
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters long")
    if not full_name or not full_name.strip():
        raise ValueError("Full name is required")
    user = StaffUser(
        email=email,
        full_name=full_name.strip(),
        password_hash=hash_password(password),
        role=role,
    )
    db.insert("staff_users", {"email": email, "password_hash": user.password_hash, "full_name": full_name, "role": role, "is_active": True})
    return user


def create_token_for_user(user: StaffUser) -> str:
    if settings.jwt_algorithm != "HS256":
        raise ValueError("Only HS256 JWT signing is supported")
    payload = {
        "sub": user.email,
        "role": user.role,
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)).timestamp()),
    }
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=")
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=")
    signing_input = b".".join([header, body])
    signature = hmac.new(settings.jwt_secret.encode(), signing_input, hashlib.sha256).digest()
    token = signing_input + b"." + base64.urlsafe_b64encode(signature).rstrip(b"=")
    return token.decode()


def decode_token(token: str) -> Dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Malformed token")
        header_segment, payload_segment, signature = parts
        header = json.loads(base64.urlsafe_b64decode(header_segment + "=" * (-len(header_segment) % 4)))
        if header.get("alg") != "HS256" or header.get("typ") != "JWT":
            raise ValueError("Invalid token header")
        signing_input = f"{header_segment}.{payload_segment}".encode()
        expected_signature = base64_url_bytes(
            hmac.new(settings.jwt_secret.encode(), signing_input, hashlib.sha256).digest()
        )
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError("Invalid token signature")
        data = json.loads(base64.urlsafe_b64decode(payload_segment + "=" * (-len(payload_segment) % 4)))
        if not isinstance(data, dict) or not isinstance(data.get("sub"), str):
            raise ValueError("Invalid token claims")
        if not isinstance(data.get("exp"), int) or data["exp"] <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("Token has expired")
    except (AttributeError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("Malformed token") from error
    except (IndexError,):
        raise ValueError("Malformed token") from None
    return data


def base64_url_bytes(raw: bytes) -> str:
    import base64
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def audit_write(actor_id: Optional[int], action: str, entity_type: str, entity_id: str, before: Optional[Dict[str, Any]] = None, after: Optional[Dict[str, Any]] = None) -> AuditLog:
    log = AuditLog(actor_id=actor_id, action=action, entity_type=entity_type, entity_id=entity_id, before=before, after=after)
    db.insert("audit_logs", {
        "actor_id": actor_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "before_json": before,
        "after_json": after,
        "created_at": log.created_at.isoformat(),
    })
    return log


def login_staff(email: str, password: str) -> Dict[str, Any]:
    user_rows = db.query("staff_users", email=email.strip().lower())
    if not user_rows:
        raise ValueError("Invalid credentials")
    user = StaffUser(**user_rows[0])
    if not user.is_active or not verify_password(password, user.password_hash):
        raise ValueError("Invalid credentials")
    return {
        "access_token": create_token_for_user(user),
        "token_type": "bearer",
        "user": {"email": user.email, "full_name": user.full_name, "role": user.role},
    }
