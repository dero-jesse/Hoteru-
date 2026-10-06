from __future__ import annotations

import os
from datetime import date
from zoneinfo import ZoneInfo
from typing import Any, Dict

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse

from assets_module import AssetService
from auth_module import ROLES, StaffUser, create_staff_user, decode_token, login_staff
from config import settings
from database import db
from finance_module import NightAuditService, build_default_ledger
from hr_module import PayrollService
from inventory_module import InventoryService
from outlets_module import OutletService
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


@app.exception_handler(ValueError)
async def handle_invalid_operation(_request: Request, error: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(error)})


@app.exception_handler(KeyError)
async def handle_missing_record(_request: Request, error: KeyError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(error)})


if os.getenv("APP_ENV", "development") == "development" and not db.query("staff_users", email="admin@hotel.local"):
    create_staff_user("admin@hotel.local", "ChangeMe!123", "Hotel Administrator", "admin")
ledger = build_default_ledger()
reservation_service = ReservationService()
frontdesk = FrontDeskService(ledger)
procurement = ProcurementService(ledger)
inventory = InventoryService(ledger)
payroll = PayrollService(ledger)
assets = AssetService(ledger)
outlets = OutletService(ledger)
night_audit = NightAuditService(ledger)


class LoginRequest(BaseModel):
    email: str
    password: str


class CreateStaffRequest(BaseModel):
    email: str
    password: str = Field(min_length=12)
    full_name: str
    role: str


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
    currency: str = settings.currency
    created_by: str = "system"
    memo: str | None = None
    aggregate: str = "generic"
    aggregate_id: str = "generic"


class PurchaseOrderRequest(BaseModel):
    po_number: str
    supplier_name: str
    total_minor: int = Field(gt=0)


class GoodsReceiptRequest(BaseModel):
    po_number: str
    quantity: int = Field(gt=0)
    unit_cost_minor: int = Field(gt=0)


class InvoiceRequest(BaseModel):
    invoice_number: str
    supplier_name: str
    total_minor: int = Field(gt=0)


class InventoryItemRequest(BaseModel):
    sku: str
    name: str
    unit_cost_minor: int = Field(gt=0)
    store_code: str = "main"


class StockMovementRequest(BaseModel):
    sku: str
    quantity: int = Field(gt=0)


class PayrollRequest(BaseModel):
    period: str
    total_minor: int = Field(gt=0)


class AssetRequest(BaseModel):
    asset_code: str
    name: str
    cost_minor: int = Field(gt=0)
    useful_life_months: int = Field(gt=0)


class DepreciationRequest(BaseModel):
    amount_minor: int = Field(gt=0)


class OutletSaleRequest(BaseModel):
    outlet: str
    total_minor: int = Field(gt=0)
    cost_minor: int = Field(ge=0)
    room_code: str | None = None
    paid_directly: bool = False


class NightAuditChargeRequest(BaseModel):
    room_code: str
    guest_name: str
    charge_minor: int = Field(gt=0)


class ReconciliationRequest(BaseModel):
    till_cash_minor: int = Field(ge=0)
    folio_total_minor: int = Field(ge=0)


bearer_scheme = HTTPBearer(auto_error=False)
MANAGER_ROLES = ("manager", "admin")
FRONT_DESK_ROLES = ("front_desk", "manager", "admin")
FINANCE_ROLES = ("accountant", "manager", "admin")
PROCUREMENT_READ_ROLES = ("procurement", "accountant", "manager", "admin")
STOCK_ROLES = ("storekeeper", "manager", "admin")
NIGHT_AUDIT_ROLES = ("front_desk", "accountant", "manager", "admin")


def require_roles(*allowed_roles: str):
    def authorize(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    ) -> StaffUser:
        unauthorized = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
        if credentials is None:
            raise unauthorized
        try:
            claims = decode_token(credentials.credentials)
        except ValueError:
            raise unauthorized from None

        email = claims.get("sub")
        users = db.query("staff_users", email=email) if isinstance(email, str) else []
        if not users:
            raise unauthorized
        user = StaffUser(**users[0])
        if not user.is_active or claims.get("role") != user.role:
            raise unauthorized
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your staff role does not permit this action",
            )
        return user

    return authorize


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "hotel-management-backend"}


@app.post("/auth/login")
def login(payload: LoginRequest) -> Dict[str, Any]:
    try:
        return login_staff(payload.email, payload.password)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials") from None


@app.get("/auth/me")
def current_staff(user: StaffUser = Depends(require_roles(*ROLES.keys()))) -> Dict[str, Any]:
    return {"email": user.email, "full_name": user.full_name, "role": user.role}


