from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

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


class OutletService:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger

    def record_sale(self, outlet: str, total_minor: int, cost_minor: int, room_code: Optional[str] = None, paid_directly: bool = False) -> OutletSale:
        vat_minor = int(round(total_minor * 0.16))
        sale = OutletSale(outlet=outlet, room_code=room_code, total_minor=total_minor, vat_minor=vat_minor, cost_minor=cost_minor, paid_directly=paid_directly)
        if room_code:
            self.ledger.post_event(
                "outlet_sale_to_room",
                {
                    "aggregate": "outlet_sale",
                    "aggregate_id": f"{outlet}:{room_code}",
                    "source_module": "outlets",
                    "amount_minor": total_minor,
                    "vat_rate": 0.16,
                    "currency": "KES",
                    "created_by": "cashier",
                    "memo": f"Outlet sale charged to room {room_code}",
                },
            )
            self.ledger.post_event(
                "cost_of_sales",
                {
                    "aggregate": "outlet_sale",
                    "aggregate_id": f"{outlet}:{room_code}",
                    "source_module": "inventory",
                    "amount_minor": cost_minor,
                    "currency": "KES",
                    "created_by": "cashier",
                    "memo": f"Cogs for {outlet}",
                },
            )
        else:
            self.ledger.post_event(
                "outlet_sale_to_room",
                {
                    "aggregate": "outlet_sale",
                    "aggregate_id": f"{outlet}:cash",
                    "source_module": "outlets",
                    "amount_minor": total_minor,
                    "vat_rate": 0.16,
                    "currency": "KES",
                    "created_by": "cashier",
                    "memo": f"Direct cash sale at {outlet}",
                },
            )
        event_bus.publish(DomainEvent("outlet_sale_recorded", "outlet_sale", sale.outlet, {"room_code": room_code, "total_minor": total_minor}))
        return sale
