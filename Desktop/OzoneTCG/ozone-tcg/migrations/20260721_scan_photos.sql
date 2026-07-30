-- Scan photo persistence: run this in the Supabase SQL editor
-- Every card-scan photo is stored with its identification + the vendor's
-- confirmed match. This is the training-data flywheel for embedding-based
-- card recognition (real photo <-> reference image pairs), and unlike the
-- market signal tables it is WORKSPACE-SCOPED vendor data.

-- Private storage bucket (server-side access only; no storage policies means
-- only the service role can read/write — clients get signed URLs if needed)
INSERT INTO storage.buckets (id, name, public)
VALUES ('scan-photos', 'scan-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS scan_photos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Path inside the scan-photos bucket: '<workspace_id>/<id>.jpg'
  storage_path      text        NOT NULL,

  -- What Claude vision said at scan time
  vision_name        text,
  vision_set_name    text,
  vision_card_number text,
  vision_confidence  numeric,

  -- What the text-matcher resolved to (may be wrong)
  matched_card_id   uuid,

  -- What the vendor actually confirmed — this is the training label.
  -- Null until confirmed; rows with a value are usable training pairs.
  confirmed_card_id uuid,
  confirmed_at      timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Training-data export: confirmed photos per card
CREATE INDEX IF NOT EXISTS idx_scan_photos_confirmed
  ON scan_photos (confirmed_card_id)
  WHERE confirmed_card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scan_photos_workspace
  ON scan_photos (workspace_id, created_at DESC);

-- ── RLS: workspace-scoped (vendor-private, unlike the market signal tables) ──
ALTER TABLE scan_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scan_photos_select ON scan_photos;
CREATE POLICY scan_photos_select ON scan_photos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = scan_photos.workspace_id AND wm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS scan_photos_update ON scan_photos;
CREATE POLICY scan_photos_update ON scan_photos
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = scan_photos.workspace_id AND wm.user_id = auth.uid()
  ));

-- Inserts happen server-side via the service role (bypasses RLS) in
-- /api/scan-card-image, so no INSERT policy is needed.
