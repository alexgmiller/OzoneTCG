// Pure helpers for the Home page: today's totals, recent deals, relative time.
// No React or Supabase here so everything is unit-testable.

// ── Types ──

export type TxRow = {
  id: string;
  trade_group_id: string | null;
  // 'buy' | 'sell' | 'trade_in' | 'trade_out' (legacy rows may carry other values)
  transaction_type: string;
  date: string;
  sale_price: number | null;
  cash_paid: number | null;
  cost_basis: number | null;
  cash_difference: number | null;
  payment_method?: string | null;
  // Present only when the query joins items for the card name / art
  card?: { name: string; image_url?: string | null } | null;
};

export type DealMode = "buy" | "sell" | "trade";

export type TodayTotals = {
  revenue: number;
  profit: number;
  spent: number;
  deals: number;
  cardsSold: number;
  cardsBought: number;
};

export type RecentDeal = {
  id: string;
  mode: DealMode;
  date: string;
  cardCount: number;
  firstName: string | null;
  imageUrl: string | null;
  method: string | null;
  // Signed cash from our side: sells positive, buys negative, trades = −cash_difference
  amount: number;
};

// ── Helpers ──

const n = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const round2 = (x: number) => Math.round(x * 100) / 100;
const dealKey = (r: TxRow) => r.trade_group_id ?? r.id;
const isTrade = (t: string) => t === "trade_in" || t === "trade_out";

// Local calendar day as YYYY-MM-DD, using the Date's own timezone offset
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Today ──

// Rows are the last ~48h for the workspace; dayKey is the browser's local day
export function computeToday(rows: TxRow[], dayKey: string): TodayTotals {
  const t: TodayTotals = { revenue: 0, profit: 0, spent: 0, deals: 0, cardsSold: 0, cardsBought: 0 };
  const deals = new Set<string>();
  const tradesCounted = new Set<string>();

  for (const r of rows) {
    if (localDayKey(new Date(r.date)) !== dayKey) continue;
    deals.add(dealKey(r));

    if (r.transaction_type === "sell") {
      t.revenue += n(r.sale_price);
      t.profit += n(r.sale_price) - n(r.cost_basis);
      t.cardsSold += 1;
    } else if (r.transaction_type === "buy") {
      t.spent += n(r.cash_paid);
      t.cardsBought += 1;
    } else if (isTrade(r.transaction_type)) {
      // cash_difference is copied onto every row of a trade; count it once
      const key = dealKey(r);
      if (!tradesCounted.has(key)) {
        tradesCounted.add(key);
        const cd = n(r.cash_difference);
        if (cd > 0) t.spent += cd;
      }
    }
  }

  t.deals = deals.size;
  t.revenue = round2(t.revenue);
  t.profit = round2(t.profit);
  t.spent = round2(t.spent);
  return t;
}

// ── Recent deals ──

// Rows arrive newest-first; folds per-card rows into deals and keeps the first `limit`
export function groupRecentDeals(rows: TxRow[], limit = 5): RecentDeal[] {
  const groups = new Map<string, TxRow[]>();
  for (const r of rows) {
    const key = dealKey(r);
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const deals: RecentDeal[] = [];
  for (const [id, rs] of groups) {
    if (deals.length >= limit) break;
    const types = new Set(rs.map((r) => r.transaction_type));
    const mode: DealMode = types.has("buy") ? "buy" : types.has("sell") ? "sell" : "trade";
    const lead = rs.find((r) => r.id === id) ?? rs[0];
    const sum = (f: (r: TxRow) => number | null) => rs.reduce((s, r) => s + n(f(r)), 0);

    const amount =
      mode === "buy" ? -sum((r) => r.cash_paid)
      : mode === "sell" ? sum((r) => r.sale_price)
      : -n(lead.cash_difference);

    const withCard = rs.find((r) => r.card?.name);
    deals.push({
      id,
      mode,
      date: lead.date,
      cardCount: rs.length,
      firstName: lead.card?.name ?? withCard?.card?.name ?? null,
      imageUrl: lead.card?.image_url ?? rs.find((r) => r.card?.image_url)?.card?.image_url ?? null,
      method: lead.payment_method ?? null,
      amount: round2(amount),
    });
  }
  return deals;
}

// ── Relative time ──

export function fmtAgo(iso: string, now: Date): string {
  const then = new Date(iso);
  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
