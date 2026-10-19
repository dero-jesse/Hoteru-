from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from config import settings
from database import db
from events import DomainEvent, event_bus


@dataclass
class Account:
    code: str
    name: str
    account_type: str
    currency: str = settings.currency
    parent_code: Optional[str] = None


@dataclass
class PostingRule:
    event_type: str
    debit_code: str
    credit_code: str
    vat_rate: float = 0.0
    multiplier: int = 1


@dataclass
class JournalLine:
    account_code: str
    direction: str
    amount: int
    description: str = ""


@dataclass
class JournalEntry:
    entry_type: str
    fiscal_period_id: int
    source_module: str
    source_event: str
    idempotency_key: str
    created_by: str
    memo: Optional[str]
    currency: str = settings.currency
    lines: List[JournalLine] = field(default_factory=list)
    posted_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def debit_total(self) -> int:
        return sum(line.amount for line in self.lines if line.direction == "debit")

    @property
    def credit_total(self) -> int:
        return sum(line.amount for line in self.lines if line.direction == "credit")

    def is_balanced(self) -> bool:
        return self.debit_total == self.credit_total


class Ledger:
    def __init__(self, fiscal_period_id: int = 1):
        self.fiscal_period_id = fiscal_period_id
        self.accounts: Dict[str, Account] = {}
        self.rules: Dict[str, PostingRule] = {}
        self.entries: List[JournalEntry] = []
        self.open_period = True

    def seed_accounts(self, accounts: List[Dict[str, str]]):
        for account in accounts:
            self.accounts[account["code"]] = Account(**account)

    def seed_rules(self, rules: List[Dict[str, Any]]):
        for rule in rules:
            self.rules[rule["event_type"]] = PostingRule(
                event_type=rule["event_type"],
                debit_code=rule["debit_account_code"],
                credit_code=rule["credit_account_code"],
                vat_rate=float(rule.get("vat_rate", 0.0)),
                multiplier=int(rule.get("amount_multiplier", 1)),
            )

    def _create_entry(self, payload: Dict[str, Any], event_type: str) -> JournalEntry:
        if not self.open_period:
            raise ValueError("Fiscal period is closed; posting rejected")
        rule = self.rules.get(event_type)
        if rule is None:
            raise ValueError(f"No posting rule for {event_type}")
        amount = int(payload.get("amount_minor", 0))
        vat_rate = float(payload.get("vat_rate", rule.vat_rate))
        vat_amount = 0
        base_amount = amount
        if vat_rate:
            vat_amount = int(round(amount * vat_rate / (1 + vat_rate)))
            base_amount = amount - vat_amount
        lines = [
            JournalLine(rule.debit_code, "debit", base_amount + (vat_amount if event_type in {"room_night_posted", "outlet_sale_to_room"} and rule.debit_code == "1100" else 0), f"{event_type}: debit"),
            JournalLine(rule.credit_code, "credit", amount + (vat_amount if event_type in {"room_night_posted", "outlet_sale_to_room"} and rule.credit_code == "2200" else 0), f"{event_type}: credit"),
        ]
        if event_type in {"room_night_posted", "outlet_sale_to_room", "outlet_sale_direct"}:
            revenue_code = {
                "restaurant": "4010",
                "room_service": "4030",
            }.get(str(payload.get("outlet", "")), "4000" if event_type == "room_night_posted" else "4010")
            payment_code = {
                "cash": "1000",
                "card": "1010",
                "mobile_money": "1020",
            }.get(str(payload.get("payment_method", "cash")), "1000")
            debit_code = payment_code if event_type == "outlet_sale_direct" else "1100"
            lines = [
                JournalLine(debit_code, "debit", amount, "Outlet payment" if event_type == "outlet_sale_direct" else "Guest receivable"),
                JournalLine(revenue_code, "credit", base_amount, "Outlet revenue" if event_type != "room_night_posted" else "Room revenue"),
                JournalLine("2200", "credit", vat_amount, "VAT payable"),
            ]
        if event_type == "deposit_received":
            lines = [
                JournalLine("1000", "debit", amount, "Cash or bank"),
                JournalLine("2100", "credit", amount, "Guest deposit"),
            ]
        if event_type == "checkout_settlement":
            cash_account_code = {
                "cash": "1000",
                "card": "1010",
                "mobile_money": "1020",
            }.get(str(payload.get("payment_method", "cash")), "1000")
            lines = [
                JournalLine(cash_account_code, "debit", int(payload.get("cash_amount_minor", 0)), "Guest payment received"),
                JournalLine("2100", "debit", int(payload.get("deposit_release_minor", 0)), "Deposit release"),
                JournalLine("1100", "credit", int(payload.get("receivable_settlement_minor", 0)), "Guest receivable cleared"),
                JournalLine("2100", "debit", int(payload.get("deposit_refund_minor", 0)), "Unused deposit refunded"),
                JournalLine(cash_account_code, "credit", int(payload.get("deposit_refund_minor", 0)), "Deposit refund paid"),
            ]
        if event_type == "grn_received":
            lines = [
                JournalLine("1200", "debit", amount, "Inventory received"),
                JournalLine("6000", "credit", amount, "GRNI"),
            ]
        if event_type == "supplier_invoice_matched":
            lines = [
                JournalLine("6000", "debit", amount, "GRNI cleared"),
                JournalLine("2000", "credit", amount, "Supplier payable"),
            ]
        if event_type == "supplier_payment":
            lines = [
                JournalLine("2000", "debit", amount, "Supplier payable"),
                JournalLine("1000", "credit", amount, "Cash / bank"),
            ]
        if event_type == "payroll_run":
            lines = [
                JournalLine("5100", "debit", amount, "Payroll expense"),
                JournalLine("2300", "credit", amount, "Accrued salaries"),
            ]
        if event_type == "depreciation_run":
            lines = [
                JournalLine("5500", "debit", amount, "Depreciation expense"),
                JournalLine("1490", "credit", amount, "Accumulated depreciation"),
            ]
        if event_type == "cost_of_sales":
            lines = [
                JournalLine("5000", "debit", amount, "Cost of sales"),
                JournalLine("1200", "credit", amount, "Inventory reduction"),
            ]

        entry = JournalEntry(
            entry_type="credit" if sum(line.amount for line in lines if line.direction == "credit") > sum(line.amount for line in lines if line.direction == "debit") else "debit",
            fiscal_period_id=self.fiscal_period_id,
            source_module=payload.get("source_module", "unknown"),
            source_event=event_type,
            idempotency_key=payload.get("idempotency_key", f"{event_type}:{payload.get('aggregate_id','')}-{amount}"),
            created_by=payload.get("created_by", "system"),
            memo=payload.get("memo"),
            currency=payload.get("currency", settings.currency),
            lines=lines,
        )
        if entry.debit_total != entry.credit_total:
            raise ValueError(f"Posting {event_type} is unbalanced: debits {entry.debit_total}, credits {entry.credit_total}")
        self.entries.append(entry)
        db.insert("journal_entries", {
            "entry_type": entry.entry_type,
            "fiscal_period_id": entry.fiscal_period_id,
            "source_module": entry.source_module,
            "source_event": entry.source_event,
            "idempotency_key": entry.idempotency_key,
            "currency": entry.currency,
            "memo": entry.memo,
            "created_by": entry.created_by,
            "debit_total": entry.debit_total,
            "credit_total": entry.credit_total,
        })
        for line in entry.lines:
            db.insert("journal_lines", {
                "journal_entry_id": len(self.entries),
                "account_code": line.account_code,
                "direction": line.direction,
                "amount": line.amount,
                "description": line.description,
            })
        event_bus.publish(DomainEvent(event_type=event_type, aggregate=payload.get("aggregate", "ledger"), aggregate_id=payload.get("aggregate_id", str(len(self.entries))), payload=payload))
        return entry

    def post_event(self, event_type: str, payload: Dict[str, Any]) -> JournalEntry:
        return self._create_entry(payload, event_type)

    def trial_balance(self) -> Dict[str, int]:
        totals: Dict[str, int] = {}
        for entry in self.entries:
            for line in entry.lines:
                totals[line.account_code] = totals.get(line.account_code, 0) + (line.amount if line.direction == "debit" else -line.amount)
        return totals

    def balance_sheet(self) -> Dict[str, int]:
        totals = self.trial_balance()
        assets = sum(v for k, v in totals.items() if self.accounts.get(k, Account(k, k, "asset")).account_type == "asset")
        liabilities = -sum(v for k, v in totals.items() if self.accounts.get(k, Account(k, k, "liability")).account_type == "liability")
        equity = -sum(v for k, v in totals.items() if self.accounts.get(k, Account(k, k, "equity")).account_type == "equity")
        revenue = -sum(v for k, v in totals.items() if self.accounts.get(k, Account(k, k, "revenue")).account_type == "revenue")
        expenses = sum(v for k, v in totals.items() if self.accounts.get(k, Account(k, k, "expense")).account_type == "expense")
        return {"assets": assets, "liabilities": liabilities, "equity": equity, "revenue": revenue, "expenses": expenses}

    def income_statement(self) -> Dict[str, int]:
        totals = self.trial_balance()
        revenue = -sum(v for k, v in totals.items() if self.accounts.get(k, Account(k, k, "revenue")).account_type == "revenue")
        expenses = sum(v for k, v in totals.items() if self.accounts.get(k, Account(k, k, "expense")).account_type == "expense")
        return {"revenue": revenue, "expenses": expenses, "net_profit": revenue - expenses}

    def close_period(self) -> Dict[str, int]:
        self.open_period = False
        return {"status": "closed", "period_id": self.fiscal_period_id}


