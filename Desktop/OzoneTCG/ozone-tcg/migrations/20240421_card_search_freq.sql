CREATE TABLE IF NOT EXISTS card_search_frequency (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  card_identifier  text        NOT NULL,
  card_name        text        NOT NULL,
  count            integer     NOT NULL DEFAULT 1,
  last_used        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, card_identifier)
);

CREATE INDEX IF NOT EXISTS idx_card_search_freq_workspace
  ON card_search_frequency(workspace_id);

-- ── RPC: atomic upsert + count increment + prune in one round-trip ────────────

CREATE OR REPLACE FUNCTION record_card_search(
  p_workspace_id   uuid,
  p_card_identifier text,
  p_card_name      text,
  p_cap            integer DEFAULT 500
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO card_search_frequency (workspace_id, card_identifier, card_name, count, last_used)
  VALUES (p_workspace_id, p_card_identifier, p_card_name, 1, now())
  ON CONFLICT (workspace_id, card_identifier)
  DO UPDATE SET
    count     = card_search_frequency.count + 1,
    last_used = now(),
    card_name = EXCLUDED.card_name;

  -- Prune oldest entries when workspace exceeds the cap
  DELETE FROM card_search_frequency
  WHERE workspace_id = p_workspace_id
    AND id IN (
      SELECT id FROM card_search_frequency
      WHERE workspace_id = p_workspace_id
      ORDER BY last_used ASC
      OFFSET p_cap
    );
END;
$$;
