-- Drop card_scans: raw-card photo scanning was removed on 2026-11-19.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Scanning is for slabs only (the cert scanner); raw cards are found by
-- typing in Search. card_scans (20261120_card_scans.sql) only logged photo
-- scans and counted the PokeInvest key's daily scan cap, so nothing reads or
-- writes it any more.
--
-- Optional backup first, if you want the scan log:
-- create table if not exists _backup_20261120_card_scans as table card_scans;

drop table if exists card_scans;

-- Check: no rows should come back
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'card_scans';
