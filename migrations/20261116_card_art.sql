-- Card art memory: one image per physical card, reused for every copy.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- card_key is lib/cardArtMatch.ts → cardKey(): "lang|name|set|number", so
-- "Sun & Moon Promo" and "SM Black Star Promos" spellings of one card share a
-- row. source 'manual' = an image a person set (always wins); the others are
-- automatic finds, which never replace a manual one.
--
-- Global like pokemon_cards / card_image_cache: rows describe cards, not a
-- workspace's inventory. Writes come from server code with the service role.

CREATE TABLE IF NOT EXISTS card_art (
  card_key     text        PRIMARY KEY,
  name         text        NOT NULL,
  set_name     text,
  card_number  text,
  image_url    text        NOT NULL,
  source       text        NOT NULL
               CHECK (source IN ('manual', 'tcgdex', 'tcgplayer', 'pokemontcg', 'catalog')),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE card_art ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_art_select" ON card_art;
CREATE POLICY "card_art_select" ON card_art
  FOR SELECT TO authenticated USING (true);
