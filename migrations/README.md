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
| `20240420_card_images.sql` | ⬜ | **NOT APPLIED — lib/cardImages.ts queries fail silently until this runs.** Run it, then backfill via `scripts/import-card-images.ts`. |
| `20240421_card_search_freq.sql` | ✅ | |
| `20240422_show_scans_client_id.sql` | ✅ | |
| `20240422_tax_deductible_expenses.sql` | ❓ | Unverified — arrived with the April WIP merge. expenses category/deductible/mileage columns |
| `20240423_client_id_dedup.sql` | ❓ | Unverified. show_scans.client_id (overlaps 20240422_show_scans_client_id) |
| `20240424_business_structure.sql` | ❓ | Unverified. workspaces business_* columns + workspace_partners |
| `20240425_expense_documentation.sql` | ❓ | Unverified. expenses documentation_* columns |
| `20240426_mileage_helpers.sql` | ❓ | Unverified. home/venue addresses + workspace_saved_locations |
| `20240427_shows_calendar.sql` | ❓ | Unverified. card_shows + scraper_runs + workspace_bookmarked_shows. **Obsolete** — the TCDB scraper and shows-calendar page were removed in internal-v1; no need to run. |
| `20260720_market_signals.sql` | ✅ | sold_comps + pop_snapshots + RLS + prune fn (applied 2026-07-21) |
| `20260720_card_embeddings.sql` | ✅ | pgvector + match_card RPC (applied 2026-07-20) |
| `20260721_scan_photos.sql` | ✅ | scan photo persistence for recognition training data (applied 2026-07-21) |
| `20261013_internal_v1.sql` | ⬜ | Drops guest_pins, scan_photos, card_embeddings (+ match_card), pop_snapshots. Take the backups at the top first; delete the scan-photos bucket in the dashboard (SQL can't). After running, those tables will show MISSING in the check below — expected. |
| `20261013_pos.sql` | ⬜ | **Required before POS works.** card_transactions payment_method/counterparty/show_session_id/client_id/paid_by/sale_price; deal_logs.transaction_id. Optional commented backfill of legacy deals into the ledger at the bottom. |

> If a ✅/⬜ above is wrong, fix it — an inaccurate table is worse than none.
> ❓ = not yet checked against the live database; run the query below and flip to ✅ or ⬜.

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

## Longer term

Adopt the Supabase CLI (`supabase migration new` / `supabase db push`) so
applied state is tracked in the database itself and this file can be deleted.
