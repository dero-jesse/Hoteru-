import unittest

from finance_module import build_default_ledger
from inventory_module import InventoryService
from procurement_module import ProcurementService
from rooms_module import FrontDeskService


class HotelBackendTests(unittest.TestCase):
    def test_ledger_invariant_trial_balance_is_zero(self):
        ledger = build_default_ledger()
        ledger.post_event(
            "deposit_received",
            {
                "aggregate": "guest_deposit",
                "aggregate_id": "guest-1",
                "source_module": "front_desk",
                "amount_minor": 100000,
                "currency": "KES",
                "created_by": "front_desk",
            },
        )
        ledger.post_event(
            "room_night_posted",
            {
                "aggregate": "folio",
                "aggregate_id": "guest-1",
                "source_module": "rooms",
                "amount_minor": 150000,
                "vat_rate": 0.16,
                "currency": "KES",
                "created_by": "front_desk",
            },
        )
        net = sum(ledger.trial_balance().values())
        self.assertEqual(net, 0)
        self.assertTrue(all(entry.is_balanced() for entry in ledger.entries))

    def test_guest_stay_flow_from_reservation_to_checkout(self):
        ledger = build_default_ledger()
        frontdesk = FrontDeskService(ledger)
        frontdesk.create_room("101", "deluxe", 15000)
        folio = frontdesk.check_in("Alice Example", "101")
        self.assertEqual(folio.status, "open")
        frontdesk.post_room_charge("Alice Example", "101", 15000)
        settlement = frontdesk.checkout("Alice Example", "101", cash_paid_minor=5000, deposit_release_minor=10000)
        self.assertEqual(settlement["status"], "closed")
        self.assertTrue(all(entry.is_balanced() for entry in ledger.entries))

    def test_procure_to_pay_cycle(self):
        ledger = build_default_ledger()
        procurement = ProcurementService(ledger)
        procurement.create_po("PO-100", "Supplier One", 50000, "requester")
        procurement.approve_po("PO-100", "requester", "approver")
        procurement.receive_grn("PO-100", 10, 4000)
        invoice = procurement.match_invoice("INV-100", "Supplier One", 40000)
        payment = procurement.release_payment("INV-100", "accountant", "acct1")
        self.assertEqual(payment["status"], "paid")
        self.assertEqual(invoice.status, "matched")
        self.assertTrue(all(entry.is_balanced() for entry in ledger.entries))

    def test_inventory_stock_valuation_and_cost_of_sales(self):
        ledger = build_default_ledger()
        inventory = InventoryService(ledger)
        inventory.add_item("MUG-01", "Coffee Mug", 250)
        inventory.receive_stock("MUG-01", 25)
        inventory.deplete_stock("MUG-01", 5)
        self.assertEqual(inventory.stock_valuation(), 5000)
        self.assertTrue(all(entry.is_balanced() for entry in ledger.entries))


if __name__ == "__main__":
    unittest.main()
