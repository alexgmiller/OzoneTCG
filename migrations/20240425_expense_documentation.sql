-- ── Expense documentation system ──────────────────────────────────────────────
--
-- Extends expenses with broader documentation support beyond paper receipts.
-- The IRS accepts photos, payment screenshots, statements, email confirmations,
-- and contemporaneous written records — not just paper receipts.
--
-- Run in Supabase SQL Editor (Dashboard → SQL).

-- 1. Add columns ───────────────────────────────────────────────────────────────

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS documentation_notes text,
  ADD COLUMN IF NOT EXISTS documentation_type  text DEFAULT 'none'
    CHECK (documentation_type IN (
      'receipt', 'payment_screenshot', 'statement',
      'written_record', 'email', 'none'
    ));

-- 2. Backfill existing rows ────────────────────────────────────────────────────
-- Rows with a receipt_url already have a photo receipt attached.
-- Rows without one have no documentation.

UPDATE expenses
SET documentation_type = 'receipt'
WHERE receipt_url IS NOT NULL
  AND (documentation_type IS NULL OR documentation_type = 'none');

UPDATE expenses
SET documentation_type = 'none'
WHERE receipt_url IS NULL
  AND documentation_type IS NULL;
