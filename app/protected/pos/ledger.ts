// Shared POS types and pure helpers (server actions live in actions.ts)

import { adjustForCondition, type ConditionFactors } from "@/lib/conditionPricing";

export const PAYMENT_METHODS = ["cash", "venmo", "zelle", "paypal", "cashapp", "trade", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type Payer = "alex" | "mila" | "shared";
export type Mode = "buy" | "sell" | "trade";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash", venmo: "Venmo", zelle: "Zelle", paypal: "PayPal",
  cashapp: "Cash App", trade: "Trade", other: "Other",
};

// Fields every deal carries; copied onto each card_transactions row
export type DealFields = {
  client_id?: string | null;
  show_session_id: string | null;
  payment_method: PaymentMethod | null;
  counterparty?: string | null;
  notes?: string | null;
};

// A card coming into inventory (bought, or received in a trade)
export type NewCard = {
  name: string;
  category: "single" | "slab" | "sealed";
  condition?: string;
  grade?: string | null;
  set_name?: string | null;
  card_number?: string | null;
  image_url?: string | null;
  cert_number?: string | null;
  market: number | null;
  owner?: Payer;
  cost?: number; // buy only: set on every card to skip the market-weighted split
};

export type BuyInput = DealFields & { paid_by: Payer; total: number; cards: NewCard[] };
export type SellInput = DealFields & { total: number; itemIds: string[]; prices?: Record<string, number> };
// cashDifference > 0: we pay the customer; < 0: the customer pays us
export type TradeInput = DealFields & {
  paid_by: Payer;
  goingOut: { itemId: string; value: number }[];
  comingIn: NewCard[];
  cashDifference: number;
};

// Inventory row shown in the Sell / Trade pickers
export type PickItem = {
  id: string;
  name: string;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  cert_number: string | null;
  market: number | null;
  cost: number | null;
  image_url: string | null;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Condition in the cart ──
// A single's price is looked up (or typed) as near mint. In a buy or trade
// its line carries a condition, and a played copy is priced at that near-mint
// price times the condition's factor, the same discount the nightly job uses
// (lib/conditionPricing.ts). Slabs and sealed are never adjusted.
export const CONDITIONS = [
  { value: "Near Mint", short: "NM" }, { value: "Lightly Played", short: "LP" },
  { value: "Moderately Played", short: "MP" }, { value: "Heavily Played", short: "HP" },
  { value: "Damaged", short: "DMG" },
] as const;
export type CardCondition = (typeof CONDITIONS)[number]["value"];

// The card as it is priced and recorded: market adjusted for its condition
export function pricedCard(c: NewCard, factors: ConditionFactors): NewCard {
  if (c.category !== "single" || c.market == null) return c;
  return { ...c, market: adjustForCondition(c.market, c.condition, factors) };
}

// Sets one line's condition (Near Mint is stored as unset, the default)
export function withCondition(cards: NewCard[], i: number, condition: CardCondition): NewCard[] {
  return cards.map((c, j) => (j === i ? { ...c, condition: condition === "Near Mint" ? undefined : condition } : c));
}

// Splits total across weights to the cent; rounding drift goes to the last share
export function allocate(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const shares = weights.map((w) =>
    round2(sum > 0 ? (total * Math.max(0, w)) / sum : total / weights.length));
  const drift = round2(total - shares.reduce((s, x) => s + x, 0));
  shares[shares.length - 1] = round2(shares[shares.length - 1] + drift);
  return shares;
}

// ── Bundle allocation ──
// One total across several items, in proportion to FMV and rounded to cents.
// Any rounding remainder goes to the highest-FMV auto item. Overridden lines
// are fixed; the rest re-balance over what is left. The result always sums
// to `total` exactly.
export type BundleLine = { id: string; market: number | null };

export function allocateBundle(total: number, lines: BundleLine[], overrides: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  if (lines.length === 0) return out;

  const fixed = lines.filter((l) => overrides[l.id] != null);
  const auto = lines.filter((l) => overrides[l.id] == null);
  for (const l of fixed) out[l.id] = round2(Math.max(0, overrides[l.id]));

  if (auto.length === 0) return out;
  const remaining = round2(total - fixed.reduce((s, l) => s + out[l.id], 0));

  const weights = auto.map((l) => Math.max(0, l.market ?? 0));
  const sum = weights.reduce((s, w) => s + w, 0);
  for (const [i, l] of auto.entries()) {
    out[l.id] = round2(sum > 0 ? (remaining * weights[i]) / sum : remaining / auto.length);
  }

  const drift = round2(remaining - auto.reduce((s, l) => s + out[l.id], 0));
  if (drift !== 0) {
    const top = auto.reduce((best, l) => ((l.market ?? 0) > (best.market ?? 0) ? l : best), auto[0]);
    out[top.id] = round2(out[top.id] + drift);
  }
  return out;
}
