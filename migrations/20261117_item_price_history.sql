-- Item price history: run this in the Supabase SQL editor. Safe to re-run.
-- One row per inventory item per day: the item's market value after the
-- 03:00 refresh-prices cron has updated prices (service role, bypasses RLS).
-- Feeds the price charts in Inventory's item detail and Search's card sheet.
-- Re-runs upsert on (item_id, date), so the cron is idempotent per day.
-- Rows go with their item (ON DELETE CASCADE); sold items stop getting rows.

CREATE TABLE IF NOT EXISTS item_price_history (
  item_id       uuid          NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  workspace_id  uuid          NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date          date          NOT NULL,
  market        numeric(12,2) NOT NULL CHECK (market > 0),
  PRIMARY KEY (item_id, date)
);

-- A workspace's rows by day (pruning, bulk reads)
CREATE INDEX IF NOT EXISTS idx_item_price_history_ws_date
  ON item_price_history (workspace_id, date);

ALTER TABLE item_price_history ENABLE ROW LEVEL SECURITY;

-- Read-only for members; writes come from the cron's service-role key.
DROP POLICY IF EXISTS "item_price_history_select" ON item_price_history;
CREATE POLICY "item_price_history_select" ON item_price_history
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Optional first point so charts can start today instead of after tonight:
-- INSERT INTO item_price_history (item_id, workspace_id, date, market)
-- SELECT id, workspace_id, current_date, market FROM items
-- WHERE status <> 'sold' AND market > 0
-- ON CONFLICT (item_id, date) DO NOTHING;