@app.post("/auth/staff", dependencies=[Depends(require_roles("admin"))])
def create_staff(payload: CreateStaffRequest) -> Dict[str, Any]:
    if payload.role not in ROLES:
        raise HTTPException(status_code=422, detail=f"Unknown staff role: {payload.role}")
    user = create_staff_user(payload.email, payload.password, payload.full_name, payload.role)
    return {"staff": {"email": user.email, "full_name": user.full_name, "role": user.role}}


@app.post("/reservations", dependencies=[Depends(require_roles(*FRONT_DESK_ROLES))])
def create_reservation(payload: ReservationRequest) -> Dict[str, Any]:
    res = reservation_service.create_reservation(payload.guest_name, payload.room_code, payload.check_in, payload.check_out, payload.rate_minor)
    return {"status": "created", "reservation": res.__dict__}


@app.post("/front-desk/checkin", dependencies=[Depends(require_roles(*FRONT_DESK_ROLES))])
def check_in(payload: CheckInRequest) -> Dict[str, Any]:
    room = frontdesk.create_room(payload.room_code, "deluxe", 15000)
    folio = frontdesk.check_in(payload.guest_name, payload.room_code)
    return {"status": "checked_in", "room": room.__dict__, "folio": folio.__dict__}


@app.post("/front-desk/checkout", dependencies=[Depends(require_roles(*FRONT_DESK_ROLES))])
def checkout(payload: CheckInRequest) -> Dict[str, Any]:
    settlement = frontdesk.checkout(payload.guest_name, payload.room_code, cash_paid_minor=10000, deposit_release_minor=5000)
    return settlement


@app.post("/ledger/posting-engine", dependencies=[Depends(require_roles(*FINANCE_ROLES))])
def post_event(payload: PostingRequest) -> Dict[str, Any]:
    entry = ledger.post_event(payload.event_type, payload.model_dump(exclude_none=True))
    return {"status": "posted", "entry": {"idempotency_key": entry.idempotency_key, "debit_total": entry.debit_total, "credit_total": entry.credit_total, "lines": [line.__dict__ for line in entry.lines]}}


@app.get("/reports/trial-balance", dependencies=[Depends(require_roles(*FINANCE_ROLES))])
def trial_balance(start_date: date | None = None, end_date: date | None = None) -> Dict[str, Any]:
    entries = report_entries(start_date, end_date)
    totals = account_totals(entries)
    return {"trial_balance": totals, "balance_sheet": report_balance_sheet(totals)}


@app.get("/reports/statement", dependencies=[Depends(require_roles(*FINANCE_ROLES))])
def statement(start_date: date | None = None, end_date: date | None = None) -> Dict[str, Any]:
    totals = account_totals(report_entries(start_date, end_date))
    revenue = -sum(value for code, value in totals.items() if ledger.accounts.get(code) and ledger.accounts[code].account_type == "revenue")
    expenses = sum(value for code, value in totals.items() if ledger.accounts.get(code) and ledger.accounts[code].account_type == "expense")
    return {"income_statement": {"revenue": revenue, "expenses": expenses, "net_profit": revenue - expenses}}


@app.get("/finance/period", dependencies=[Depends(require_roles(*FINANCE_ROLES))])
def fiscal_period() -> Dict[str, Any]:
    return {"period_id": ledger.fiscal_period_id, "status": "open" if ledger.open_period else "closed"}


@app.post("/finance/period/close", dependencies=[Depends(require_roles(*MANAGER_ROLES))])
def close_fiscal_period() -> Dict[str, Any]:
    return ledger.close_period()


def report_entries(start_date: date | None, end_date: date | None):
    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")
    return [
        entry for entry in ledger.entries
        if (start_date is None or entry.posted_at.astimezone(ZoneInfo(settings.timezone)).date() >= start_date)
        and (end_date is None or entry.posted_at.astimezone(ZoneInfo(settings.timezone)).date() <= end_date)
    ]


def account_totals(entries) -> Dict[str, int]:
    totals: Dict[str, int] = {}
    for entry in entries:
        for line in entry.lines:
            totals[line.account_code] = totals.get(line.account_code, 0) + (
                line.amount if line.direction == "debit" else -line.amount
            )
    return totals


def report_balance_sheet(totals: Dict[str, int]) -> Dict[str, int]:
    account_types = {
        code: account.account_type
        for code, account in ledger.accounts.items()
    }
    assets = sum(value for code, value in totals.items() if account_types.get(code) == "asset")
    liabilities = -sum(value for code, value in totals.items() if account_types.get(code) == "liability")
    equity = -sum(value for code, value in totals.items() if account_types.get(code) == "equity")
    revenue = -sum(value for code, value in totals.items() if account_types.get(code) == "revenue")
    expenses = sum(value for code, value in totals.items() if account_types.get(code) == "expense")
    return {"assets": assets, "liabilities": liabilities, "equity": equity, "revenue": revenue, "expenses": expenses}


