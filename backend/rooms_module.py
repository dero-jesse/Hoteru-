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
    reservation_id: str
    guest_name: str
    room_code: str
    check_in: date
    check_out: date
    rate_minor: int
    status: str = "confirmed"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class Folio:
    guest_name: str
    room_code: str
    opening_balance_minor: int = 0
    closing_balance_minor: int = 0
    deposit_balance_minor: int = 0
    expected_checkout: date = field(default_factory=lambda: date.today())
    status: str = "open"
    checked_in_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    checked_out_at: Optional[datetime] = None


class ReservationService:
    def __init__(self, frontdesk: FrontDeskService):
        self.reservations: List[Reservation] = []
        self.frontdesk = frontdesk
        self.frontdesk.reservation_service = self

    def available_rooms(self, check_in: date, check_out: date) -> List[Room]:
        if check_out <= check_in:
            raise ValueError("Check-out date must be after check-in date")
        available = []
        for room in self.frontdesk.rooms.values():
            overlaps_reservation = any(
                reservation.room_code == room.room_code
                and reservation.status == "confirmed"
                and check_in < reservation.check_out
                and reservation.check_in < check_out
                for reservation in self.reservations
            )
            overlaps_stay = any(
                folio.room_code == room.room_code
                and folio.status == "open"
                and check_in < folio.expected_checkout
                and date.today() < check_out
                for folio in self.frontdesk.folios.values()
            )
            if not overlaps_reservation and not overlaps_stay:
                available.append(room)
        return available

    def create_reservation(
        self,
        guest_name: str,
        room_code: str,
        check_in: date,
        check_out: date,
        rate_minor: int,
    ) -> Reservation:
        if not guest_name.strip():
            raise ValueError("Guest name is required")
        if check_out <= check_in:
            raise ValueError("Check-out date must be after check-in date")
        if rate_minor <= 0:
            raise ValueError("Nightly rate must be greater than zero")
        if check_in < date.today():
            raise ValueError("Check-in date cannot be in the past")
        room = self.frontdesk.rooms.get(room_code)
        if room is None:
            raise ValueError(f"Room {room_code} is not registered")
        if room not in self.available_rooms(check_in, check_out):
            raise ValueError(f"Room {room_code} is not available for those dates")
        reservation = Reservation(
            reservation_id=f"RES-{len(self.reservations) + 1:06d}",
            guest_name=guest_name.strip(),
            room_code=room_code,
            check_in=check_in,
            check_out=check_out,
            rate_minor=rate_minor,
        )
        self.reservations.append(reservation)
        db.insert(
            "reservations",
            {
                **reservation.__dict__,
                "check_in": str(check_in),
                "check_out": str(check_out),
                "created_at": reservation.created_at.isoformat(),
            },
        )
        event_bus.publish(DomainEvent("reservation_created", "reservation", reservation.reservation_id, {"guest_name": guest_name, "room_code": room_code, "rate_minor": rate_minor}))
        return reservation

    def cancel_reservation(self, reservation_id: str) -> Dict[str, Any]:
        reservation = next(
            (item for item in self.reservations if item.reservation_id == reservation_id),
            None,
        )
        if reservation is None:
            raise KeyError(f"Reservation {reservation_id} not found")
        if reservation.status != "confirmed":
            raise ValueError(f"Reservation {reservation_id} cannot be cancelled from status {reservation.status}")
        reservation.status = "cancelled"
        for row in db.query("reservations", reservation_id=reservation_id):
            row["status"] = "cancelled"
        event_bus.publish(
            DomainEvent(
                "reservation_cancelled",
                "reservation",
                reservation_id,
                {"guest_name": reservation.guest_name, "room_code": reservation.room_code},
            )
        )
        return {"reservation_id": reservation_id, "status": reservation.status}


