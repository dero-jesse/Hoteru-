import unittest

from fastapi.testclient import TestClient
from fastapi.routing import APIRoute

from app import app
from auth_module import StaffUser, create_staff_user, create_token_for_user
from config import Settings, settings
from database import db
from finance_module import build_default_ledger
from inventory_module import InventoryService
from outlets_module import OutletService
from procurement_module import ProcurementService
from rooms_module import FrontDeskService


class HotelBackendTests(unittest.TestCase):
    def test_non_development_configuration_requires_a_non_default_jwt_secret(self):
        with self.assertRaisesRegex(ValueError, "JWT_SECRET"):
            Settings(app_env="production")
        self.assertEqual(
            Settings(app_env="production", jwt_secret="unique-production-secret").jwt_algorithm,
            "HS256",
        )

    def test_default_market_settings_are_ugandan(self):
        self.assertEqual(settings.currency, "UGX")
        self.assertEqual(settings.timezone, "Africa/Kampala")
        self.assertEqual(settings.vat_rate, 0.18)

    def test_every_business_route_requires_an_authorization_dependency(self):
        public_routes = {"/health", "/auth/login"}
        documentation_routes = {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}
        for route in app.routes:
            if isinstance(route, APIRoute) and route.path not in public_routes | documentation_routes:
                self.assertTrue(route.dependant.dependencies, route.path)

    def test_role_based_routes_separate_front_desk_and_management(self):
        front_desk = create_staff_user(
            "role-front-desk@example.test",
            "front-desk-password",
            "Front Desk Test",
            "front_desk",
        )
        manager = create_staff_user(
            "role-manager@example.test",
            "manager-password",
            "Manager Test",
            "manager",
        )
        procurement_user = create_staff_user(
            "role-procurement@example.test",
            "procurement-password",
            "Procurement Test",
            "procurement",
        )
        front_desk_token = create_token_for_user(front_desk)
        manager_token = create_token_for_user(manager)
        procurement_token = create_token_for_user(procurement_user)

        with TestClient(app) as client:
            self.assertEqual(client.get("/management/overview").status_code, 401)
            self.assertEqual(
                client.get(
                    "/management/overview",
                    headers={"Authorization": f"Bearer {front_desk_token}"},
                ).status_code,
                403,
            )
            self.assertEqual(
                client.post(
                    "/front-desk/checkin",
                    json={"guest_name": "Reception Test Guest", "room_code": "ROLE-101"},
                    headers={"Authorization": f"Bearer {front_desk_token}"},
                ).status_code,
                200,
            )
            self.assertEqual(
                client.get(
                    "/management/overview",
                    headers={"Authorization": f"Bearer {manager_token}"},
                ).status_code,
                200,
            )
            self.assertEqual(
                client.get(
                    "/reports/statement",
                    headers={"Authorization": f"Bearer {front_desk_token}"},
                ).status_code,
                403,
            )
            self.assertEqual(
                client.get(
                    "/procurement/purchase-orders",
                    headers={"Authorization": f"Bearer {front_desk_token}"},
                ).status_code,
                403,
            )
            created_order = client.post(
                "/procurement/purchase-orders",
                json={
                    "po_number": "ROLE-PO-100",
                    "supplier_name": "Role Test Supplier",
                    "total_minor": 25000,
                    "requester": "forged-requester",
                },
                headers={"Authorization": f"Bearer {procurement_token}"},
            )
            self.assertEqual(created_order.status_code, 200)
            self.assertEqual(
                created_order.json()["purchase_order"]["requester"],
                procurement_user.email,
            )
            approved_order = client.post(
                "/management/approvals/ROLE-PO-100/approve",
                json={"approver": "forged-manager"},
                headers={"Authorization": f"Bearer {manager_token}"},
            )
            self.assertEqual(approved_order.status_code, 200)
            self.assertEqual(
                approved_order.json()["purchase_order"]["approver"],
                manager.email,
            )
            self.assertEqual(
                client.get(
                    "/management/overview",
                    headers={"Authorization": "Bearer invalid-token"},
                ).status_code,
                401,
            )

    def test_staff_creation_rejects_short_passwords(self):
        with self.assertRaisesRegex(ValueError, "at least 12"):
            create_staff_user("weak@example.test", "short", "Weak User", "front_desk")

    def test_login_rejects_inactive_staff_and_staff_creation_is_admin_only(self):
        inactive = create_staff_user(
            "inactive@example.test",
            "inactive-password",
            "Inactive User",
            "front_desk",
        )
        db.update("staff_users", "email", inactive.email, {"is_active": False}        )
        admin = db.query("staff_users", email="admin@hotel.local")[0]
        admin_token = create_token_for_user(StaffUser(**admin))
        manager = create_staff_user(
            "staff-creator-manager@example.test",
            "manager-password",
            "Manager Test",
            "manager",
        )
        manager_token = create_token_for_user(manager)

        with TestClient(app) as client:
            self.assertEqual(
                client.post(
                    "/auth/login",
                    json={"email": inactive.email, "password": "inactive-password"},
                ).status_code,
                401,
            )
            inactive_token = create_token_for_user(inactive)
            self.assertEqual(
                client.get(
                    "/auth/me",
                    headers={"Authorization": f"Bearer {inactive_token}"},
                ).status_code,
                401,
            )
            request = {
                "email": "new-staff@example.test",
                "password": "long-enough-password",
                "full_name": "New Staff",
                "role": "front_desk",
            }
            self.assertEqual(
                client.post(
                    "/auth/staff",
                    json=request,
                    headers={"Authorization": f"Bearer {manager_token}"},
                ).status_code,
                403,
            )
            response = client.post(
                "/auth/staff",
                json=request,
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["staff"]["role"], "front_desk")

    def test_ledger_invariant_trial_balance_is_zero(self):
        ledger = build_default_ledger()
        ledger.post_event(
            "deposit_received",
            {
                "aggregate": "guest_deposit",
                "aggregate_id": "guest-1",
                "source_module": "front_desk",
                "amount_minor": 100000,
                "currency": "UGX",
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
                "vat_rate": settings.vat_rate,
                "currency": "UGX",
                "created_by": "front_desk",
            },
        )
        net = sum(ledger.trial_balance().values())
        self.assertEqual(net, 0)
        self.assertTrue(all(entry.is_balanced() for entry in ledger.entries))

    def test_income_statement_uses_positive_revenue_and_profit_signs(self):
        ledger = build_default_ledger()
        ledger.post_event(
            "room_night_posted",
            {
                "aggregate": "folio",
                "aggregate_id": "guest-1",
                "source_module": "rooms",
                "amount_minor": 150000,
                "vat_rate": 0,
                "currency": "UGX",
                "created_by": "front_desk",
            },
        )

        statement = ledger.income_statement()

        self.assertEqual(statement["revenue"], 150000)
        self.assertEqual(statement["expenses"], 0)
        self.assertEqual(statement["net_profit"], 150000)

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
        self.assertEqual(invoice.payment_status, "paid")
        self.assertTrue(all(entry.is_balanced() for entry in ledger.entries))

    def test_inventory_stock_valuation_and_cost_of_sales(self):
        ledger = build_default_ledger()
        inventory = InventoryService(ledger)
        inventory.add_item("MUG-01", "Coffee Mug", 250)
        inventory.receive_stock("MUG-01", 25)
        inventory.deplete_stock("MUG-01", 5)
        self.assertEqual(inventory.stock_valuation(), 5000)
        self.assertTrue(all(entry.is_balanced() for entry in ledger.entries))

    def test_outlet_sales_use_uganda_currency_and_standard_vat_rate(self):
        ledger = build_default_ledger()
        sale = OutletService(ledger).record_sale("restaurant", 11800, 0)

        self.assertEqual(sale.vat_minor, 1800)
        self.assertEqual(ledger.entries[-1].currency, "UGX")
        self.assertEqual(ledger.entries[-1].lines[-1].amount, 1800)


if __name__ == "__main__":
    unittest.main()
