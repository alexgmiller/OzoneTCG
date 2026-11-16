-- TCGplayer card catalog (via TCGCSV) for Search's Japanese tab.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- TCGplayer lists Japanese cards under English names ("Charizard ex"), with
-- rarity, number, image and prices, which is what Search needs; TCGdex's
-- Japanese catalog (pokemon_cards, language 'ja') uses Japanese names.
-- /api/cron/sync-tcgplayer fills this daily from TCGCSV (lib/catalog/syncTcgplayer.ts).
--
--   product_id  TCGplayer product id (also the key TCGCSV prices use)
--   set_name    TCGplayer group name without its code ("Pokemon Card 151")
--   set_code    the group's code ("SV2a")
--   market      the primary printing's market price (lib/tcgplayerMatch.ts → toQuote)
--   printings   [{ name, market, low }] per printing, primary first
--
-- Global like pokemon_cards / card_art: rows describe cards, not a
-- workspace's inventory. Writes come from server code with the service role.

CREATE TABLE IF NOT EXISTS tcgplayer_cards (
  product_id   bigint      PRIMARY KEY,
  lang         text        NOT NULL CHECK (lang IN ('en', 'ja')),
  group_id     integer     NOT NULL,
  set_name     text        NOT NULL,
  set_code     text,
  name         text        NOT NULL,
  card_number  text,
  rarity       text,
  image_url    text,
  url          text,
  market       numeric(12, 2),
  printings    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tcgplayer_cards_lang_group ON tcgplayer_cards (lang, group_id);

ALTER TABLE tcgplayer_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tcgplayer_cards_select" ON tcgplayer_cards;
CREATE POLICY "tcgplayer_cards_select" ON tcgplayer_cards
  FOR SELECT TO authenticated USING (true);
