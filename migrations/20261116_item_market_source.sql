-- Where each item's market price came from, and when.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- The nightly price jobs stamp these when they write items.market:
--   market_source      justtcg | tcgplayer | tcgdex | pokemonpricetracker | ebay_asking
--   market_updated_at  when that price was written
-- Inventory shows them on the item ("TCGplayer · 3 hr ago"), filters on them
-- ("eBay asking"), and the 03:00 job re-estimates eBay asking prices nightly
-- instead of keeping the first one forever. Prices typed or prefilled when an
-- item is added have no source (null) until a nightly job prices the item.
--
-- The app works before this is applied: it checks for the columns and skips
-- them when they're missing.

alter table items add column if not exists market_source text;
alter table items add column if not exists market_updated_at timestamptz;

-- Check: both rows should come back
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'items'
  and column_name in ('market_source', 'market_updated_at');
