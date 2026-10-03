# Hotel Management System

A staff-only hotel management system with a FastAPI backend and a separate React + TypeScript reception frontend. The frontend focuses on hotel arrivals, in-house guests, departures, reservations and check-in, while calling the backend REST API for supported operations.

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

The dashboard's overview cards and sample guest cards are clearly marked preview data. Reservation and front-desk forms call the configured API URL. Set `VITE_API_BASE_URL` in `frontend/.env` if the backend is hosted somewhere other than `http://localhost:8000`.

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
- All money values are stored as integer minor units and currency codes are tracked with each transaction.
