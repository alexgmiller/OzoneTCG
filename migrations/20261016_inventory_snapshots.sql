-- Daily inventory snapshots: run this in the Supabase SQL editor
-- Feeds the Home value chart. One row per workspace per day, written by the
-- 03:00 refresh-prices cron after it updates prices (service role, bypasses RLS).
-- Re-runs upsert on (workspace_id, date), so the cron is idempotent per day.

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date          date        NOT NULL,
  total_fmv     numeric     NOT NULL DEFAULT 0,
  total_cost    numeric     NOT NULL DEFAULT 0,
  item_count    integer     NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, date)
);

-- Hot path: a workspace's series, newest last
CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_ws_date
  ON inventory_snapshots (workspace_id, date);

ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;

-- Read-only for members; writes come from the cron's service-role key.
DROP POLICY IF EXISTS "inventory_snapshots_select" ON inventory_snapshots;
CREATE POLICY "inventory_snapshots_select" ON inventory_snapshots
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Optional backfill so the chart has a first point before tonight's cron:
-- INSERT INTO inventory_snapshots (workspace_id, date, total_fmv, total_cost, item_count)
-- SELECT workspace_id, current_date, coalesce(sum(market),0), coalesce(sum(cost),0), count(*)
-- FROM items WHERE status = 'inventory' GROUP BY workspace_id
-- ON CONFLICT (workspace_id, date) DO NOTHING;
