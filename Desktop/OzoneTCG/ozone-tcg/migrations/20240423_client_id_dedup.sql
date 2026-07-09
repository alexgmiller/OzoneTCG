-- Offline deduplication: client_id on show_scans prevents replayed actions
-- from being inserted twice when the offline queue retries after a network drop.
ALTER TABLE show_scans ADD COLUMN IF NOT EXISTS client_id uuid;

-- Unique partial index: only enforce uniqueness when client_id is non-null.
-- This lets legacy rows (client_id IS NULL) coexist without constraint issues.
CREATE UNIQUE INDEX IF NOT EXISTS show_scans_client_id_unique
  ON show_scans (client_id)
  WHERE client_id IS NOT NULL;