@app.post("/procurement/po/approve")
def approve_po(
    po_number: str,
    requester: str,
    approver: str,
    user: StaffUser = Depends(require_roles(*MANAGER_ROLES)),
) -> Dict[str, Any]:
    order = next((item for item in procurement.orders if item.po_number == po_number), None)
    if order is None:
        raise HTTPException(status_code=404, detail=f"Purchase order {po_number} not found")
    if requester != order.requester or approver != user.email:
        raise HTTPException(status_code=403, detail="Approval must use the authenticated manager account")
    order = procurement.approve_po(po_number, order.requester, user.email)
    return {"status": "approved", "purchase_order": order.__dict__}


@app.get("/management/overview", dependencies=[Depends(require_roles(*MANAGER_ROLES))])
def management_overview() -> Dict[str, Any]:
    statement = ledger.income_statement()
    rooms = list(frontdesk.rooms.values())
    occupied = sum(room.status == "occupied" for room in rooms)
    orders_pending = sum(order.status == "draft" for order in procurement.orders)
    active_staff = sum(user.get("is_active", False) for user in db.query("staff_users"))
    return {
        "revenue_minor": abs(statement["revenue"]),
        "expenses_minor": abs(statement["expenses"]),
        "net_profit_minor": statement["net_profit"],
        "occupied_rooms": occupied,
        "total_rooms": len(rooms),
        "occupancy_percent": round(occupied / len(rooms) * 100) if rooms else 0,
        "active_visitors": sum(folio.status == "open" for folio in frontdesk.folios.values()),
        "appointments": len(reservation_service.reservations),
        "active_staff": active_staff,
        "pending_approvals": orders_pending,
        "alerts": orders_pending,
        "currency": settings.currency,
    }


@app.get("/management/operations", dependencies=[Depends(require_roles(*MANAGER_ROLES))])
def management_operations() -> Dict[str, Any]:
    return {
        "rooms": [room.__dict__ for room in frontdesk.rooms.values()],
        "reservations": [reservation.__dict__ for reservation in reservation_service.reservations],
        "open_folios": [folio.__dict__ for folio in frontdesk.folios.values() if folio.status == "open"],
        "pending_purchase_orders": [order.__dict__ for order in procurement.orders if order.status == "draft"],
        "low_stock_items": [item.__dict__ for item in inventory.items.values() if item.on_hand <= 0],
    }


@app.get("/management/people", dependencies=[Depends(require_roles(*MANAGER_ROLES))])
def management_people() -> Dict[str, Any]:
    staff = db.query("staff_users")
    return {
        "staff": [
            {
                "id": user.get("id"),
                "email": user["email"],
                "full_name": user.get("full_name", user["email"]),
                "role": user.get("role", "front_desk"),
                "status": "active" if user.get("is_active", False) else "inactive",
            }
            for user in staff
        ],
        "payroll_runs": [run.__dict__ for run in payroll.runs],
    }


@app.get("/management/approvals", dependencies=[Depends(require_roles(*MANAGER_ROLES))])
def management_approvals() -> Dict[str, Any]:
    return {"purchase_orders": [order.__dict__ for order in procurement.orders if order.status == "draft"]}


@app.post("/management/approvals/{po_number}/approve")
def management_approve_po(
    po_number: str,
    user: StaffUser = Depends(require_roles(*MANAGER_ROLES)),
) -> Dict[str, Any]:
    order = next((item for item in procurement.orders if item.po_number == po_number), None)
    if order is None:
        raise HTTPException(status_code=404, detail=f"Purchase order {po_number} not found")
    approved = procurement.approve_po(po_number, order.requester, user.email)
    return {"status": "approved", "purchase_order": approved.__dict__}


@app.get("/procurement/purchase-orders", dependencies=[Depends(require_roles(*PROCUREMENT_READ_ROLES))])
def list_purchase_orders() -> Dict[str, Any]:
    return {
        "purchase_orders": [order.__dict__ for order in procurement.orders],
        "invoices": [invoice.__dict__ for invoice in procurement.invoices],
    }


@app.post("/procurement/purchase-orders")
def create_purchase_order(
    payload: PurchaseOrderRequest,
    user: StaffUser = Depends(require_roles("procurement", *MANAGER_ROLES)),
) -> Dict[str, Any]:
    order = procurement.create_po(payload.po_number, payload.supplier_name, payload.total_minor, user.email)
    return {"purchase_order": order.__dict__}


