-- ── Tax-deductible expense tracking ──────────────────────────────────────────
--
-- NOTE: No 'inventory_cogs' category is included here. Inventory purchases are
-- already tracked via the buy/inventory system with full cost basis. Adding
-- COGS here would cause double-counting on Schedule C reports.
--
-- Run this migration in Supabase SQL Editor (Dashboard → SQL).

-- 1. Add new columns with safe defaults so existing rows are unaffected
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'other'
    CHECK (category IN (
      'mileage','meals','lodging','booth_fee','supplies',
      'shipping','software','grading_fees','other'
    )),
  ADD COLUMN IF NOT EXISTS deductible_percentage integer DEFAULT 100
    CHECK (deductible_percentage BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS mileage_miles numeric(8,2),
  ADD COLUMN IF NOT EXISTS mileage_rate numeric(5,3) DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS expense_date date;

-- 2. Backfill existing rows before adding NOT NULL constraints
UPDATE expenses
SET
  category            = COALESCE(category, 'other'),
  deductible_percentage = COALESCE(deductible_percentage, 100),
  expense_date        = COALESCE(expense_date, created_at::date)
WHERE category IS NULL
   OR deductible_percentage IS NULL
   OR expense_date IS NULL;

-- 3. Tighten columns to NOT NULL after backfill
ALTER TABLE expenses
  ALTER COLUMN category          SET NOT NULL,
  ALTER COLUMN category          SET DEFAULT 'other',
  ALTER COLUMN deductible_percentage SET NOT NULL,
  ALTER COLUMN deductible_percentage SET DEFAULT 100,
  ALTER COLUMN expense_date      SET NOT NULL,
  ALTER COLUMN expense_date      SET DEFAULT CURRENT_DATE;

-- 4. Mileage integrity: miles required when category = 'mileage'
--    (applied after backfill so no existing rows violate it)
ALTER TABLE expenses
  DROP CONSTRAINT IF EXISTS expenses_mileage_miles_required;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_mileage_miles_required
    CHECK (category != 'mileage' OR mileage_miles IS NOT NULL);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_show_session
  ON expenses(show_session_id) WHERE show_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_date_workspace
  ON expenses(workspace_id, expense_date);

CREATE INDEX IF NOT EXISTS idx_expenses_category
  ON expenses(workspace_id, category);

-- 6. Receipts storage bucket
--    Run separately in the Supabase Storage UI or via the JS client if this
--    SQL form doesn't support storage DDL in your project setup.
--
--    Dashboard path: Storage → New bucket → Name: "receipts", Public: true
--
--    RLS policy (run after creating the bucket):
--
--    CREATE POLICY "workspace_receipts_access" ON storage.objects
--      FOR ALL USING (
--        bucket_id = 'receipts'
--        AND (storage.foldername(name))[1] IN (
--          SELECT id::text FROM workspaces
--          WHERE id IN (
--            SELECT workspace_id FROM workspace_members
--            WHERE user_id = auth.uid()
--          )
--        )
--      );
