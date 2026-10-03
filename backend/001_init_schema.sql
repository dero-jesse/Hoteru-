-- PostgreSQL schema for the hotel management system backend.
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role_code VARCHAR(64) NOT NULL REFERENCES roles(code),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id INTEGER REFERENCES staff_users(id),
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(128) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    before_json JSONB,
    after_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(160) NOT NULL,
    account_type VARCHAR(32) NOT NULL,
    parent_code VARCHAR(64),
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fiscal_periods (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status VARCHAR(16) NOT NULL CHECK (status IN ('open','closed')),
    business_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS posting_rules (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(128) NOT NULL,
    rule_name VARCHAR(128) NOT NULL,
    debit_account_code VARCHAR(64) NOT NULL REFERENCES accounts(code),
    credit_account_code VARCHAR(64) NOT NULL REFERENCES accounts(code),
    amount_multiplier NUMERIC(12,4) NOT NULL DEFAULT 1,
    vat_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
    id BIGSERIAL PRIMARY KEY,
    entry_type VARCHAR(64) NOT NULL,
    fiscal_period_id INTEGER NOT NULL REFERENCES fiscal_periods(id),
    source_module VARCHAR(64) NOT NULL,
    source_event VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    currency CHAR(3) NOT NULL DEFAULT 'KES',
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(128) NOT NULL,
    debit_total BIGINT NOT NULL,
    credit_total BIGINT NOT NULL,
    CHECK (debit_total = credit_total)
);

CREATE TABLE IF NOT EXISTS journal_lines (
    id BIGSERIAL PRIMARY KEY,
    journal_entry_id BIGINT NOT NULL REFERENCES journal_entries(id),
    account_code VARCHAR(64) NOT NULL REFERENCES accounts(code),
    direction VARCHAR(8) NOT NULL CHECK (direction IN ('debit','credit')),
    amount BIGINT NOT NULL CHECK (amount >= 0),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
    id BIGSERIAL PRIMARY KEY,
    guest_name VARCHAR(255) NOT NULL,
    room_code VARCHAR(64) NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    rate_minor BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(64) UNIQUE NOT NULL,
    room_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'available',
    rate_minor BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS folios (
    id BIGSERIAL PRIMARY KEY,
    guest_name VARCHAR(255) NOT NULL,
    room_code VARCHAR(64) NOT NULL,
    opening_balance_minor BIGINT NOT NULL DEFAULT 0,
    closing_balance_minor BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_invoices (
    id BIGSERIAL PRIMARY KEY,
    supplier_name VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(128) UNIQUE NOT NULL,
    total_minor BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'awaiting_match',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id BIGSERIAL PRIMARY KEY,
    po_number VARCHAR(128) UNIQUE NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    total_minor BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    requester VARCHAR(255) NOT NULL,
    approver VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_items (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(128) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    unit_cost_minor BIGINT NOT NULL,
    on_hand INTEGER NOT NULL DEFAULT 0,
    store_code VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_runs (
    id SERIAL PRIMARY KEY,
    period VARCHAR(32) NOT NULL,
    total_minor BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixed_assets (
    id SERIAL PRIMARY KEY,
    asset_code VARCHAR(128) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    cost_minor BIGINT NOT NULL,
    useful_life_months INTEGER NOT NULL,
    accumulated_depreciation_minor BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active'
);