@app.post("/procurement/goods-receipts", dependencies=[Depends(require_roles("procurement", *STOCK_ROLES))])
def receive_goods(payload: GoodsReceiptRequest) -> Dict[str, Any]:
    result = procurement.receive_grn(payload.po_number, payload.quantity, payload.unit_cost_minor)
    return result


@app.post("/procurement/invoices", dependencies=[Depends(require_roles("procurement", *FINANCE_ROLES))])
def match_supplier_invoice(payload: InvoiceRequest) -> Dict[str, Any]:
    invoice = procurement.match_invoice(payload.invoice_number, payload.supplier_name, payload.total_minor)
    return {"invoice": invoice.__dict__}


@app.post("/procurement/invoices/{invoice_number}/payment")
def pay_supplier_invoice(
    invoice_number: str,
    user: StaffUser = Depends(require_roles(*FINANCE_ROLES)),
) -> Dict[str, Any]:
    result = procurement.release_payment(invoice_number, user.role, user.email)
    return result


@app.get("/inventory", dependencies=[Depends(require_roles("storekeeper", *FINANCE_ROLES))])
def list_inventory() -> Dict[str, Any]:
    return {
        "items": [item.__dict__ for item in inventory.items.values()],
        "valuation_minor": inventory.stock_valuation(),
        "currency": settings.currency,
    }


@app.post("/inventory/items", dependencies=[Depends(require_roles(*STOCK_ROLES))])
def add_inventory_item(payload: InventoryItemRequest) -> Dict[str, Any]:
    item = inventory.add_item(payload.sku, payload.name, payload.unit_cost_minor, payload.store_code)
    return {"item": item.__dict__}


@app.post("/inventory/receipts", dependencies=[Depends(require_roles(*STOCK_ROLES))])
def receive_inventory(payload: StockMovementRequest) -> Dict[str, Any]:
    item = inventory.receive_stock(payload.sku, payload.quantity)
    return {"item": item.__dict__, "valuation_minor": inventory.stock_valuation()}


@app.post("/inventory/depletions", dependencies=[Depends(require_roles(*STOCK_ROLES))])
def deplete_inventory(payload: StockMovementRequest) -> Dict[str, Any]:
    item = inventory.deplete_stock(payload.sku, payload.quantity)
    return {"item": item.__dict__, "valuation_minor": inventory.stock_valuation()}


@app.get("/assets", dependencies=[Depends(require_roles(*FINANCE_ROLES))])
def list_assets() -> Dict[str, Any]:
    return {"assets": [asset.__dict__ for asset in assets.assets]}


@app.post("/assets", dependencies=[Depends(require_roles(*FINANCE_ROLES))])
def add_fixed_asset(payload: AssetRequest) -> Dict[str, Any]:
    asset = assets.add_asset(payload.asset_code, payload.name, payload.cost_minor, payload.useful_life_months)
    return {"asset": asset.__dict__}


@app.post("/assets/{asset_code}/depreciation", dependencies=[Depends(require_roles(*FINANCE_ROLES))])
def run_asset_depreciation(asset_code: str, payload: DepreciationRequest) -> Dict[str, Any]:
    asset = assets.run_monthly_depreciation(asset_code, payload.amount_minor)
    return {"asset": asset.__dict__}


@app.post("/hr/payroll", dependencies=[Depends(require_roles(*FINANCE_ROLES))])
def run_payroll(payload: PayrollRequest) -> Dict[str, Any]:
    run = payroll.run_payroll(payload.period, payload.total_minor)
    return {"payroll_run": run.__dict__}


@app.post("/outlets/sales", dependencies=[Depends(require_roles("outlet_cashier", *FRONT_DESK_ROLES))])
def record_outlet_sale(payload: OutletSaleRequest) -> Dict[str, Any]:
    sale = outlets.record_sale(
        payload.outlet,
        payload.total_minor,
        payload.cost_minor,
        payload.room_code,
        payload.paid_directly,
    )
    return {"sale": sale.__dict__}


@app.post("/front-desk/night-audit/charges", dependencies=[Depends(require_roles(*NIGHT_AUDIT_ROLES))])
def post_night_audit_charge(payload: NightAuditChargeRequest) -> Dict[str, Any]:
    entry = night_audit.post_room_charges(payload.room_code, payload.charge_minor, payload.guest_name)
    return {"entry": {"idempotency_key": entry.idempotency_key, "debit_total": entry.debit_total, "credit_total": entry.credit_total}}


@app.post("/front-desk/night-audit/reconcile", dependencies=[Depends(require_roles(*NIGHT_AUDIT_ROLES))])
def reconcile_night_audit(payload: ReconciliationRequest) -> Dict[str, Any]:
    return night_audit.reconcile_tills_and_folios(payload.till_cash_minor, payload.folio_total_minor)
