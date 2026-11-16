// Pure P&L arithmetic over card_transactions rows and expenses. No I/O; the
// server actions fetch rows and call these so every number is computed once,
// server-side.

export type FinanceTx = {
  id: string;
  trade_group_id: string | null;
  transaction_type: string; // buy | sell | trade_in | trade_out
  date: string;             // timestamptz ISO
  sale_price: number | null;
  cost_basis: number | null;
  cash_paid: number | null;
  cash_difference: number | null; // > 0 we paid, copied onto every row of a trade
  payment_method: string | null;
};

export type FinanceExpense = {
  expense_date: string | null;
  created_at?: string | null;
  cost: number | null;
  category: string | null;
  deductible_percentage?: number | null;
};

export type Pnl = {
  revenue: number;      // Σ sale_price on sell rows
  cogs: number;         // Σ cost_basis on sell rows
  grossProfit: number;  // revenue − cogs
  expenses: number;     // Σ expense cost
  net: number;          // grossProfit − expenses
  buysSpent: number;    // cash paid for cards bought (inventory, not P&L)
  tradeCashOut: number; // cash we paid on trades (once per trade)
  tradeCashIn: number;  // cash customers paid us on trades (once per trade)
  deals: number;        // distinct deals
  cardsSold: number;
  cardsBought: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | null | undefined) => (typeof v === "number" ? v : 0);
const dealKey = (t: FinanceTx) => t.trade_group_id ?? t.id;

// ── Core ──────────────────────────────────────────────────────────────────────

export function pnlFor(rows: FinanceTx[], expenses: FinanceExpense[]): Pnl {
  const p = {
    revenue: 0, cogs: 0, expenses: 0, buysSpent: 0, tradeCashOut: 0, tradeCashIn: 0,
    cardsSold: 0, cardsBought: 0,
  };
  const deals = new Set<string>();
  const tradeCashSeen = new Set<string>();
  for (const t of rows) {
    deals.add(dealKey(t));
    switch (t.transaction_type) {
      case "sell":
        p.revenue += num(t.sale_price);
        p.cogs += num(t.cost_basis);
        p.cardsSold += 1;
        break;
      case "buy":
        p.buysSpent += num(t.cash_paid);
        p.cardsBought += 1;
        break;
      case "trade_in":
      case "trade_out": {
        if (t.transaction_type === "trade_in") p.cardsBought += 1;
        else p.cardsSold += 1;
        const k = dealKey(t);
        if (tradeCashSeen.has(k)) break;
        tradeCashSeen.add(k);
        const cd = num(t.cash_difference);
        if (cd > 0) p.tradeCashOut += cd;
        else p.tradeCashIn += -cd;
      }
    }
  }
  for (const e of expenses) p.expenses += num(e.cost);
  const grossProfit = p.revenue - p.cogs;
  return {
    revenue: round2(p.revenue),
    cogs: round2(p.cogs),
    grossProfit: round2(grossProfit),
    expenses: round2(p.expenses),
    net: round2(grossProfit - p.expenses),
    buysSpent: round2(p.buysSpent),
    tradeCashOut: round2(p.tradeCashOut),
    tradeCashIn: round2(p.tradeCashIn),
    deals: deals.size,
    cardsSold: p.cardsSold,
    cardsBought: p.cardsBought,
  };
}

// Cash that physically moved through the drawer: cash-method deals only
export function cashDrawer(rows: FinanceTx[]): number {
  let cash = 0;
  const seen = new Set<string>();
  for (const t of rows) {
    if (t.payment_method !== "cash") continue;
    if (t.transaction_type === "sell") cash += num(t.sale_price);
    else if (t.transaction_type === "buy") cash -= num(t.cash_paid);
    else {
      const k = dealKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      cash -= num(t.cash_difference);
    }
  }
  return round2(cash);
}

// ── Buckets ───────────────────────────────────────────────────────────────────

// Calendar day of a timestamp in the business's timezone (server clock is UTC)
export function localDay(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

const expenseDay = (e: FinanceExpense) => (e.expense_date ?? e.created_at ?? "").slice(0, 10);

export type MonthPnl = Pnl & { month: string }; // YYYY-MM

// One Pnl per month for the last `count` months ending at `endMonth` (YYYY-MM), oldest first
export function monthlyPnl(
  rows: FinanceTx[], expenses: FinanceExpense[], endMonth: string, count: number, timeZone: string,
): MonthPnl[] {
  const months: string[] = [];
  let [y, m] = endMonth.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    months.unshift(`${y}-${String(m).padStart(2, "0")}`);
    if (--m === 0) { m = 12; y--; }
  }
  const txBy = new Map<string, FinanceTx[]>();
  for (const t of rows) {
    const k = localDay(t.date, timeZone).slice(0, 7);
    txBy.set(k, [...(txBy.get(k) ?? []), t]);
  }
  const exBy = new Map<string, FinanceExpense[]>();
  for (const e of expenses) {
    const k = expenseDay(e).slice(0, 7);
    exBy.set(k, [...(exBy.get(k) ?? []), e]);
  }
  return months.map((month) => ({ month, ...pnlFor(txBy.get(month) ?? [], exBy.get(month) ?? []) }));
}

export type Period = { id: string; period_start: string; period_end: string | null };
export type PeriodPnl = Pnl & Period;

// Pnl per pay period; a row belongs to the period with start < date <= end
// (matches settlePeriod, which takes everything after the last period_end).
// A null period_end means "open": everything after period_start.
export function periodPnl(rows: FinanceTx[], expenses: FinanceExpense[], periods: Period[]): PeriodPnl[] {
  const within = (iso: string, p: Period) =>
    iso > p.period_start && (p.period_end == null || iso <= p.period_end);
  return periods.map((p) => ({
    ...p,
    ...pnlFor(
      rows.filter((t) => within(t.date, p)),
      // expense_date is a bare date; compare against the period's dates
      expenses.filter((e) => within(expenseDay(e) + "T23:59:59Z", p)),
    ),
  }));
}

export type CategoryTotal = { category: string; total: number; deductible: number; count: number };

// Expenses grouped by category, largest first
export function expensesByCategory(expenses: FinanceExpense[]): CategoryTotal[] {
  const by = new Map<string, CategoryTotal>();
  for (const e of expenses) {
    const category = e.category ?? "other";
    const cur = by.get(category) ?? { category, total: 0, deductible: 0, count: 0 };
    const cost = num(e.cost);
    cur.total += cost;
    cur.deductible += cost * (num(e.deductible_percentage ?? 100) / 100);
    cur.count += 1;
    by.set(category, cur);
  }
  return [...by.values()]
    .map((c) => ({ ...c, total: round2(c.total), deductible: round2(c.deductible) }))
    .sort((a, b) => b.total - a.total);
}
