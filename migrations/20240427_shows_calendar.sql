-- ── Shows Calendar ─────────────────────────────────────────────────────────────
--
-- Public card show aggregation. No RLS — this is shared reference data.
-- Sources: 'tcdb_scrape' | 'manual' | 'submitted'
--
-- Run in Supabase SQL Editor (Dashboard → SQL).

-- 1. card_shows ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS card_shows (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  start_date         date        NOT NULL,
  end_date           date        NOT NULL,
  venue_name         text,
  venue_address      text,
  city               text        NOT NULL,
  state              text        NOT NULL,
  country            text        NOT NULL DEFAULT 'US',
  latitude           numeric(9,6),
  longitude          numeric(9,6),
  website_url        text,
  description        text,
  is_major           boolean     NOT NULL DEFAULT false,
  source             text        NOT NULL,
  source_url         text,
  source_external_id text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_external_id)
);

CREATE INDEX IF NOT EXISTS idx_card_shows_dates
  ON card_shows(start_date);

CREATE INDEX IF NOT EXISTS idx_card_shows_state
  ON card_shows(state);

CREATE INDEX IF NOT EXISTS idx_card_shows_major
  ON card_shows(is_major)
  WHERE is_major = true;

-- 2. scraper_runs — lightweight run log for monitoring ─────────────────────────

CREATE TABLE IF NOT EXISTS scraper_runs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text        NOT NULL,
  shows_found    integer,
  shows_upserted integer,
  error          text,
  duration_ms    integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3. workspace_bookmarked_shows ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_bookmarked_shows (
  workspace_id uuid NOT NULL REFERENCES workspaces(id)  ON DELETE CASCADE,
  show_id      uuid NOT NULL REFERENCES card_shows(id)   ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, show_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarked_shows_workspace
  ON workspace_bookmarked_shows(workspace_id);

-- 4. RLS on workspace_bookmarked_shows ──────────────────────────────────────────

ALTER TABLE workspace_bookmarked_shows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookmarked_shows_select" ON workspace_bookmarked_shows;
CREATE POLICY "bookmarked_shows_select" ON workspace_bookmarked_shows
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "bookmarked_shows_insert" ON workspace_bookmarked_shows;
CREATE POLICY "bookmarked_shows_insert" ON workspace_bookmarked_shows
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "bookmarked_shows_delete" ON workspace_bookmarked_shows;
CREATE POLICY "bookmarked_shows_delete" ON workspace_bookmarked_shows
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
