-- Market signal tables: run this in the Supabase SQL editor
-- Adds sold_comps (momentum windows) and pop_snapshots (scarcity / grading ROI)
--
-- SCOPE: these are GLOBAL shared caches (like pokemon_cards / card_image_cache),
-- not workspace-scoped. Sold comps and PSA populations are identical market data
-- for every workspace, so workspaces share fetches instead of duplicating them.
-- fetched_by_workspace_id is attribution only (rate-limit accounting / debugging).
--
-- WRITE PATHS: server cron inserts with the service-role key (bypasses RLS);
-- clients may also insert at scan time under the authenticated INSERT policy.
-- Rows are append-only from clients — no UPDATE/DELETE policies exist.

-- ── sold_comps ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sold_comps (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Normalized pooling key: '<grader>|<card_id>|<grade>', e.g. 'psa|swsh7-215|10'.
  -- All sales of the same card at the same grade pool under one key; the
  -- 30d/90d momentum medians are computed over this pool.
  comp_key                text        NOT NULL,

  -- Specific slab's cert number, when the source listing exposed it.
  cert_number             text,

  sold_price              numeric     NOT NULL CHECK (sold_price > 0),
  sold_date               timestamptz NOT NULL,

  source                  text        NOT NULL,  -- 'ebay' | '130point' | ...

  -- Source's listing/sale id. Ingest with
  --   ON CONFLICT (source, external_id) DO NOTHING
  -- so re-fetches are idempotent. Sources without stable ids leave this null;
  -- for those, the fetcher should only request sales newer than its last fetch.
  external_id             text,

  fetched_by_workspace_id uuid        REFERENCES workspaces(id) ON DELETE SET NULL,
  fetched_at              timestamptz NOT NULL DEFAULT now()
);

-- Hot path: all comps for one key within a date range (momentum windows)
CREATE INDEX IF NOT EXISTS idx_sold_comps_key_date
  ON sold_comps (comp_key, sold_date DESC);

-- Resale history of a specific slab
CREATE INDEX IF NOT EXISTS idx_sold_comps_cert
  ON sold_comps (cert_number)
  WHERE cert_number IS NOT NULL;

-- Idempotent re-fetches: the same source listing is never inserted twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_sold_comps_source_external
  ON sold_comps (source, external_id)
  WHERE external_id IS NOT NULL;

-- ── pop_snapshots ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pop_snapshots (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Card identity in the grader's pop report: '<grader>|<card_id>',
  -- e.g. 'psa|swsh7-215'. Grade lives in its own column so growth for a
  -- single grade is one indexed range scan.
  pop_key                 text        NOT NULL,
  grade                   text        NOT NULL,  -- '10' | '9' | ... | 'auth'

  population              integer     NOT NULL CHECK (population >= 0),
  -- Population in grades above this one (PSA reports this directly);
  -- useful for grade-rarity context in grading ROI.
  higher_pop              integer     CHECK (higher_pop >= 0),

  snapshot_date           date        NOT NULL,
  source                  text        NOT NULL DEFAULT 'psa',

  fetched_by_workspace_id uuid        REFERENCES workspaces(id) ON DELETE SET NULL,
  fetched_at              timestamptz NOT NULL DEFAULT now(),

  -- One snapshot per key/grade/day. Upsert with
  --   ON CONFLICT (pop_key, grade, snapshot_date, source) DO UPDATE SET population = EXCLUDED.population
  -- so a same-day re-fetch refreshes rather than duplicates. The backing index
  -- also serves the hot query (pop_key, grade, snapshot_date range) — no
  -- separate index needed.
  UNIQUE (pop_key, grade, snapshot_date, source)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE sold_comps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pop_snapshots ENABLE ROW LEVEL SECURITY;

-- Read: any signed-in user (shared market data, nothing vendor-private in it)
DROP POLICY IF EXISTS sold_comps_select ON sold_comps;
CREATE POLICY sold_comps_select ON sold_comps
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS pop_snapshots_select ON pop_snapshots;
CREATE POLICY pop_snapshots_select ON pop_snapshots
  FOR SELECT TO authenticated
  USING (true);

-- Insert: signed-in users, but attribution (when set) must be a workspace
-- the user actually belongs to
DROP POLICY IF EXISTS sold_comps_insert ON sold_comps;
CREATE POLICY sold_comps_insert ON sold_comps
  FOR INSERT TO authenticated
  WITH CHECK (
    fetched_by_workspace_id IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = fetched_by_workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS pop_snapshots_insert ON pop_snapshots;
CREATE POLICY pop_snapshots_insert ON pop_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    fetched_by_workspace_id IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = fetched_by_workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- No UPDATE/DELETE policies: clients can't rewrite market history.
-- The service role bypasses RLS for backfills, corrections, and pruning.

-- ── Retention ─────────────────────────────────────────────────────────────────
-- Momentum only needs 90 days, but low-pop cards sell rarely, so keep a full
-- year of comps. Pop snapshots are tiny (one row per key/grade/day) — kept
-- indefinitely for long-horizon growth curves.
-- Wire this to pg_cron or the existing Vercel cron, e.g. monthly:
--   SELECT prune_sold_comps();
CREATE OR REPLACE FUNCTION prune_sold_comps(p_keep_days integer DEFAULT 365)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM sold_comps
  WHERE sold_date < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Pruning is a service-role/cron concern, not an end-user action
REVOKE EXECUTE ON FUNCTION prune_sold_comps(integer) FROM PUBLIC, anon, authenticated;
