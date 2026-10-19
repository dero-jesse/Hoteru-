from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from config import settings
from database import db
from events import DomainEvent, event_bus
from finance_module import Ledger


@dataclass
class OutletSale:
    outlet: str
    room_code: Optional[str]
    total_minor: int
    vat_minor: int
    cost_minor: int
    paid_directly: bool = False
    guest_name: Optional[str] = None
    payment_method: Optional[str] = None
    created_at: str = ""
    cashier: str = "outlet_cashier"


class OutletService:
    def __init__(self, ledger: Ledger, frontdesk=None):
        self.ledger = ledger
        self.frontdesk = frontdesk

    def record_sale(
        self,
        outlet: str,
        total_minor: int,
        cost_minor: int,
        room_code: Optional[str] = None,
        paid_directly: bool = False,
        payment_method: Optional[str] = None,
        cashier: str = "outlet_cashier",
    ) -> OutletSale:
        if total_minor <= 0:
            raise ValueError("Sale total must be greater than zero")
        if cost_minor < 0:
            raise ValueError("Sale cost cannot be negative")
        if room_code and self.frontdesk is None:
            raise ValueError("Room charges are not configured")

        vat_minor = int(round(total_minor * settings.vat_rate / (1 + settings.vat_rate)))
        guest_name = None
        if room_code:
            folio = next(
                (folio for folio in self.frontdesk.open_folios() if folio["room_code"] == room_code),
                None,
            )
            if folio is None:
                raise ValueError(f"Room {room_code} has no checked-in guest")
            guest_name = folio["guest_name"]
        created_at = datetime.now(timezone.utc).isoformat()
        sale = OutletSale(
            outlet=outlet,
            room_code=room_code,
            total_minor=total_minor,
            vat_minor=vat_minor,
            cost_minor=cost_minor,
            paid_directly=not bool(room_code),
            guest_name=guest_name,
            payment_method=payment_method if not room_code else None,
            created_at=created_at,
            cashier=cashier,
        )
        if room_code:
            self.frontdesk.post_outlet_charge(
                guest_name,
                room_code,
                outlet,
                total_minor,
                cashier,
                f"{outlet}:{created_at}",
            )
        else:
            self.ledger.post_event(
                "outlet_sale_direct",
                {
                    "aggregate": "outlet_sale",
                    "aggregate_id": f"{outlet}:{created_at}",
                    "source_module": "outlets",
                    "amount_minor": total_minor,
                    "vat_rate": settings.vat_rate,
                    "currency": settings.currency,
                    "outlet": outlet,
                    "payment_method": payment_method or "cash",
                    "created_by": cashier,
                    "memo": f"Direct {payment_method or 'cash'} sale at {outlet}",
                },
            )
        if cost_minor > 0:
            self.ledger.post_event(
                "cost_of_sales",
                {
                    "aggregate": "outlet_sale",
                    "aggregate_id": f"{outlet}:{created_at}",
                    "source_module": "inventory",
                    "amount_minor": cost_minor,
                    "currency": settings.currency,
                    "created_by": cashier,
                    "memo": f"Cost of sales for {outlet}",
                },
            )
        db.insert("outlet_sales", sale.__dict__.copy())
        event_bus.publish(
            DomainEvent(
                "outlet_sale_recorded",
                "outlet_sale",
                f"{outlet}:{created_at}",
                {"room_code": room_code, "guest_name": guest_name, "total_minor": total_minor},
            )
        )
        return sale
