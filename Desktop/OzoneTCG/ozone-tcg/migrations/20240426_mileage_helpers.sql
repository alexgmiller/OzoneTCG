-- ── Mileage tracking helpers ───────────────────────────────────────────────────
--
-- Adds:
--   1. home_address on workspaces — used as quick-pick "Home" chip in mileage form
--   2. venue_address on show_sessions — auto-fills "To" when show is linked
--   3. mileage_from / mileage_to on expenses — records route for history
--   4. workspace_saved_locations table — remembers frequently used addresses
--
-- Run in Supabase SQL Editor (Dashboard → SQL).

-- 1. Home address on workspace ─────────────────────────────────────────────────

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS home_address text;

-- 2. Venue address on show sessions ───────────────────────────────────────────

ALTER TABLE show_sessions
  ADD COLUMN IF NOT EXISTS venue_address text;

-- 3. Route columns on expenses ────────────────────────────────────────────────

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS mileage_from text,
  ADD COLUMN IF NOT EXISTS mileage_to   text;

-- 4. Saved locations table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_saved_locations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label        text        NOT NULL,
  address      text        NOT NULL,
  use_count    integer     NOT NULL DEFAULT 1,
  last_used    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_locations_workspace
  ON workspace_saved_locations(workspace_id, use_count DESC);

-- 5. RLS for workspace_saved_locations ────────────────────────────────────────

ALTER TABLE workspace_saved_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_locations_select" ON workspace_saved_locations;
CREATE POLICY "saved_locations_select" ON workspace_saved_locations
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "saved_locations_insert" ON workspace_saved_locations;
CREATE POLICY "saved_locations_insert" ON workspace_saved_locations
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "saved_locations_update" ON workspace_saved_locations;
CREATE POLICY "saved_locations_update" ON workspace_saved_locations
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "saved_locations_delete" ON workspace_saved_locations;
CREATE POLICY "saved_locations_delete" ON workspace_saved_locations
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
