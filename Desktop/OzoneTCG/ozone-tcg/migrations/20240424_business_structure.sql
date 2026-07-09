-- ── Business structure & entity settings ──────────────────────────────────────
--
-- Extends the workspaces table with tax entity classification fields.
-- Adds a workspace_partners table for future multi-member support (schema only;
-- the partnership management UI is deferred to phase 2).
--
-- Run this migration in Supabase SQL Editor (Dashboard → SQL).

-- 1. Extend workspaces ─────────────────────────────────────────────────────────

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS business_structure text NOT NULL DEFAULT 'sole_prop'
    CHECK (business_structure IN ('hobby', 'sole_prop', 'single_llc', 'multi_llc')),
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS business_ein text,
  ADD COLUMN IF NOT EXISTS business_state text,
  ADD COLUMN IF NOT EXISTS s_corp_election boolean NOT NULL DEFAULT false,
  -- Set to true once the user has explicitly confirmed their structure in Settings.
  -- Used to drive the "We've set a default — please confirm" banner.
  ADD COLUMN IF NOT EXISTS business_structure_confirmed boolean NOT NULL DEFAULT false;

-- 2. workspace_partners (schema only — UI deferred to phase 2) ─────────────────
--
-- Stores partner/member details for multi_llc workspaces.
-- Phase 2 will surface:
--   - K-1 allocation logic based on ownership_percentage
--   - Per-partner expense split reporting
--   - Form 1065 prep data

CREATE TABLE IF NOT EXISTS workspace_partners (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  ownership_percentage numeric(5,2) NOT NULL DEFAULT 50.00
    CHECK (ownership_percentage > 0 AND ownership_percentage <= 100),
  email               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_partners_workspace
  ON workspace_partners(workspace_id);

-- 3. RLS on workspace_partners ─────────────────────────────────────────────────
--
-- Matches the existing pattern: members of the workspace can read/write.
-- workspace_members links auth.uid() → workspace_id.

ALTER TABLE workspace_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_partners_select" ON workspace_partners;
CREATE POLICY "workspace_partners_select" ON workspace_partners
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace_partners_insert" ON workspace_partners;
CREATE POLICY "workspace_partners_insert" ON workspace_partners
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace_partners_update" ON workspace_partners;
CREATE POLICY "workspace_partners_update" ON workspace_partners
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace_partners_delete" ON workspace_partners;
CREATE POLICY "workspace_partners_delete" ON workspace_partners
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
