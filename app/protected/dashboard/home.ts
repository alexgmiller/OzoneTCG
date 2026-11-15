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

// ── Value history ──
// A daily in-stock value series rebuilt from when each item came in
// (acquired_date, else created_at) and went out (sold_at), priced at today's
// market. It draws the chart before the snapshot cron has written enough days.
// Days that have a real snapshot use it; today is always the live total, so
// the line ends on the hero number. The series starts the day before the
// first item arrived, at 0, so even a same-day inventory draws a line.
export type HistoryItem = {
  status: string;
  market: number | null;
  created_at: string;
  acquired_date: string | null;
  sold_at: string | null;
};
export type ValuePoint = { date: string; value: number; estimated: boolean };

const dayKey = (s: string) => s.slice(0, 10);
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function valueHistory(
  items: HistoryItem[], snapshots: SnapshotPoint[], todayValue: number, now = new Date(),
): ValuePoint[] {
  const today = now.toISOString().slice(0, 10);
  const delta = new Map<string, number>();
  const bump = (day: string, v: number) => delta.set(day, (delta.get(day) ?? 0) + v);
  let first: string | null = null;

  for (const it of items) {
    const value = it.market ?? 0;
    if (value <= 0) continue;
    // Grading items are out of the in-stock total today, and a sale with no
    // date has no place on the line
    if (it.status !== "inventory" && !(it.status === "sold" && it.sold_at)) continue;
    const inDay = dayKey(it.acquired_date ?? it.created_at);
    const outDay = it.status === "sold" && it.sold_at ? dayKey(it.sold_at) : null;
    if (inDay > today || (outDay && outDay <= inDay)) continue;
    bump(inDay, value);
    if (outDay) bump(outDay, -value);
    if (!first || inDay < first) first = inDay;
  }

  const snapByDay = new Map(snapshots.map((s) => [dayKey(s.date), s.total_fmv]));
  for (const s of snapshots) if (!first || dayKey(s.date) < first) first = dayKey(s.date);
  if (!first) return todayValue > 0 ? [{ date: addDays(today, -1), value: 0, estimated: true }, { date: today, value: todayValue, estimated: false }] : [];

  const out: ValuePoint[] = [];
  let run = 0;
  for (let day = addDays(first, -1); day <= today; day = addDays(day, 1)) {
    run += delta.get(day) ?? 0;
    if (day === today) out.push({ date: day, value: todayValue, estimated: false });
    else if (snapByDay.has(day)) out.push({ date: day, value: snapByDay.get(day)!, estimated: false });
    else out.push({ date: day, value: Math.max(0, run), estimated: true });
  }
  return out;
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
