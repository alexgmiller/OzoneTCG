-- One row per card scan (lib/cardScan.ts, app/api/scan-card).
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Scans go to PokeInvest's free keyless identify first (about 60 a day) and
-- only fall back to the API key when that's used up. Key scans count against
-- the same 1,000 calls a month as pricing, so they're capped per day; this
-- table is how the cap is counted. It also records what was scanned.
--
-- via          'free' (keyless) or 'key' (spent one of the key's calls)
-- best_id/name PokeInvest's top match, when there was one
--
-- Until this is applied, scanning still works but only keyless.

create table if not exists card_scans (
  id            bigserial    primary key,
  workspace_id  uuid         not null references workspaces(id) on delete cascade,
  created_at    timestamptz  not null default now(),
  via           text         not null check (via in ('free', 'key')),
  best_id       text,
  best_name     text
);

create index if not exists idx_card_scans_created on card_scans (created_at);

alter table card_scans enable row level security;

drop policy if exists "card_scans_select" on card_scans;
create policy "card_scans_select" on card_scans
  for select using (
    workspace_id in (select workspace_id from workspace_members where user_id = auth.uid())
  );

-- Check: one row should come back
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'card_scans';
