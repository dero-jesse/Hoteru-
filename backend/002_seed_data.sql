INSERT INTO roles (code, name, permissions) VALUES
  ('front_desk', 'Front Desk', '[]'::jsonb),
  ('outlet_cashier', 'Outlet Cashier', '[]'::jsonb),
  ('housekeeping', 'Housekeeping', '[]'::jsonb),
  ('storekeeper', 'Storekeeper', '[]'::jsonb),
  ('procurement', 'Procurement', '[]'::jsonb),
  ('accountant', 'Accountant', '[]'::jsonb),
  ('manager', 'Manager', '[]'::jsonb),
  ('admin', 'Administrator', '[]'::jsonb)
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounts (code, name, account_type, parent_code, currency) VALUES
  ('1000', 'Cash', 'asset', NULL, 'KES'),
  ('1010', 'Bank', 'asset', NULL, 'KES'),
  ('1020', 'Mobile Money', 'asset', NULL, 'KES'),
  ('1100', 'Guest Receivables', 'asset', NULL, 'KES'),
  ('1200', 'Inventory', 'asset', NULL, 'KES'),
  ('1300', 'Prepaid Expenses', 'asset', NULL, 'KES'),
  ('1400', 'Property & Equipment', 'asset', NULL, 'KES'),
  ('1490', 'Accumulated Depreciation', 'asset', NULL, 'KES'),
  ('2000', 'Supplier Payables', 'liability', NULL, 'KES'),
  ('2100', 'Guest Deposits', 'liability', NULL, 'KES'),
  ('2200', 'VAT Payable', 'liability', NULL, 'KES'),
  ('2300', 'Accrued Salaries', 'liability', NULL, 'KES'),
  ('2400', 'Unearned Revenue', 'liability', NULL, 'KES'),
  ('2500', 'Loans', 'liability', NULL, 'KES'),
  ('3000', 'Capital', 'equity', NULL, 'KES'),
  ('3010', 'Retained Earnings', 'equity', NULL, 'KES'),
  ('3020', 'Current Year Profit', 'equity', NULL, 'KES'),
  ('3030', 'Drawings', 'equity', NULL, 'KES'),
  ('4000', 'Room Revenue', 'revenue', NULL, 'KES'),
  ('4010', 'Restaurant Revenue', 'revenue', NULL, 'KES'),
  ('4020', 'Bar Revenue', 'revenue', NULL, 'KES'),
  ('4030', 'Room Service Revenue', 'revenue', NULL, 'KES'),
  ('4040', 'Banquet Revenue', 'revenue', NULL, 'KES'),
  ('4050', 'Spa Revenue', 'revenue', NULL, 'KES'),
  ('4060', 'Laundry Revenue', 'revenue', NULL, 'KES'),
  ('4100', 'Other Revenue', 'revenue', NULL, 'KES'),
  ('5000', 'Cost of Sales', 'expense', NULL, 'KES'),
  ('5100', 'Payroll Expense', 'expense', NULL, 'KES'),
  ('5200', 'Utilities', 'expense', NULL, 'KES'),
  ('5300', 'Repairs', 'expense', NULL, 'KES'),
  ('5400', 'OTA Commissions', 'expense', NULL, 'KES'),
  ('5500', 'Depreciation Expense', 'expense', NULL, 'KES'),
  ('5600', 'Other Expenses', 'expense', NULL, 'KES'),
  ('6000', 'GRNI', 'liability', NULL, 'KES')
ON CONFLICT (code) DO NOTHING;

INSERT INTO fiscal_periods (year, month, status, business_date) VALUES
  (2026, 10, 'open', '2026-10-01')
ON CONFLICT (year, month) DO NOTHING;

INSERT INTO posting_rules (event_type, rule_name, debit_account_code, credit_account_code, amount_multiplier, vat_rate, requires_approval, active) VALUES
  ('deposit_received', 'Deposit to guest deposits', '1000', '2100', 1, 0, FALSE, TRUE),
  ('room_night_posted', 'Room night revenue', '1100', '4000', 1, 0.16, FALSE, TRUE),
  ('outlet_sale_to_room', 'Outlet charge to room', '1100', '4010', 1, 0.16, FALSE, TRUE),
  ('cost_of_sales', 'Inventory cost depletion', '5000', '1200', 1, 0, FALSE, TRUE),
  ('checkout_settlement', 'Checkout payment settlement', '1000', '1100', 1, 0, FALSE, TRUE),
  ('grn_received', 'Goods received inventory', '1200', '6000', 1, 0, FALSE, TRUE),
  ('supplier_invoice_matched', 'Invoice matched to GRN', '6000', '2000', 1, 0, FALSE, TRUE),
  ('supplier_payment', 'Supplier payment', '2000', '1000', 1, 0, FALSE, TRUE),
  ('payroll_run', 'Payroll expense accrual', '5100', '2300', 1, 0, FALSE, TRUE),
  ('depreciation_run', 'Asset depreciation', '5500', '1490', 1, 0, FALSE, TRUE)
ON CONFLICT DO NOTHING;
