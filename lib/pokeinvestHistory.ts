// ── Slab charts back to 2022 ──
// PokeInvest keeps each grade's price over time (/api/price-history: a point
// whenever the price or sale count changed, since January 2022). Once per
// card the 02:30 slab job fetches it into pokeinvest_cards.history
// (migrations/20261119_pokeinvest_history.sql), then writes those points into
// item_price_history for every slab PokeInvest prices, so a slab's chart
// starts years back instead of on the day it was added.
//
// Earlier nightly points (eBay values from before PokeInvest priced the slab)
// are rewritten to PokeInvest's value on that date, so the line doesn't jump
// where the source changed. Points from today on are left to the 03:00 job.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPriceHistory } from "./pokeinvest";
import { callsToday, DAILY_CALLS, gradeMatches, MIN_SALES, slabCardKey } from "./pokeinvestSlabs";
import { parseGrade } from "./ebay-client";

export type HistoryPoint = { date: string; price: number };
/** Grade ("PSA 10", "CGC Pristine 10") → points, oldest first */
export type GradeHistory = Record<string, HistoryPoint[]>;

/** History fetches the nightly job may make */
export const NIGHTLY_HISTORY_CALLS = 10;

// PokeInvest's answer: { grades: { "PSA 10": [{ date, price_usd, sales, … }] } }.
// Points resting on fewer than 3 sales (an early lone sale) are dropped, the
// same rule as today's prices, so a chart doesn't start on a fluke.
export function parseHistory(body: unknown): GradeHistory | null {
  const grades = (body as { grades?: unknown } | null)?.grades;
  if (!grades || typeof grades !== "object") return null;
  const out: GradeHistory = {};
  for (const [grade, points] of Object.entries(grades as Record<string, unknown>)) {
    if (!Array.isArray(points)) continue;
    const clean = points
      .filter((p) => {
        const sales = (p as { sales?: unknown }).sales;
        return typeof sales !== "number" || sales >= MIN_SALES;
      })
      .map((p) => ({ date: String((p as { date?: unknown }).date ?? "").slice(0, 10), price: Number((p as { price_usd?: unknown }).price_usd) }))
      .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.price) && p.price > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (clean.length) out[grade] = clean;
  }
  return out;
}

// The series for a slab's grade: keys are "<grader> <grade>"
export function seriesFor(history: GradeHistory | null | undefined, gradeText: string | null | undefined): HistoryPoint[] {
  const parsed = gradeText ? parseGrade(gradeText) : null;
  if (!history || !parsed) return [];
  for (const [key, points] of Object.entries(history)) {
    const m = key.trim().match(/^(\S+)\s+(.+)$/);
    if (m && gradeMatches(parsed.company, parsed.grade, { grader: m[1], grade: m[2] })) return points;
  }
  return [];
}

// The price in force on a date: the last change on or before it
export function stepValue(series: HistoryPoint[], date: string): number | null {
  let value: number | null = null;
  for (const p of series) {
    if (p.date > date) break;
    value = p.price;
  }
  return value;
}

// Rows for one slab: every change point, plus its own earlier nightly dates
// at PokeInvest's value on that day. Nothing from `today` on.
export function backfillRows(
  item: { id: string; workspace_id: string },
  series: HistoryPoint[],
  existingDates: string[],
  today: string,
): { item_id: string; workspace_id: string; date: string; market: number }[] {
  const byDate = new Map<string, number>();
  for (const p of series) if (p.date < today) byDate.set(p.date, p.price);
  for (const d of existingDates) {
    if (d >= today || byDate.has(d)) continue;
    const v = stepValue(series, d);
    if (v != null) byDate.set(d, v);
  }
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ item_id: item.id, workspace_id: item.workspace_id, date, market: Math.round(price * 100) / 100 }));
}

export type BackfillSlab = { id: string; workspace_id: string; name: string; set_name: string | null; card_number: string | null; grade: string | null };
export type BackfillStats = { fetched: number; filled: number; points: number; stopped: string | null };

// Fetches history for cards that don't have it yet (within the night's and
// the day's limits) and back-fills each slab whose chart doesn't reach back
// to its series' first point. Without the columns it does nothing.
export async function backfillSlabHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  slabs: BackfillSlab[],
  opts: { key: string | undefined; maxCalls?: number; now?: Date },
): Promise<BackfillStats> {
  const stats: BackfillStats = { fetched: 0, filled: 0, points: 0, stopped: null };
  if (!slabs.length) return stats;
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const keyOf = (s: BackfillSlab) => slabCardKey(s.name, s.set_name, s.card_number);
  const keys = [...new Set(slabs.map(keyOf))];
  const { data, error } = await admin.from("pokeinvest_cards").select("card_key,pokeinvest_id,history,history_at").in("card_key", keys);
  if (error) { stats.stopped = "history columns missing (run migrations/20261119_pokeinvest_history.sql)"; return stats; }
  const cards = new Map(((data ?? []) as { card_key: string; pokeinvest_id: string | null; history: GradeHistory | null; history_at: string | null }[])
    .map((r) => [r.card_key, r]));

  // Fetch what's missing
  const missing = [...cards.values()].filter((c) => c.pokeinvest_id && !c.history_at);
  let left = missing.length && opts.key
    ? Math.min(opts.maxCalls ?? NIGHTLY_HISTORY_CALLS, DAILY_CALLS - (await callsToday(admin, now)))
    : 0;
  if (missing.length && !opts.key) stats.stopped = "no POKEINVEST_API_KEY";
  for (const c of missing) {
    if (left <= 0) { stats.stopped ??= "call limit"; break; }
    left--;
    const { status, body } = await getPriceHistory(c.pokeinvest_id!, opts.key!);
    if (status === 401 || status === 429) { stats.stopped = `PokeInvest answered ${status}`; break; }
    // An unusable answer still marks the card, so it isn't asked every night
    const history = status >= 200 && status < 300 ? parseHistory(body) ?? {} : {};
    const stamp = now.toISOString();
    // checked_at counts the call toward today's limit
    const { error: saveError } = await admin.from("pokeinvest_cards")
      .update({ history, history_at: stamp, checked_at: stamp }).eq("card_key", c.card_key);
    if (saveError) console.error(`[pokeinvest] history for ${c.card_key} not saved:`, saveError.message);
    c.history = history;
    c.history_at = stamp;
    stats.fetched++;
  }

  // Back-fill each slab whose chart starts after its series does
  for (const s of slabs) {
    const series = seriesFor(cards.get(keyOf(s))?.history, s.grade);
    if (!series.length) continue;
    const { data: existing } = await admin.from("item_price_history")
      .select("date").eq("item_id", s.id).lt("date", today).order("date", { ascending: true });
    const dates = ((existing ?? []) as { date: string }[]).map((r) => r.date);
    if (dates.length && dates[0] <= series[0].date) continue; // done before
    const rows = backfillRows(s, series, dates, today);
    if (!rows.length) continue;
    const { error: writeError } = await admin.from("item_price_history").upsert(rows, { onConflict: "item_id,date" });
    if (writeError) { console.error(`[pokeinvest] history for ${s.name} not written:`, writeError.message); continue; }
    stats.filled++;
    stats.points += rows.length;
  }
  return stats;
}
