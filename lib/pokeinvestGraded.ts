// ── Search's Graded tab: what a card sells for at each grade ──
// PokeInvest's sold medians for every grade of one card, from the same
// pokeinvest_cards cache the slabs use (lib/pokeinvestSlabs.ts): one call per
// card, kept 3 days, inside the shared daily limit. Past the limit (or with
// no key) the free search still gives the PSA 10 and raw headline prices.

import type { SupabaseClient } from "@supabase/supabase-js";
import { searchCards } from "./pokeinvest";
import {
  MAX_WINDOW_DAYS, MIN_SALES, pickSearchHit, refreshPokeInvestCards, searchQuery, slabCardKey,
  type PokeInvestCardRow, type SlabRef,
} from "./pokeinvestSlabs";

export type GradeRow = { grader: string; grade: string; median: number; sales: number; windowDays: number };

export type GradedPrices =
  | { status: "ok"; grades: GradeRow[]; raw: GradeRow | null; pageUrl: string | null; fetchedAt: string | null }
  /** The free search's PSA 10 and raw only: today's calls are used up, or no key */
  | { status: "quick"; psa10: number | null; raw: number | null; pageUrl: string | null }
  /** PokeInvest doesn't know the card, or has no sales for it */
  | { status: "none" }
  | { status: "unavailable" };

const GRADER_ORDER = ["PSA", "CGC", "BGS", "TAG", "SGC", "ACE"];
const graderRank = (g: string) => {
  const i = GRADER_ORDER.indexOf(g.toUpperCase());
  return i < 0 ? GRADER_ORDER.length : i;
};
const gradeNum = (g: string) => Number(g.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
// Black Label and Pristine sit above the plain grade with the same number
const special = (g: string) => (/black\s*label/i.test(g) ? 2 : /pristine/i.test(g) ? 1 : 0);

const trusted = (p: { median_usd: number | null; sales: number; window_days: number }) =>
  p.median_usd != null && p.sales >= MIN_SALES && p.window_days <= MAX_WINDOW_DAYS;

// The grades worth showing (the same 3-sales-in-a-year rule slabs use),
// PSA first, best grade first
export function gradeRows(row: Pick<PokeInvestCardRow, "graded" | "ungraded">): { grades: GradeRow[]; raw: GradeRow | null } {
  const grades = (row.graded ?? [])
    .filter(trusted)
    .map((g) => ({ grader: g.grader, grade: g.grade, median: g.median_usd as number, sales: g.sales, windowDays: g.window_days }))
    .sort((a, b) =>
      graderRank(a.grader) - graderRank(b.grader) || gradeNum(b.grade) - gradeNum(a.grade) || special(b.grade) - special(a.grade));
  const u = row.ungraded;
  const raw = u && trusted(u)
    ? { grader: "Raw", grade: "", median: u.median_usd as number, sales: u.sales, windowDays: u.window_days }
    : null;
  return { grades, raw };
}

export async function gradedPricesFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  ref: SlabRef,
  opts: { key: string | undefined; productId: number | null },
): Promise<GradedPrices> {
  const cardKey = slabCardKey(ref.name, ref.set_name, ref.card_number);
  const { rows } = await refreshPokeInvestCards(admin, [ref], {
    key: opts.key,
    maxCalls: 2,
    products: opts.productId != null ? { [cardKey]: opts.productId } : undefined,
  }).catch(() => ({ rows: new Map<string, PokeInvestCardRow>() }));

  const row = rows.get(cardKey);
  if (row?.pokeinvest_id) {
    const { grades, raw } = gradeRows(row);
    return grades.length || raw
      ? { status: "ok", grades, raw, pageUrl: row.page_url, fetchedAt: row.fetched_at }
      : { status: "none" };
  }
  // A known miss: the match (search included) already failed this week
  if (row) return { status: "none" };

  // Not fetched (limit, no key, no table): the free search's headline prices
  const hit = pickSearchHit(await searchCards(searchQuery(ref)).catch(() => []), ref);
  if (!hit) return { status: "none" };
  if (hit.psa_10_usd == null && hit.ungraded_usd == null) return { status: "none" };
  return { status: "quick", psa10: hit.psa_10_usd ?? null, raw: hit.ungraded_usd ?? null, pageUrl: hit.page_url ?? null };
}
