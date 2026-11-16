-- POS consolidation: every buy, sell and trade is a group of card_transactions
-- rows sharing trade_group_id. The first row's id equals trade_group_id, so
-- one id names the whole deal. Photos hang off that lead row via deal_logs.
--
-- NOT YET RUN. Idempotent: safe to re-run.

-- ── card_transactions: deal-level fields ─────────────────────────────────────
-- Copied onto every row of a deal. client_id is set on the lead row only and
-- dedupes offline replays. 'sell' joins 'buy' | 'trade_in' | 'trade_out'.
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS counterparty   text;
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS notes          text;
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS show_session_id uuid
  REFERENCES show_sessions(id) ON DELETE SET NULL;
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS client_id      uuid;
-- Who fronted the cash on a buy / trade cash-out; feeds partner payout
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS paid_by        text;
-- Per-card sale price on 'sell' rows
ALTER TABLE card_transactions ADD COLUMN IF NOT EXISTS sale_price     numeric;

ALTER TABLE card_transactions DROP CONSTRAINT IF EXISTS card_transactions_payment_method_check;
ALTER TABLE card_transactions ADD CONSTRAINT card_transactions_payment_method_check
  CHECK (payment_method IN ('cash','venmo','zelle','paypal','cashapp','trade','other'));

ALTER TABLE card_transactions DROP CONSTRAINT IF EXISTS card_transactions_paid_by_check;
ALTER TABLE card_transactions ADD CONSTRAINT card_transactions_paid_by_check
  CHECK (paid_by IN ('alex','mila','shared'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_tx_client_id
  ON card_transactions(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_tx_show    ON card_transactions(show_session_id);
CREATE INDEX IF NOT EXISTS idx_card_tx_date    ON card_transactions(workspace_id, date DESC);

-- ── deal_logs: photos belong to a transaction ────────────────────────────────
ALTER TABLE deal_logs ADD COLUMN IF NOT EXISTS transaction_id uuid
  REFERENCES card_transactions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_deal_logs_tx ON deal_logs(transaction_id);

-- Required for every new row. NOT VALID skips the legacy rows from the old
-- Photos page, which have no transaction. To enforce on all rows later:
--   DELETE FROM deal_logs WHERE transaction_id IS NULL;  -- after exporting them
--   ALTER TABLE deal_logs VALIDATE CONSTRAINT deal_logs_transaction_required;
ALTER TABLE deal_logs DROP CONSTRAINT IF EXISTS deal_logs_transaction_required;
ALTER TABLE deal_logs ADD CONSTRAINT deal_logs_transaction_required
  CHECK (transaction_id IS NOT NULL) NOT VALID;

-- ── Optional backfill: legacy deals into the ledger ──────────────────────────
-- Before POS, Show Mode and quick sells only updated items, so those deals are
-- missing from card_transactions and won't show in the Transactions ledger.
-- These inserts add one row per card, tagged '[backfilled]', skipping any card
-- that already has a matching row. Review the SELECTs first; run if wanted.
--
-- Sold cards with no sell / trade_out row:
-- INSERT INTO card_transactions
--   (workspace_id, card_id, transaction_type, trade_group_id, date,
--    sale_price, market_price_at_time, cost_basis, notes)
-- SELECT i.workspace_id, i.id, 'sell', COALESCE(i.sale_id, i.id),
--        COALESCE(i.sold_at, i.created_at),
--        i.sold_price, i.market, COALESCE(i.cost_basis, i.cost), '[backfilled]'
-- FROM items i
-- WHERE i.status = 'sold'
--   AND NOT EXISTS (SELECT 1 FROM card_transactions t
--                   WHERE t.card_id = i.id AND t.transaction_type IN ('sell','trade_out'));
--
-- Bought cards with no buy row (acquisition_type 'buy' or linked to a buy expense):
-- INSERT INTO card_transactions
--   (workspace_id, card_id, transaction_type, trade_group_id, date,
--    cash_paid, cost_basis, market_price_at_time, buy_percentage, notes)
-- SELECT i.workspace_id, i.id, 'buy', COALESCE(i.buy_expense_id, i.id),
--        COALESCE(i.acquired_date, i.created_at),
--        i.cost, i.cost, COALESCE(i.acquired_market_price, i.market), i.buy_percentage, '[backfilled]'
-- FROM items i
-- WHERE (i.acquisition_type = 'buy' OR i.buy_expense_id IS NOT NULL)
--   AND NOT EXISTS (SELECT 1 FROM card_transactions t
--                   WHERE t.card_id = i.id AND t.transaction_type = 'buy');
