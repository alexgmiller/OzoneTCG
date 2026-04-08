-- Trade chain tracking: run this in the Supabase SQL editor
-- Adds cost basis / acquisition metadata to items and creates card_transactions

-- ── items: new columns ────────────────────────────────────────────────────────
ALTER TABLE items ADD COLUMN IF NOT EXISTS cost_basis            numeric;
ALTER TABLE items ADD COLUMN IF NOT EXISTS buy_percentage        numeric;
ALTER TABLE items ADD COLUMN IF NOT EXISTS acquisition_type      text;      -- 'buy' | 'trade' | 'pull'
ALTER TABLE items ADD COLUMN IF NOT EXISTS chain_depth           integer NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS original_cash_invested numeric;

-- ── card_transactions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_transactions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid        NOT NULL,

  -- The card this transaction belongs to (null if item later deleted)
  card_id              uuid        REFERENCES items(id) ON DELETE SET NULL,

  -- 'buy' | 'trade_in' | 'trade_out'
  transaction_type     text        NOT NULL,

  -- Groups all cards in a single trade event (same value for all ins/outs of one trade)
  trade_group_id       uuid,

  date                 timestamptz NOT NULL DEFAULT now(),

  -- Common
  market_price_at_time numeric,
  cost_basis           numeric,
  chain_depth          integer     NOT NULL DEFAULT 0,

  -- Buy-specific
  buy_percentage       numeric,
  cash_paid            numeric,

  -- Trade-specific
  trade_percentage     numeric,    -- % credit given on this card (trade_in only)
  trade_credit_value   numeric,    -- dollar value of trade credit (trade_in only)
  cash_difference      numeric,    -- net cash paid by vendor for the whole trade (stored on each record for reference)

  -- Links previous card in chain (for trade_in: what card was given away to get this one)
  previous_card_id     uuid        REFERENCES items(id) ON DELETE SET NULL,

  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_tx_card_id     ON card_transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_card_tx_workspace   ON card_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_card_tx_trade_group ON card_transactions(trade_group_id);
CREATE INDEX IF NOT EXISTS idx_card_tx_prev_card   ON card_transactions(previous_card_id);
