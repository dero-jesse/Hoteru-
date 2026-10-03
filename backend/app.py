from __future__ import annotations

import os
from typing import Any, Dict, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth_module import create_staff_user, login_staff
from database import db
from finance_module import build_default_ledger
from procurement_module import ProcurementService
from rooms_module import FrontDeskService, ReservationService

app = FastAPI(title="Hotel Management System", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
if os.getenv("APP_ENV", "development") == "development" and not db.query("staff_users", email="admin@hotel.local"):
    create_staff_user("admin@hotel.local", "ChangeMe!123", "Hotel Administrator", "admin")
ledger = build_default_ledger()
reservation_service = ReservationService()
frontdesk = FrontDeskService(ledger)
procurement = ProcurementService(ledger)


class LoginRequest(BaseModel):
    email: str
    password: str


class ReservationRequest(BaseModel):
    guest_name: str
    room_code: str
    check_in: str
    check_out: str
    rate_minor: int


class CheckInRequest(BaseModel):
    guest_name: str
    room_code: str


class OutletSaleRequest(BaseModel):
    outlet: str
    total_minor: int
    cost_minor: int
    room_code: str | None = None
    paid_directly: bool = False


class PostingRequest(BaseModel):
    event_type: str
    amount_minor: int
    currency: str = "KES"
    created_by: str = "system"
    memo: str | None = None
    aggregate: str = "generic"
    aggregate_id: str = "generic"


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "hotel-management-backend"}


@app.post("/auth/login")
def login(payload: LoginRequest) -> Dict[str, Any]:
    return login_staff(payload.email, payload.password)


@app.post("/reservations")
def create_reservation(payload: ReservationRequest) -> Dict[str, Any]:
    res = reservation_service.create_reservation(payload.guest_name, payload.room_code, payload.check_in, payload.check_out, payload.rate_minor)
    return {"status": "created", "reservation": res.__dict__}


@app.post("/front-desk/checkin")
def check_in(payload: CheckInRequest) -> Dict[str, Any]:
    room = frontdesk.create_room(payload.room_code, "deluxe", 15000)
    folio = frontdesk.check_in(payload.guest_name, payload.room_code)
    return {"status": "checked_in", "room": room.__dict__, "folio": folio.__dict__}


@app.post("/front-desk/checkout")
def checkout(payload: CheckInRequest) -> Dict[str, Any]:
    settlement = frontdesk.checkout(payload.guest_name, payload.room_code, cash_paid_minor=10000, deposit_release_minor=5000)
    return settlement


@app.post("/ledger/posting-engine")
def post_event(payload: PostingRequest) -> Dict[str, Any]:
    entry = ledger.post_event(payload.event_type, payload.model_dump(exclude_none=True))
    return {"status": "posted", "entry": {"idempotency_key": entry.idempotency_key, "debit_total": entry.debit_total, "credit_total": entry.credit_total, "lines": [line.__dict__ for line in entry.lines]}}


@app.get("/reports/trial-balance")
def trial_balance() -> Dict[str, Any]:
    return {"trial_balance": ledger.trial_balance(), "balance_sheet": ledger.balance_sheet()}


@app.get("/reports/statement")
def statement() -> Dict[str, Any]:
    return {"income_statement": ledger.income_statement()}


@app.post("/procurement/po/approve")
def approve_po(po_number: str, requester: str, approver: str) -> Dict[str, Any]:
    order = procurement.approve_po(po_number, requester, approver)
    return {"status": "approved", "purchase_order": order.__dict__}
