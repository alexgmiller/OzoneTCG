-- Internal-only v1: drop storage for features removed in Phase 1
-- (guest mode, OCR/vision scanner, card embeddings, PSA pop snapshots).
--
-- NOT YET RUN. Review, take backups, then run in the Supabase SQL editor.
-- Idempotent: safe to re-run.

-- ── Backups (uncomment and run first if you want to keep the data) ──────────
-- Each copies the table into a plain backup table in the same schema.
--
-- CREATE TABLE IF NOT EXISTS _backup_20261013_guest_pins      AS TABLE guest_pins;
-- CREATE TABLE IF NOT EXISTS _backup_20261013_scan_photos     AS TABLE scan_photos;
-- CREATE TABLE IF NOT EXISTS _backup_20261013_card_embeddings AS TABLE card_embeddings;
-- CREATE TABLE IF NOT EXISTS _backup_20261013_pop_snapshots   AS TABLE pop_snapshots;
--
-- Row counts, to sanity-check before and after:
-- SELECT 'guest_pins' t, count(*) FROM guest_pins
-- UNION ALL SELECT 'scan_photos', count(*) FROM scan_photos
-- UNION ALL SELECT 'card_embeddings', count(*) FROM card_embeddings
-- UNION ALL SELECT 'pop_snapshots', count(*) FROM pop_snapshots;

-- ── Guest mode ───────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS guest_pins;

-- ── OCR / vision scanner ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS scan_photos;

DROP FUNCTION IF EXISTS match_card(vector, text, int);
DROP TABLE IF EXISTS card_embeddings;
-- The pgvector extension is left installed; drop it only if nothing else uses it:
-- DROP EXTENSION IF EXISTS vector;

-- ── PSA pop snapshots (sold_comps stays) ─────────────────────────────────────
DROP TABLE IF EXISTS pop_snapshots;

-- ── scan-photos storage bucket ───────────────────────────────────────────────
-- Not SQL: Supabase blocks deletes on storage.objects AND storage.buckets
-- ("Direct deletion from storage tables is not allowed"). Delete it in
-- Dashboard → Storage → scan-photos → Empty bucket, then Delete bucket.
