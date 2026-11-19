-- Price history per card from PokeInvest, for back-filling slab charts
-- (lib/pokeinvestHistory.ts). Run in the Supabase SQL editor. Safe to re-run.
--
-- history     { "PSA 10": [{ "date": "2024-03-10", "price": 138 }, …], … }:
--             every grade's price since 2022, one point per change
-- history_at  when it was fetched (once per card; nightly points carry on
--             from there)
--
-- The 02:30 refresh-stale-slabs cron fills these (at most 10 cards a night)
-- and writes the matching points into item_price_history for every slab
-- PokeInvest prices. Until this is applied that step skips itself.

alter table pokeinvest_cards add column if not exists history jsonb;
alter table pokeinvest_cards add column if not exists history_at timestamptz;

-- Check: both rows should come back
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'pokeinvest_cards'
  and column_name in ('history', 'history_at');
