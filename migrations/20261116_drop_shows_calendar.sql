-- Drop the obsolete show-calendar tables from 20240427_shows_calendar.sql.
-- Nothing in the app reads or writes them any more (the show scraper and
-- calendar browsing were removed in internal-v1). The user's own shows live
-- in show_sessions, which this does not touch.
--
-- Indexes and RLS policies go with their tables. Bookmarks reference
-- card_shows, so they are dropped first. Safe to re-run.
--
-- Applied in the Supabase SQL editor on 2026-11-16 (verified: the check
-- below returned no rows).

BEGIN;
DROP TABLE IF EXISTS workspace_bookmarked_shows;
DROP TABLE IF EXISTS card_shows;
DROP TABLE IF EXISTS scraper_runs;
COMMIT;

-- Check: should return no rows
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('card_shows', 'scraper_runs', 'workspace_bookmarked_shows');
