from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from events import DomainEvent, event_bus
from finance_module import Ledger


@dataclass
class PurchaseOrder:
    po_number: str
    supplier_name: str
    total_minor: int
    status: str = "draft"
    requester: str = ""
    approver: Optional[str] = None


@dataclass
class SupplierInvoice:
    invoice_number: str
    supplier_name: str
    total_minor: int
    status: str = "awaiting_match"


class ProcurementService:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger
        self.orders: List[PurchaseOrder] = []
        self.invoices: List[SupplierInvoice] = []

    def create_po(self, po_number: str, supplier_name: str, total_minor: int, requester: str) -> PurchaseOrder:
        order = PurchaseOrder(po_number=po_number, supplier_name=supplier_name, total_minor=total_minor, requester=requester)
        self.orders.append(order)
        event_bus.publish(DomainEvent("po_created", "purchase_order", po_number, {"supplier_name": supplier_name, "requester": requester}))
        return order

    def approve_po(self, po_number: str, requester: str, approver: str) -> PurchaseOrder:
        order = next(item for item in self.orders if item.po_number == po_number)
        if requester == approver:
            raise ValueError("Requester cannot approve own purchase order")
        order.status = "approved"
        order.approver = approver
        event_bus.publish(DomainEvent("po_approved", "purchase_order", po_number, {"approver": approver, "requester": requester}))
        return order

    def receive_grn(self, po_number: str, qty_received: int, unit_cost_minor: int) -> Dict[str, Any]:
        order = next(item for item in self.orders if item.po_number == po_number)
        total = qty_received * unit_cost_minor
        self.ledger.post_event(
            "grn_received",
            {
                "aggregate": "purchase_order",
                "aggregate_id": po_number,
                "source_module": "procurement",
                "amount_minor": total,
                "currency": "KES",
                "created_by": "procurement",
                "memo": f"Goods received for {po_number}",
            },
        )
        order.status = "received"
        return {"po_number": po_number, "qty_received": qty_received, "total_minor": total, "status": order.status}

    def match_invoice(self, invoice_number: str, supplier_name: str, total_minor: int) -> SupplierInvoice:
        invoice = SupplierInvoice(invoice_number=invoice_number, supplier_name=supplier_name, total_minor=total_minor)
        self.invoices.append(invoice)
        self.ledger.post_event(
            "supplier_invoice_matched",
            {
                "aggregate": "supplier_invoice",
                "aggregate_id": invoice_number,
                "source_module": "procurement",
                "amount_minor": total_minor,
                "currency": "KES",
                "created_by": "accountant",
                "memo": f"Matched invoice {invoice_number}",
            },
        )
        invoice.status = "matched"
        return invoice

    def release_payment(self, invoice_number: str, payer_role: str, payer_name: str) -> Dict[str, Any]:
        if payer_role not in {"accountant", "manager", "admin"}:
            raise ValueError("Only authorised roles can release payment")
        invoice = next(item for item in self.invoices if item.invoice_number == invoice_number)
        self.ledger.post_event(
            "supplier_payment",
            {
                "aggregate": "supplier_payment",
                "aggregate_id": invoice_number,
                "source_module": "procurement",
                "amount_minor": invoice.total_minor,
                "currency": "KES",
                "created_by": payer_name,
                "memo": f"Payment for invoice {invoice_number}",
            },
        )
        invoice.status = "paid"
        return {"invoice_number": invoice_number, "status": "paid", "payer_role": payer_role}
