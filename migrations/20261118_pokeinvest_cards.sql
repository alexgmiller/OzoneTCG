-- PokeInvest prices per card, for slab values (lib/pokeinvestSlabs.ts).
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- One row per card, holding every grade PokeInvest prices, so slabs of one
-- card at different grades share a single API call. card_key is the card part
-- of slab_prices.lookup_key: "name|set|number" (lib/pokeinvestSlabs.ts →
-- slabCardKey).
--
-- Written by the 02:30 refresh-stale-slabs cron with the service role, which
-- refetches a card's prices every 3 days. pokeinvest_id is null when no match
-- was found; checked_at says when it last tried (it retries weekly).
--
-- Global like card_art / slab_prices: rows describe cards, not a workspace's
-- inventory. The app works before this is applied (slabs keep eBay values).

create table if not exists pokeinvest_cards (
  card_key       text        primary key,
  pokeinvest_id  text,
  tcgplayer_id   text,
  matched_by     text        check (matched_by in ('tcgplayer', 'search')),
  name           text,
  set_name       text,
  page_url       text,
  -- PokeInvest's /api/prices answer: { median_usd, sales, window_days, … }
  ungraded       jsonb,
  -- [{ grader, grade, median_usd, sales, window_days, … }]
  graded         jsonb       not null default '[]'::jsonb,
  fetched_at     timestamptz,
  checked_at     timestamptz not null default now()
);

alter table pokeinvest_cards enable row level security;

drop policy if exists "pokeinvest_cards_select" on pokeinvest_cards;
create policy "pokeinvest_cards_select" on pokeinvest_cards
  for select to authenticated using (true);

-- Check: one row should come back
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'pokeinvest_cards';
