# Hotel Management System

A staff-only hotel management system with a FastAPI backend and a React + TypeScript frontend for front desk and general management. The front desk supports arrivals, guest stays, checkout and reservations. The management workspace summarizes live ledger and operational state, with connected screens for approvals, procurement, inventory, outlets, payroll, assets and night audit.

## Stack

- Python 3.12+
- FastAPI / Pydantic
- SQLAlchemy 2.0 / PostgreSQL
- Redis
- RabbitMQ
- JWT-based staff authentication
- pytest for automated tests
- React + TypeScript + Vite for the staff frontend

## Modules

- auth: staff accounts, roles, JWT access, audit logging
- finance: double-entry ledger, posting rules, fiscal periods, reports
- rooms: reservations, room inventory, check-in/check-out, folios
- outlets: restaurant/bar, room service, spa, laundry, minibar, parking
- procurement: requisitions, purchase orders, GRNs, invoices, 3-way match, payments
- inventory: stock items, stores, costs, stock takes
- hr: payroll, employees, leaves, time entries
- assets: work orders, fixed assets, depreciation
- reporting: occupancy, ADR, RevPAR, GOP, trial balance, statements

## Local run

1. Ensure Docker and Docker Compose are installed.
2. Run:

   docker compose up --build

3. API docs become available at:

   http://localhost:8000/docs

4. OpenAPI schema is available at:

   http://localhost:8000/openapi.json

5. Health check:

   http://localhost:8000/health

6. The reception frontend is included in Compose at:

   http://localhost:5173

   To run it separately during development, use:

   cd frontend
   npm install
   cp .env.example .env
   npm run dev

   The Vite URL is normally http://localhost:5173.

The responsive frontend has separate Front Desk and Management workspaces. Management figures are read from the running backend ledger and operational services; approval, purchasing, stock, outlet sales, payroll, asset depreciation and night-audit actions post through their corresponding API endpoints. Appointments shown in the front-desk preview are illustrative because the backend does not provide an appointment scheduling service. Set `VITE_API_BASE_URL` in `frontend/.env` if the backend is hosted somewhere other than `http://localhost:8000`.

Management API endpoints are documented at `http://localhost:8000/docs`. Staff accounts/role assignments, operational service state and ledger entries are currently held in memory and reset when the API process restarts; configure persistent database storage before using this for ongoing staff access.

### Uganda market defaults

The default market configuration uses Uganda Shillings (UGX), `en-UG` formatting, and `Africa/Kampala` time. Monetary API fields that retain the legacy `_minor` suffix are whole UGX shillings in this configuration because UGX has no commonly used fractional unit. The backend defaults to an 18% VAT rate; backend deployments can override currency, timezone, and VAT with `APP_CURRENCY`, `APP_TIMEZONE`, and `VAT_RATE`. Confirm applicable VAT treatment and EFRIS requirements with the Uganda Revenue Authority or a qualified local accountant before production use.

### Staff sign-in and role access

Sign in at the reception frontend with a staff account. The signed-in role selects the available workspace and navigation; the API independently checks each bearer token and role, so hiding a screen is not the security boundary. Tokens expire after the configured JWT lifetime. Signing out removes the browser's session token.

| Staff role | Frontend workspace | API access |
| --- | --- | --- |
| `front_desk` | Front Desk | Guest check-in/out, reservations, night audit |
| `manager` / `admin` | Front Desk and Management | Management dashboard, approvals and operations |
| `accountant` | Finance, Reports and permitted Resources | Ledger reports/posting, payroll, invoices, assets |
| `procurement` | Resources | Purchase orders, receipts and invoice matching |
| `storekeeper` | Resources | Inventory and goods receipts |
| `outlet_cashier` | Resources | Outlet sales |
| `housekeeping` | Sign-in only; no module is currently assigned | No operational routes are currently assigned |

In development, the seeded `admin@hotel.local` account can create staff accounts from Management → People. Account creation is also available to admins at `POST /auth/staff`; new passwords must be at least 12 characters. Only admins can create accounts or assign roles. Provide each employee with an individual account rather than sharing the development admin credentials.

Set a unique, strong `JWT_SECRET` for every non-development deployment. The API rejects the built-in development secret outside development; JWT signing is restricted to HS256 and tokens expire after `JWT_EXPIRES_MINUTES` (60 by default).

## Default credentials

For local development only, the API seeds this staff admin account:

- email: admin@hotel.local
- password: ChangeMe!123

Change or disable this development credential before exposing the service beyond a local environment. No default user is created when `APP_ENV` is not `development`.

## Backend layout

All backend implementation files live in [`backend/`](./backend/), including the FastAPI app, modules, dependencies, migrations, OpenAPI schema, Dockerfile, and tests. The root Docker Compose file orchestrates the backend and frontend together.

## Database and migration approach

- SQL migrations are provided in `backend/001_init_schema.sql` and `backend/002_seed_data.sql`.
- For deployment, apply migrations before starting the API.

## Domain event bus

Module boundaries communicate through the `DomainEventBus` and event envelope payloads, without any module writing directly to the finance subledger.

## Tests

Run the backend test suite from the project root:

   pytest -q backend/test_hotel_backend.py

The suite covers:
- ledger invariant checks
- finance posting engine balance validation
- full guest stay flow from reservation to checkout
- end-to-end procure-to-pay cycle

## Notes

- No guest-facing endpoints or guest accounts are exposed.
- Every write path emits audit records including actor, timestamp, action, before/after payload.
- All money values are stored as integers in the configured currency unit and currency codes are tracked with each transaction.
