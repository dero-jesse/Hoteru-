from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from events import DomainEvent, event_bus
from finance_module import Ledger


@dataclass
class StockItem:
    sku: str
    name: str
    unit_cost_minor: int
    on_hand: int = 0
    store_code: str = "main"


class InventoryService:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger
        self.items: Dict[str, StockItem] = {}

    def add_item(self, sku: str, name: str, unit_cost_minor: int, store_code: str = "main") -> StockItem:
        item = StockItem(sku=sku, name=name, unit_cost_minor=unit_cost_minor, store_code=store_code)
        self.items[sku] = item
        return item

    def receive_stock(self, sku: str, quantity: int) -> StockItem:
        item = self.items[sku]
        item.on_hand += quantity
        self.ledger.post_event(
            "grn_received",
            {
                "aggregate": "stock_item",
                "aggregate_id": sku,
                "source_module": "inventory",
                "amount_minor": quantity * item.unit_cost_minor,
                "currency": "KES",
                "created_by": "storekeeper",
                "memo": f"Received {quantity} units of {sku}",
            },
        )
        event_bus.publish(DomainEvent("stock_received", "stock_item", sku, {"quantity": quantity, "unit_cost_minor": item.unit_cost_minor}))
        return item

    def deplete_stock(self, sku: str, quantity: int) -> StockItem:
        item = self.items[sku]
        if item.on_hand < quantity:
            raise ValueError(f"Insufficient stock for {sku}")
        item.on_hand -= quantity
        self.ledger.post_event(
            "cost_of_sales",
            {
                "aggregate": "stock_item",
                "aggregate_id": sku,
                "source_module": "inventory",
                "amount_minor": quantity * item.unit_cost_minor,
                "currency": "KES",
                "created_by": "storekeeper",
                "memo": f"Stock depletion for {sku}",
            },
        )
        return item

    def stock_valuation(self) -> int:
        return sum(item.on_hand * item.unit_cost_minor for item in self.items.values())
