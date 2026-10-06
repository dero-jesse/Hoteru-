from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from config import settings
from database import db
from events import DomainEvent, event_bus
from finance_module import JournalEntry, Ledger


@dataclass
class Room:
    room_code: str
    room_type: str
    rate_minor: int
    status: str = "available"


@dataclass
class Reservation:
    guest_name: str
    room_code: str
    check_in: date
    check_out: date
    rate_minor: int
    status: str = "confirmed"


@dataclass
class Folio:
    guest_name: str
    room_code: str
    opening_balance_minor: int = 0
    closing_balance_minor: int = 0
    status: str = "open"


class ReservationService:
    def __init__(self):
        self.reservations: List[Reservation] = []

    def create_reservation(self, guest_name: str, room_code: str, check_in: date, check_out: date, rate_minor: int) -> Reservation:
        reservation = Reservation(guest_name, room_code, check_in, check_out, rate_minor)
        self.reservations.append(reservation)
        db.insert("reservations", {"guest_name": guest_name, "room_code": room_code, "check_in": str(check_in), "check_out": str(check_out), "rate_minor": rate_minor, "status": reservation.status})
        event_bus.publish(DomainEvent("reservation_created", "reservation", f"res-{len(self.reservations)}", {"guest_name": guest_name, "room_code": room_code, "rate_minor": rate_minor}))
        return reservation


class FrontDeskService:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger
        self.folios: Dict[str, Folio] = {}
        self.rooms: Dict[str, Room] = {}

    def create_room(self, room_code: str, room_type: str, rate_minor: int) -> Room:
        room = Room(room_code, room_type, rate_minor)
        self.rooms[room_code] = room
        db.insert("rooms", {"room_code": room_code, "room_type": room_type, "status": room.status, "rate_minor": rate_minor})
        return room

    def check_in(self, guest_name: str, room_code: str) -> Folio:
        room = self.rooms[room_code]
        room.status = "occupied"
        folio = Folio(guest_name=guest_name, room_code=room_code, opening_balance_minor=0, closing_balance_minor=0)
        self.folios[guest_name] = folio
        db.insert("folios", {"guest_name": guest_name, "room_code": room_code, "opening_balance_minor": 0, "closing_balance_minor": 0, "status": "open"})
        self.ledger.post_event(
            "deposit_received",
            {
                "aggregate": "guest_deposit",
                "aggregate_id": guest_name,
                "source_module": "front_desk",
                "amount_minor": room.rate_minor,
                "currency": settings.currency,
                "created_by": "front_desk",
                "memo": f"Deposit for {guest_name}",
            },
        )
        event_bus.publish(DomainEvent("guest_checked_in", "folio", guest_name, {"room_code": room_code, "guest_name": guest_name}))
        return folio

    def post_room_charge(self, guest_name: str, room_code: str, amount_minor: int) -> JournalEntry:
        folio = self.folios[guest_name]
        folio.closing_balance_minor += amount_minor
        self.ledger.post_event(
            "room_night_posted",
            {
                "aggregate": "folio",
                "aggregate_id": guest_name,
                "source_module": "rooms",
                "amount_minor": amount_minor,
                "vat_rate": settings.vat_rate,
                "currency": settings.currency,
                "created_by": "front_desk",
                "memo": f"Room night for {guest_name}",
            },
        )
        return self.ledger.entries[-1]

    def checkout(self, guest_name: str, room_code: str, cash_paid_minor: int = 0, deposit_release_minor: int = 0) -> Dict[str, Any]:
        folio = self.folios[guest_name]
        receivable = folio.closing_balance_minor
        if cash_paid_minor > 0 or deposit_release_minor > 0:
            self.ledger.post_event(
                "checkout_settlement",
                {
                    "aggregate": "folio",
                    "aggregate_id": guest_name,
                    "source_module": "front_desk",
                    "cash_amount_minor": cash_paid_minor,
                    "deposit_release_minor": deposit_release_minor,
                    "receivable_settlement_minor": receivable,
                    "currency": settings.currency,
                    "created_by": "front_desk",
                    "memo": f"Checkout for {guest_name}",
                },
            )
        folio.status = "closed"
        self.rooms[room_code].status = "available"
        event_bus.publish(DomainEvent("guest_checked_out", "folio", guest_name, {"room_code": room_code, "settlement_minor": receivable}))
        return {"guest_name": guest_name, "room_code": room_code, "settlement_minor": receivable, "status": "closed"}