class FrontDeskService:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger
        self.folios: Dict[str, Folio] = {}
        self.rooms: Dict[str, Room] = {}

    def create_room(self, room_code: str, room_type: str, rate_minor: int) -> Room:
        room_code = room_code.strip()
        room_type = room_type.strip()
        if not room_code or not room_type:
            raise ValueError("Room number and room type are required")
        if rate_minor <= 0:
            raise ValueError("Nightly rate must be greater than zero")
        if room_code in self.rooms:
            raise ValueError(f"Room {room_code} is already registered")
        room = Room(room_code, room_type, rate_minor)
        self.rooms[room_code] = room
        db.insert("rooms", {"room_code": room_code, "room_type": room_type, "status": room.status, "rate_minor": rate_minor})
        return room

    def check_in(self, guest_name: str, room_code: str, expected_checkout: Optional[date] = None) -> Folio:
        room = self.rooms[room_code]
        today = date.today()
        expected_checkout = expected_checkout or date.fromordinal(today.toordinal() + 1)
        if expected_checkout <= today:
            raise ValueError("Expected check-out date must be after today")
        if any(
            folio.guest_name == guest_name and folio.status == "open"
            for folio in self.folios.values()
        ):
            raise ValueError(f"{guest_name} already has an open stay")
        reservation_service = getattr(self, "reservation_service", None)
        matching_reservation = None
        if reservation_service:
            arriving_reservations = [
                reservation
                for reservation in reservation_service.reservations
                if reservation.room_code == room_code
                and reservation.status == "confirmed"
                and reservation.check_in <= date.today() < reservation.check_out
            ]
            matching_reservation = next(
                (item for item in arriving_reservations if item.guest_name == guest_name),
                None,
            )
            if arriving_reservations and matching_reservation is None:
                raise ValueError(f"Room {room_code} is reserved for another guest")
            if matching_reservation:
                expected_checkout = matching_reservation.check_out
        if reservation_service:
            availability = reservation_service.available_rooms(today, expected_checkout)
            if room not in availability and matching_reservation is None:
                raise ValueError(f"Room {room_code} is not available for the requested stay")
        elif room.status != "available":
            raise ValueError(f"Room {room_code} is not available")
        if matching_reservation:
            matching_reservation.status = "checked_in"
            for record in db.query("reservations", reservation_id=matching_reservation.reservation_id):
                record["status"] = "checked_in"
        room.status = "occupied"
        folio = Folio(
            guest_name=guest_name,
            room_code=room_code,
            opening_balance_minor=0,
            closing_balance_minor=0,
            deposit_balance_minor=room.rate_minor,
            expected_checkout=expected_checkout,
        )
        self.folios[guest_name] = folio
        db.insert(
            "folios",
            {
                "guest_name": guest_name,
                "room_code": room_code,
                "opening_balance_minor": 0,
                "closing_balance_minor": 0,
                "deposit_balance_minor": folio.deposit_balance_minor,
                "expected_checkout": str(folio.expected_checkout),
                "status": folio.status,
                "checked_in_at": folio.checked_in_at.isoformat(),
                "checked_out_at": None,
            },
        )
        for room_record in db.query("rooms", room_code=room_code):
            room_record["status"] = room.status
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

    def post_outlet_charge(
        self,
        guest_name: str,
        room_code: str,
        outlet: str,
        amount_minor: int,
        created_by: str = "outlet_cashier",
        sale_id: Optional[str] = None,
    ) -> None:
        folio = self.folios.get(guest_name)
        if folio is None or folio.room_code != room_code or folio.status != "open":
            raise ValueError(f"No open stay for {guest_name} in room {room_code}")
        self.ledger.post_event(
            "outlet_sale_to_room",
            {
                "aggregate": "outlet_sale",
                "aggregate_id": sale_id or f"{outlet}:{room_code}",
                "source_module": "outlets",
                "amount_minor": amount_minor,
                "vat_rate": settings.vat_rate,
                "currency": settings.currency,
                "outlet": outlet,
                "created_by": created_by,
                "memo": f"{outlet} charge for {guest_name}, room {room_code}",
            },
        )
        folio.closing_balance_minor += amount_minor
        for record in db.query("folios", guest_name=guest_name, room_code=room_code):
            if record["status"] == "open":
                record["closing_balance_minor"] = folio.closing_balance_minor

    def open_folios(self) -> List[Dict[str, Any]]:
        return [
            {
                "guest_name": folio.guest_name,
                "room_code": folio.room_code,
                "closing_balance_minor": folio.closing_balance_minor,
                "deposit_balance_minor": folio.deposit_balance_minor,
                "expected_checkout": str(folio.expected_checkout),
            }
            for folio in self.folios.values()
            if folio.status == "open"
        ]

    def checkout(
        self,
        guest_name: str,
        room_code: str,
        cash_paid_minor: int = 0,
        deposit_release_minor: Optional[int] = None,
        payment_method: str = "cash",
        created_by: str = "front_desk",
    ) -> Dict[str, Any]:
        folio = self.folios[guest_name]
        if folio.room_code != room_code or folio.status != "open":
            raise ValueError(f"No open stay for {guest_name} in room {room_code}")
        receivable = folio.closing_balance_minor
        auto_refund_minor = 0
        if deposit_release_minor is None:
            deposit_release_minor = min(folio.deposit_balance_minor, receivable)
            expected_cash = receivable - deposit_release_minor
            if cash_paid_minor != expected_cash:
                raise ValueError(f"Checkout requires {expected_cash} UGX payment after applying the deposit")
        elif deposit_release_minor > folio.deposit_balance_minor:
            raise ValueError("Deposit release exceeds the guest's available deposit")
        auto_refund_minor = folio.deposit_balance_minor - deposit_release_minor
        if cash_paid_minor < 0 or deposit_release_minor < 0 or cash_paid_minor + deposit_release_minor != receivable:
            raise ValueError("Cash payment and deposit release must equal the folio balance")
        if cash_paid_minor > 0 or deposit_release_minor > 0 or auto_refund_minor > 0:
            self.ledger.post_event(
                "checkout_settlement",
                {
                    "aggregate": "folio",
                    "aggregate_id": guest_name,
                    "source_module": "front_desk",
                    "cash_amount_minor": cash_paid_minor,
                    "payment_method": payment_method,
                    "deposit_release_minor": deposit_release_minor,
                    "deposit_refund_minor": auto_refund_minor,
                    "receivable_settlement_minor": receivable,
                    "currency": settings.currency,
                    "created_by": created_by,
                    "memo": f"Checkout for {guest_name}",
                },
            )
        folio.status = "closed"
        folio.deposit_balance_minor = 0
        folio.checked_out_at = datetime.now(timezone.utc)
        self.rooms[room_code].status = "available"
        for folio_record in db.query("folios", guest_name=guest_name, room_code=room_code):
            if folio_record["status"] == "open":
                folio_record["status"] = folio.status
                folio_record["deposit_balance_minor"] = 0
                folio_record["checked_out_at"] = folio.checked_out_at.isoformat()
        for room_record in db.query("rooms", room_code=room_code):
            room_record["status"] = "available"
        reservation_service = getattr(self, "reservation_service", None)
        if reservation_service:
            for reservation in reservation_service.reservations:
                if (
                    reservation.guest_name == guest_name
                    and reservation.room_code == room_code
                    and reservation.status == "checked_in"
                ):
                    reservation.status = "completed"
                    for record in db.query("reservations", reservation_id=reservation.reservation_id):
                        record["status"] = "completed"
        event_bus.publish(DomainEvent("guest_checked_out", "folio", guest_name, {"room_code": room_code, "settlement_minor": receivable}))
        return {
            "guest_name": guest_name,
            "room_code": room_code,
            "settlement_minor": receivable,
            "cash_paid_minor": cash_paid_minor,
            "deposit_release_minor": deposit_release_minor,
            "deposit_refund_minor": auto_refund_minor,
            "status": "closed",
        }
