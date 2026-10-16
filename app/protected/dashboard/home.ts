// Pure helpers for the Home screen. Server actions and queries live in
// DashboardServer.tsx; everything here is testable without Supabase.

import type { Category } from "./totals";

export const HOME_RANGES = ["1W", "1M", "3M", "6M", "1Y", "All"] as const;
export type HomeRange = (typeof HOME_RANGES)[number];

const RANGE_DAYS: Record<HomeRange, number | null> = {
  "1W": 7, "1M": 30, "3M": 91, "6M": 182, "1Y": 365, All: null,
};

// Inclusive lower bound of a range as a UTC day key; null = no bound
export function rangeStartDay(range: HomeRange, now = new Date()): string | null {
  const days = RANGE_DAYS[range];
  if (days == null) return null;
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ── Value chart ──
export type SnapshotPoint = { date: string; total_fmv: number; total_cost: number; item_count: number };

export function filterByRange<T extends { date: string }>(points: T[], range: HomeRange, now = new Date()): T[] {
  const start = rangeStartDay(range, now);
  return start ? points.filter((p) => p.date >= start) : points;
}

// ── Profit chart ──
// Realized profit per day from sell rows: sale price minus the cost basis the
// row carries. Trades out count their cash difference the same way.
export type SellRow = { date: string; sale_price: number | null; cost_basis: number | null };
export type ProfitPoint = { date: string; profit: number };

export function realizedProfitByDay(rows: SellRow[]): ProfitPoint[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const day = r.date.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (r.sale_price ?? 0) - (r.cost_basis ?? 0));
  }
  return [...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, profit]) => ({ date, profit }));
}

export function cumulative(points: ProfitPoint[]): { date: string; value: number }[] {
  let run = 0;
  return points.map((p) => ({ date: p.date, value: (run += p.profit) }));
}

export function sum(points: ProfitPoint[]): number {
  return points.reduce((s, p) => s + p.profit, 0);
}

// ── Counts & tiles ──
export type StockItem = {
  id: string;
  name: string;
  category: Category;
  status: string;
  market: number | null;
  cost: number | null;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  condition: string | null;
  image_url: string | null;
  consigner_id: string | null;
};

export function inStockCounts(items: StockItem[]): Record<Category, number> {
  const c: Record<Category, number> = { single: 0, slab: 0, sealed: 0 };
  for (const it of items) if (it.status === "inventory") c[it.category] += 1;
  return c;
}

export function topValuable(items: StockItem[], limit = 10): StockItem[] {
  return items
    .filter((it) => it.status === "inventory" && (it.market ?? 0) > 0)
    .sort((a, b) => (b.market ?? 0) - (a.market ?? 0))
    .slice(0, limit);
}

export function tileDelta(it: StockItem): "up" | "down" | null {
  if (it.market == null || it.cost == null) return null;
  if (it.market === it.cost) return null;
  return it.market > it.cost ? "up" : "down";
}

// "PSA 10" for slabs (grade strings may already carry the grader), condition
// for raw singles, nothing for sealed
const GRADER = /^(PSA|BGS|CGC|TAG|SGC|ACE)\b/i;
export function tileMeta(it: StockItem): string | null {
  if (it.category === "slab") {
    if (!it.grade) return null;
    return GRADER.test(it.grade) ? it.grade : `PSA ${it.grade}`;
  }
  if (it.category === "single") return it.condition ?? null;
  return null;
}
