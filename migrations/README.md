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
| `20240427_shows_calendar.sql` | ✅ | applied (tables exist, verified 2026-10-14). **Obsolete** — nothing reads card_shows / scraper_runs / workspace_bookmarked_shows any more; safe to drop later. |
| `20260720_market_signals.sql` | ✅ | sold_comps + pop_snapshots + RLS + prune fn (applied 2026-07-21) |
| `20260720_card_embeddings.sql` | ✅ | pgvector + match_card RPC (applied 2026-07-20) |
| `20260721_scan_photos.sql` | ✅ | scan photo persistence for recognition training data (applied 2026-07-21) |
| `20261013_internal_v1.sql` | ✅ | Drops guest_pins, scan_photos, card_embeddings (+ match_card), pop_snapshots. Take the backups at the top first; delete the scan-photos bucket in the dashboard (SQL can't). After running, those tables will show MISSING in the check below — expected. | (applied 2026-10-14; bucket still to delete in the dashboard)
| `20261013_pos.sql` | ✅ | applied 2026-10-14. card_transactions payment_method/counterparty/show_session_id/client_id/paid_by/sale_price; deal_logs.transaction_id. Optional commented backfill of legacy deals into the ledger at the bottom. |

> If a ✅/⬜ above is wrong, fix it — an inaccurate table is worse than none.

## Verify against the live database

Paste this in the SQL editor to check which expected tables actually exist:

```sql
SELECT t.expected,
       CASE WHEN c.table_name IS NULL THEN 'MISSING' ELSE 'ok' END AS status
FROM (VALUES
  ('card_transactions'), ('card_images'), ('card_search_frequency'),
  ('sold_comps'), ('pop_snapshots'), ('card_embeddings'), ('scan_photos'),
  ('workspace_partners'), ('workspace_saved_locations'), ('card_shows'),
  ('scraper_runs'), ('workspace_bookmarked_shows')
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
  ('deal_logs', 'transaction_id', '20261013_pos')
) AS t(tbl, col, migration)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = t.tbl AND c.column_name = t.col
ORDER BY status DESC, t.migration, t.col;
```

## Longer term

Adopt the Supabase CLI (`supabase migration new` / `supabase db push`) so
applied state is tracked in the database itself and this file can be deleted.
