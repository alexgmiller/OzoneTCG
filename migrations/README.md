# Migrations

Migrations are plain SQL files applied **manually** in the Supabase SQL editor.
That means the repo can drift from the live database — a migration can be
committed but never run (this happened with `card_images`: code queried it for
months while the table didn't exist). Until we adopt the Supabase CLI, this
file is the source of truth for what has been applied.

## Rules

1. **New migration** → add a file `YYYYMMDD_name.sql`, add a row to the table
   below with status ⬜.
2. **After running it** in the SQL editor → flip the row to ✅ in the same PR/commit.
3. Every migration must be idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`,
   `DROP POLICY IF EXISTS` before `CREATE POLICY`) so re-running is always safe.

## Applied status

| Migration | Applied | Notes |
|---|---|---|
| `20240408_trade_chain.sql` | ✅ | items cost-basis columns + card_transactions |
| `20240415_sealed_products.sql` | ✅ | |
| `20240416_missing_item_columns.sql` | ✅ | |
| `20240420_card_images.sql` | ✅ | verified 2026-10-14 (table exists). Backfill via `scripts/import-card-images.ts` if images are missing. |
| `20240421_card_search_freq.sql` | ✅ | applied 2026-10-14 |
| `20240422_show_scans_client_id.sql` | ✅ | |
| `20240422_tax_deductible_expenses.sql` | ✅ | verified 2026-10-14 (columns exist) |
| `20240423_client_id_dedup.sql` | ✅ | verified 2026-10-14 (show_scans.client_id exists) |
| `20240424_business_structure.sql` | ✅ | verified 2026-10-14 (workspace_partners exists). business_structure is no longer read by the app. |
| `20240425_expense_documentation.sql` | ✅ | verified 2026-10-14 (columns exist) |
| `20240426_mileage_helpers.sql` | ✅ | verified 2026-10-14 (workspace_saved_locations exists) |
| `20240427_shows_calendar.sql` | ✅ | applied 2026-10-14. **Tables dropped 2026-11-16** by `20261116_drop_shows_calendar.sql`; kept for history only. |
| `20260720_market_signals.sql` | ✅ | sold_comps + pop_snapshots + RLS + prune fn (applied 2026-07-21) |
| `20260720_card_embeddings.sql` | ✅ | pgvector + match_card RPC (applied 2026-07-20) |
| `20260721_scan_photos.sql` | ✅ | scan photo persistence for recognition training data (applied 2026-07-21) |
| `20261013_internal_v1.sql` | ✅ | Drops guest_pins, scan_photos, card_embeddings (+ match_card), pop_snapshots. Take the backups at the top first; delete the scan-photos bucket in the dashboard (SQL can't). After running, those tables will show MISSING in the check below — expected. Applied 2026-10-14; the scan-photos bucket was confirmed gone 2026-11-16. |
| `20261013_pos.sql` | ✅ | applied 2026-10-14. card_transactions payment_method/counterparty/show_session_id/client_id/paid_by/sale_price; deal_logs.transaction_id. Optional commented backfill of legacy deals into the ledger at the bottom. |
| `20261016_inventory_snapshots.sql` | ✅ | applied 2026-11-16 (optional backfill skipped). Home value chart. One row per workspace per day (total_fmv, total_cost, item_count), written by the 03:00 refresh-prices cron after it updates prices. Days without a snapshot are estimated from item acquired/sold dates at today's prices (`valueHistory` in `app/protected/dashboard/home.ts`). |
| `20261116_drop_shows_calendar.sql` | ✅ | applied 2026-11-16 (check returned no rows). Drops card_shows, scraper_runs and workspace_bookmarked_shows; nothing used them after internal-v1. show_sessions is untouched. |
| `20261116_card_art.sql` | ✅ | applied 2026-11-16 (table confirmed present). Card art memory: one image per card (key = language + name + set + number, lib/cardArtMatch.ts → cardKey), reused for every copy. Manual images always win. |
| `20261117_item_price_history.sql` | ⬜ | One row per inventory item per day (market after the 03:00 refresh-prices cron), for the price charts in Inventory's item detail and Search's card sheet. Optional first-point insert at the bottom. |
| `20261117_tcgplayer_cards.sql` | ⬜ | TCGplayer catalog (via TCGCSV) for Search's Japanese tab: English names, rarity, number, image, prices per printing. Filled daily by `/api/cron/sync-tcgplayer`; run that once by hand after applying (Vercel → Cron Jobs → Run) so the tab isn't empty until the next night. |
| `20261116_item_market_source.sql` | ✅ | applied 2026-11-16. items.market_source + market_updated_at: where each market price came from and when, stamped by the nightly price jobs (lib/marketSource.ts). Inventory shows it and filters on it; eBay asking prices get re-estimated nightly. The app skips the columns until this is applied. |

> If a ✅/⬜ above is wrong, fix it — an inaccurate table is worse than none.

## Verify against the live database

Paste this in the SQL editor to check which expected tables actually exist:

```sql
SELECT t.expected,
       CASE WHEN c.table_name IS NULL THEN 'MISSING' ELSE 'ok' END AS status
FROM (VALUES
  ('card_transactions'), ('card_images'), ('card_search_frequency'),
  ('sold_comps'), ('pop_snapshots'), ('card_embeddings'), ('scan_photos'),
  ('workspace_partners'), ('workspace_saved_locations'), ('inventory_snapshots'), ('card_art')
) AS t(expected)
LEFT JOIN information_schema.tables c
  ON c.table_schema = 'public' AND c.table_name = t.expected
ORDER BY status DESC, t.expected;
```

Column-only migrations (expenses, POS) do not show up above. Paste this to
check them — every row should say ok:

```sql
SELECT t.tbl || '.' || t.col AS expected,
       CASE WHEN c.column_name IS NULL THEN 'MISSING' ELSE 'ok' END AS status,
       t.migration
FROM (VALUES
  ('expenses', 'category', '20240422_tax_deductible_expenses'),
  ('expenses', 'mileage_miles', '20240422_tax_deductible_expenses'),
  ('show_scans', 'client_id', '20240423_client_id_dedup'),
  ('expenses', 'documentation_type', '20240425_expense_documentation'),
  ('card_transactions', 'payment_method', '20261013_pos'),
  ('card_transactions', 'counterparty', '20261013_pos'),
  ('card_transactions', 'show_session_id', '20261013_pos'),
  ('card_transactions', 'client_id', '20261013_pos'),
  ('card_transactions', 'paid_by', '20261013_pos'),
  ('card_transactions', 'sale_price', '20261013_pos'),
  ('deal_logs', 'transaction_id', '20261013_pos'),
  ('items', 'market_source', '20261116_item_market_source'),
  ('items', 'market_updated_at', '20261116_item_market_source')
) AS t(tbl, col, migration)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = t.tbl AND c.column_name = t.col
ORDER BY status DESC, t.migration, t.col;
```

## Longer term

Adopt the Supabase CLI (`supabase migration new` / `supabase db push`) so
applied state is tracked in the database itself and this file can be deleted.
