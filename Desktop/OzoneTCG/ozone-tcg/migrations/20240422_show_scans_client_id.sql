-- Add client_id for idempotent offline replay
ALTER TABLE show_scans ADD COLUMN IF NOT EXISTS client_id uuid;

-- Partial unique index: enforces uniqueness only where client_id is set
CREATE UNIQUE INDEX IF NOT EXISTS idx_show_scans_client_id
  ON show_scans (client_id)
  WHERE client_id IS NOT NULL;
