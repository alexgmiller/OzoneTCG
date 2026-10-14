// Shared POS types and pure helpers (server actions live in actions.ts)

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
