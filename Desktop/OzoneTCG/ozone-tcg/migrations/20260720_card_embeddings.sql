-- Card embedding vectors for nearest-neighbor card recognition
-- Run in the Supabase SQL editor.
--
-- No FK to an image table on purpose: embeddings are keyed to card identity
-- (card_id → pokemon_cards.id); source_image_id is provenance only and may
-- point at card_images OR card_image_cache rows depending on where the
-- reference image came from. This also means the migration runs regardless
-- of whether 20240420_card_images.sql has been applied yet.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS card_embeddings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- pokemon_cards.id — the identity this vector resolves to.
  -- Plain uuid (no FK) so embeddings for slabs/sealed/manual images that
  -- lack a pokemon_cards row aren't blocked; enforce integrity in ingest.
  card_id         uuid        NOT NULL,

  -- Provenance: which image row this vector was encoded from (optional).
  source_image_id uuid,
  source_table    text,       -- 'card_images' | 'card_image_cache' | 'scan_photo'

  -- 'reference' = clean catalog scan, 'scan_photo' = real confirmed photo
  kind            text        NOT NULL DEFAULT 'reference',

  -- e.g. 'dinov2-s-v1', 'mnv3-ft-v2' — lets a re-embed under a new model
  -- coexist with the old vectors and flip atomically at query time.
  model_version   text        NOT NULL,

  embedding       vector(384) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ANN search (cosine)
CREATE INDEX IF NOT EXISTS idx_card_embeddings_hnsw
  ON card_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_card_embeddings_version
  ON card_embeddings (model_version);

CREATE INDEX IF NOT EXISTS idx_card_embeddings_card
  ON card_embeddings (card_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Global shared cache (same reasoning as sold_comps/pop_snapshots): read for
-- any signed-in user; writes come from the embedding scripts / server via the
-- service-role key, which bypasses RLS. No client write policies.
ALTER TABLE card_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_embeddings_select ON card_embeddings;
CREATE POLICY card_embeddings_select ON card_embeddings
  FOR SELECT TO authenticated
  USING (true);

-- ── RPC: card-level nearest-neighbor match ────────────────────────────────────
-- Aggregates image-level hits to card level (a card may have several vectors:
-- its reference scan plus confirmed real photos). Returns cosine similarity
-- in [0,1]-ish range (1 = identical direction).
CREATE OR REPLACE FUNCTION match_card(
  query_embedding vector(384),
  p_model_version text,
  top_k           int DEFAULT 5
)
RETURNS TABLE (card_id uuid, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT ce.card_id,
         MAX(1 - (ce.embedding <=> query_embedding)) AS similarity
  FROM card_embeddings ce
  WHERE ce.model_version = p_model_version
  GROUP BY ce.card_id
  ORDER BY similarity DESC
  LIMIT top_k;
$$;
