import type { Mode } from "@/app/protected/pos/ledger";

export type TxRow = {
  id: string;
  card_id: string | null;
  card: { name: string } | null;
  transaction_type: string;
  trade_group_id: string | null;
  date: string;
  payment_method: string | null;
  counterparty: string | null;
  notes: string | null;
  show_session_id: string | null;
  paid_by: string | null;
  cash_paid: number | null;
  sale_price: number | null;
  market_price_at_time: number | null;
  cash_difference: number | null;
};

export type Deal = {
  id: string;
  mode: Mode;
  date: string;
  method: string | null;
  counterparty: string | null;
  notes: string | null;
  paidBy: string | null;
  showId: string | null;
  // buy: cash paid · sell: cash received · trade: cash difference (> 0 we paid)
  amount: number;
  cards: { name: string; direction: "in" | "out"; value: number | null }[];
  photos: string[];
};

// Folds per-card rows into one deal per trade_group_id (legacy rows stand alone)
export function groupDeals(rows: TxRow[], photos: Map<string, string[]>): Deal[] {
  const groups = new Map<string, TxRow[]>();
  for (const r of rows) {
    const key = r.trade_group_id ?? r.id;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups].map(([id, rs]) => {
    const types = new Set(rs.map((r) => r.transaction_type));
    const mode: Mode = types.has("buy") ? "buy" : types.has("sell") ? "sell" : "trade";
    const sum = (f: (r: TxRow) => number | null) => rs.reduce((s, r) => s + (f(r) ?? 0), 0);
    const lead = rs.find((r) => r.id === id) ?? rs[0];
    return {
      id, mode, date: lead.date,
      method: lead.payment_method, counterparty: lead.counterparty, notes: lead.notes,
      paidBy: lead.paid_by, showId: lead.show_session_id,
      amount: mode === "buy" ? sum((r) => r.cash_paid) : mode === "sell" ? sum((r) => r.sale_price) : lead.cash_difference ?? 0,
      cards: rs.map((r) => ({
        name: r.card?.name ?? "Deleted item",
        direction: r.transaction_type === "buy" || r.transaction_type === "trade_in" ? "in" : "out",
        value: r.transaction_type === "sell" ? r.sale_price : r.transaction_type === "buy" ? r.cash_paid : r.market_price_at_time,
      })),
      photos: rs.flatMap((r) => photos.get(r.id) ?? []),
    };
  });
}
