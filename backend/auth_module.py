from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

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
    user = StaffUser(
        email=email,
        full_name=full_name,
        password_hash=hash_password(password),
        role=role,
    )
    db.insert("staff_users", {"email": email, "password_hash": user.password_hash, "full_name": full_name, "role": role, "is_active": True})
    return user


def create_token_for_user(user: StaffUser) -> str:
    payload = {
        "sub": user.email,
        "role": user.role,
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)).timestamp()),
    }
    import base64
    header = base64.urlsafe_b64encode(json.dumps({"alg": settings.jwt_algorithm, "typ": "JWT"}).encode()).rstrip(b"=")
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=")
    signing_input = b".".join([header, body])
    signature = hmac.new(settings.jwt_secret.encode(), signing_input, hashlib.sha256).digest()
    token = signing_input + b"." + base64.urlsafe_b64encode(signature).rstrip(b"=")
    return token.decode()


def decode_token(token: str) -> Dict[str, Any]:
    header, payload, signature = token.split(".")
    expected_signature = base64_url_bytes(hmac.new(settings.jwt_secret.encode(), b".".join([header, payload]), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected_signature):
        raise ValueError("Invalid token signature")
    import base64
    data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
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
    user_rows = db.query("staff_users", email=email)
    if not user_rows:
        raise ValueError("Invalid credentials")
    user = StaffUser(**user_rows[0])
    if not verify_password(password, user.password_hash):
        raise ValueError("Invalid credentials")
    return {"access_token": create_token_for_user(user), "token_type": "bearer", "user": {"email": user.email, "role": user.role}}