class NightAuditService:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger

    def post_room_charges(self, room_code: str, charge_minor: int, guest_name: str) -> JournalEntry:
        return self.ledger.post_event(
            "room_night_posted",
            {
                "aggregate": "room_charge",
                "aggregate_id": room_code,
                "source_module": "rooms",
                "amount_minor": charge_minor,
                "vat_rate": settings.vat_rate,
                "created_by": "night_audit",
                "memo": f"Night audit room charge for {guest_name}",
            },
        )

    def reconcile_tills_and_folios(self, till_cash_minor: int, folio_total_minor: int) -> Dict[str, int]:
        return {"till_cash_minor": till_cash_minor, "folio_total_minor": folio_total_minor, "variance_minor": till_cash_minor - folio_total_minor}


def build_default_ledger() -> Ledger:
    ledger = Ledger()
    accounts = [
        {"code": "1000", "name": "Cash", "account_type": "asset"},
        {"code": "1010", "name": "Bank", "account_type": "asset"},
        {"code": "1020", "name": "Mobile Money", "account_type": "asset"},
        {"code": "1100", "name": "Guest Receivables", "account_type": "asset"},
        {"code": "1200", "name": "Inventory", "account_type": "asset"},
        {"code": "1490", "name": "Accumulated Depreciation", "account_type": "asset"},
        {"code": "2000", "name": "Supplier Payables", "account_type": "liability"},
        {"code": "2100", "name": "Guest Deposits", "account_type": "liability"},
        {"code": "2200", "name": "VAT Payable", "account_type": "liability"},
        {"code": "2300", "name": "Accrued Salaries", "account_type": "liability"},
        {"code": "3000", "name": "Capital", "account_type": "equity"},
        {"code": "3010", "name": "Retained Earnings", "account_type": "equity"},
        {"code": "4000", "name": "Room Revenue", "account_type": "revenue"},
        {"code": "4010", "name": "Restaurant Revenue", "account_type": "revenue"},
        {"code": "5000", "name": "Cost of Sales", "account_type": "expense"},
        {"code": "5100", "name": "Payroll Expense", "account_type": "expense"},
        {"code": "5500", "name": "Depreciation Expense", "account_type": "expense"},
        {"code": "6000", "name": "GRNI", "account_type": "liability"},
    ]
    ledger.seed_accounts(accounts)
    ledger.seed_rules([
        {"event_type": "deposit_received", "debit_account_code": "1000", "credit_account_code": "2100", "vat_rate": 0},
        {"event_type": "room_night_posted", "debit_account_code": "1100", "credit_account_code": "4000", "vat_rate": settings.vat_rate},
        {"event_type": "outlet_sale_to_room", "debit_account_code": "1100", "credit_account_code": "4010", "vat_rate": settings.vat_rate},
        {"event_type": "cost_of_sales", "debit_account_code": "5000", "credit_account_code": "1200", "vat_rate": 0},
        {"event_type": "checkout_settlement", "debit_account_code": "1000", "credit_account_code": "1100", "vat_rate": 0},
        {"event_type": "outlet_sale_direct", "debit_account_code": "1000", "credit_account_code": "4000", "vat_rate": settings.vat_rate},
        {"event_type": "grn_received", "debit_account_code": "1200", "credit_account_code": "6000", "vat_rate": 0},
        {"event_type": "supplier_invoice_matched", "debit_account_code": "6000", "credit_account_code": "2000", "vat_rate": 0},
        {"event_type": "supplier_payment", "debit_account_code": "2000", "credit_account_code": "1000", "vat_rate": 0},
        {"event_type": "payroll_run", "debit_account_code": "5100", "credit_account_code": "2300", "vat_rate": 0},
        {"event_type": "depreciation_run", "debit_account_code": "5500", "credit_account_code": "1490", "vat_rate": 0},
    ])
    return ledger
