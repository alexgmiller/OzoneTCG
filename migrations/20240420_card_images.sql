-- ── card_images: authoritative image store ────────────────────────────────────
-- Covers English, Japanese, and Chinese singles, slabs, and sealed products.
-- Sits above the existing card_image_cache + pokemontcg.io fallback chain.

CREATE TABLE IF NOT EXISTS card_images (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_name     text        NOT NULL,
  set_name      text        NOT NULL,
  card_number   text,
  language      text        NOT NULL DEFAULT 'English',  -- 'English', 'Japanese', 'Chinese'
  category      text        NOT NULL DEFAULT 'single',   -- 'single', 'slab', 'sealed'
  variant       text,        -- 'Normal', 'Holo', 'Reverse Holo', '1st Edition', 'Full Art', etc.
  product_type  text,        -- sealed only: 'booster_box', 'etb', 'booster_bundle', etc.
  grading_company text,      -- slab only: 'PSA', 'BGS', 'CGC', 'TAG'
  image_url     text        NOT NULL,
  thumbnail_url text,
  source        text,        -- 'pokemontcg.io', 'tcgdex', 'manual_upload', 'tcgplayer', 'ebay'
  verified      boolean     NOT NULL DEFAULT false,
  flagged       boolean     NOT NULL DEFAULT false,
  flag_count    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (card_name, set_name, card_number, language, category, variant)
);

-- Fast lookups by set + number (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_card_images_lookup
  ON card_images (lower(set_name), card_number, language, category);

-- Fast lookups by name (for fallback/fuzzy searches)
CREATE INDEX IF NOT EXISTS idx_card_images_name
  ON card_images (lower(card_name));

-- Partial indexes for admin queue views
CREATE INDEX IF NOT EXISTS idx_card_images_flagged
  ON card_images (flagged) WHERE flagged = true;

CREATE INDEX IF NOT EXISTS idx_card_images_unverified
  ON card_images (verified, source) WHERE verified = false;

-- ── Trigger: keep updated_at current ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_card_images_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_card_images_updated_at ON card_images;
CREATE TRIGGER trg_card_images_updated_at
  BEFORE UPDATE ON card_images
  FOR EACH ROW EXECUTE FUNCTION set_card_images_updated_at();

-- ── RPC: increment flag count atomically ─────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_image_flag_count(image_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE card_images
  SET flag_count = flag_count + 1,
      flagged    = true
  WHERE id = image_id;
END;
$$;

-- ── items: add image_flagged for per-item report flow ─────────────────────────

ALTER TABLE items ADD COLUMN IF NOT EXISTS image_flagged boolean NOT NULL DEFAULT false;
