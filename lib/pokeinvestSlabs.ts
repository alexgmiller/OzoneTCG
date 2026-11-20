// ── PokeInvest slab prices ──
// A slab's value is PokeInvest's median of completed sales at its exact grade
// and grading company, when at least 3 sales inside a year back it. Otherwise
// the slab keeps its eBay value (refresh-stale-slabs, Inventory's eBay loop).
//
// Prices are cached per card in pokeinvest_cards (migrations/
// 20261118_pokeinvest_cards.sql): one /api/prices call covers every grade.
// A card is matched once, by the TCGplayer product the singles matcher finds,
// else by PokeInvest's keyless search; either way PokeInvest's answer must
// agree with the slab's name and number. The 02:30 job refetches each card
// every 3 days, at most NIGHTLY_CALLS calls a night, so the free key's 1,000
// calls a month hold (29 slabs ≈ 300 a month).

import type { SupabaseClient } from "@supabase/supabase-js";
import { makeSlabPriceKey, parseGrade } from "./ebay-client";
import { cardLang, normNum } from "./cardArtMatch";
import { stripParens } from "./cardNameUtils";
import { getPrices, searchCards, type PokeInvestGraded, type PokeInvestPrice, type PokeInvestPrices, type PokeInvestSearchHit } from "./pokeinvest";
import { lookupTcgplayerQuotes } from "./tcgplayerPrices";

const DAY = 86_400_000;
/** Refetch a card's prices after this long */
export const REFETCH_MS = 3 * DAY;
/** Try matching an unmatched card again after this long */
export const RETRY_MISS_MS = 7 * DAY;
/** PokeInvest calls the nightly job may spend */
export const NIGHTLY_CALLS = 30;
/** A grade's price counts only with this many sales… */
export const MIN_SALES = 3;
/** …inside this window */
export const MAX_WINDOW_DAYS = 365;

// ── Keys and rows ──

/** The card part of slab_prices.lookup_key: "name|set|number" */
export function slabCardKey(name: string, setName: string | null | undefined, cardNumber: string | null | undefined): string {
  return makeSlabPriceKey(name, setName, cardNumber, "", "").split("|").slice(0, 3).join("|");
}

export type PokeInvestCardRow = {
  card_key: string;
  pokeinvest_id: string | null;
  tcgplayer_id: string | null;
  matched_by: "tcgplayer" | "search" | null;
  name: string | null;
  set_name: string | null;
  page_url: string | null;
  ungraded: PokeInvestPrice | null;
  graded: PokeInvestGraded[];
  fetched_at: string | null;
  checked_at: string;
};

export const CARD_COLUMNS = "card_key,pokeinvest_id,tcgplayer_id,matched_by,name,set_name,page_url,ungraded,graded,fetched_at,checked_at";

export function toRow(cardKey: string, p: PokeInvestPrices, matchedBy: "tcgplayer" | "search", now: string): PokeInvestCardRow {
  return {
    card_key: cardKey,
    pokeinvest_id: p.pokeinvest_id,
    tcgplayer_id: p.tcgplayer_id ?? null,
    matched_by: matchedBy,
    name: p.name,
    set_name: p.set_name,
    page_url: p.page_url ?? null,
    ungraded: p.ungraded ?? null,
    graded: p.graded ?? [],
    fetched_at: now,
    checked_at: now,
  };
}

// ── Grades ──
// PSA 10 is "10". The top labels sell apart from a plain 10: Black Label at
// any grader, and Pristine at CGC and TAG (at BGS "Pristine 10" is just the 10).

const GRADERS: Record<string, string> = { PSA: "PSA", CGC: "CGC", BGS: "BGS", BECKETT: "BGS", TAG: "TAG", ACE: "ACE", SGC: "SGC" };

function gradeParts(grade: string) {
  const num = grade.match(/\d+(?:\.\d+)?/)?.[0];
  return { num: num == null ? null : Number(num), black: /black\s*label/i.test(grade), pristine: /pristine/i.test(grade) };
}

export function gradeMatches(company: string, grade: string, g: { grader: string; grade: string }): boolean {
  const ours = GRADERS[company.toUpperCase()];
  if (!ours || GRADERS[g.grader.toUpperCase()] !== ours) return false;
  const a = gradeParts(grade);
  const b = gradeParts(g.grade);
  if (a.num == null || a.num !== b.num || a.black !== b.black) return false;
  if ((ours === "CGC" || ours === "TAG") && a.pristine !== b.pristine) return false;
  return true;
}

/** What a slab shows when PokeInvest prices it */
export type PokeInvestSlabPrice = {
  median: number;
  sales: number;
  windowDays: number;
  /** PokeInvest's grade, e.g. "PSA 10" */
  grade: string;
  pageUrl: string | null;
  fetchedAt: string | null;
};

// The slab's grade price, when enough recent sales back it
export function slabPokeInvestPrice(
  row: Pick<PokeInvestCardRow, "pokeinvest_id" | "graded" | "page_url" | "fetched_at"> | null | undefined,
  gradeText: string | null | undefined,
): PokeInvestSlabPrice | null {
  if (!row?.pokeinvest_id || !gradeText) return null;
  const parsed = parseGrade(gradeText);
  if (!parsed) return null;
  const hits = (row.graded ?? []).filter((g) => gradeMatches(parsed.company, parsed.grade, g));
  // Where pristine doesn't separate grades (BGS), prefer the same label anyway
  const ours = gradeParts(parsed.grade);
  const hit = hits.find((g) => gradeParts(g.grade).pristine === ours.pristine) ?? hits[0];
  if (!hit || hit.median_usd == null || hit.sales < MIN_SALES || hit.window_days > MAX_WINDOW_DAYS) return null;
  return {
    median: hit.median_usd,
    sales: hit.sales,
    windowDays: hit.window_days,
    grade: `${hit.grader} ${hit.grade}`,
    pageUrl: row.page_url,
    fetchedAt: row.fetched_at,
  };
}

// ── Matching ──
// PokeInvest names carry the number: "Umbreon GX #SV69", "Psyduck #286/SM-P".

export function splitName(piName: string): { name: string; number: string | null } {
  const m = piName.match(/^(.*?)\s*#\s*(\S+)\s*$/);
  return m ? { name: m[1], number: m[2] } : { name: piName, number: null };
}

const firstWord = (s: string) =>
  stripParens(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/)[0] ?? "";

type SlabCard = { name: string; set_name: string | null; card_number: string | null };

/** Whether PokeInvest's card is the slab's card: same number, same leading name */
export function answerMatches(piName: string, slab: SlabCard): boolean {
  const { name, number } = splitName(piName);
  const ours = normNum(slab.card_number);
  if (!ours || !number || normNum(number) !== ours) return false;
  const word = firstWord(slab.name);
  return !!word && firstWord(name) === word;
}

const SET_NOISE = new Set(["pokemon", "japanese", "jp", "the", "and", "set", "tcg"]);
const setWords = (s: string | null | undefined) =>
  new Set((s ?? "").toLowerCase().replace(/&/g, " ").split(/[^a-z0-9]+/).map((w) => w.replace(/s$/, "")).filter((w) => w && !SET_NOISE.has(w)));

/** How alike two set names are: shared words minus words only one has */
export function setSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const x = setWords(a);
  const y = setWords(b);
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared - (x.size - shared) - (y.size - shared);
}

// The search hit that is the slab's card: number and name must agree, and
// when two printings share them (Base Set and Base Set 2 Charizard are both
// #4) the set decides, or nothing is picked
export function pickSearchHit(hits: PokeInvestSearchHit[], slab: SlabCard): PokeInvestSearchHit | null {
  const same = hits.filter((h) => answerMatches(h.name, slab));
  if (same.length <= 1) return same[0] ?? null;
  // Without a set there's nothing to tell them apart by
  if (!setWords(slab.set_name).size) return null;
  const scored = same.map((h) => ({ h, s: setSimilarity(slab.set_name, h.set) })).sort((a, b) => b.s - a.s);
  return scored[0].s > scored[1].s ? scored[0].h : null;
}

// Name and number only: inventory set labels ("SV: 151", "swsh12.5", "cel25")
// throw PokeInvest's search off. The set only breaks ties (pickSearchHit).
export function searchQuery(slab: SlabCard): string {
  const name = stripParens(slab.name).replace(/\s+/g, " ").trim();
  const num = (slab.card_number ?? "").split("/")[0].trim();
  return [name, num].filter(Boolean).join(" ");
}

// ── Fetching ──

export type CallBudget = { left: number; stopped: string | null };

type Outcome =
  | { kind: "priced"; prices: PokeInvestPrices; matchedBy: "tcgplayer" | "search" }
  | { kind: "miss" }
  | { kind: "stop"; reason: string };

// One /api/prices call; 401 and 429 stop the whole run
async function fetchPrices(card: string | number, key: string, budget: CallBudget): Promise<PokeInvestPrices | null | "stop"> {
  if (budget.left <= 0) { budget.stopped ??= "nightly call limit"; return "stop"; }
  budget.left--;
  const { status, body } = await getPrices(card, key);
  if (status === 401 || status === 429) { budget.stopped = status === 401 ? "key rejected (401)" : "monthly calls used up (429)"; return "stop"; }
  if (status < 200 || status >= 300 || !body || typeof body !== "object") return null;
  return body as PokeInvestPrices;
}

// A card not matched yet: its TCGplayer product first, then search
export async function matchCard(slab: SlabCard, productId: number | null, key: string, budget: CallBudget): Promise<Outcome> {
  if (productId != null) {
    const p = await fetchPrices(productId, key, budget);
    if (p === "stop") return { kind: "stop", reason: budget.stopped ?? "stopped" };
    if (p && answerMatches(p.name, slab)) return { kind: "priced", prices: p, matchedBy: "tcgplayer" };
  }
  const hit = pickSearchHit(await searchCards(searchQuery(slab)).catch(() => []), slab);
  if (!hit) return { kind: "miss" };
  const p = await fetchPrices(hit.id, key, budget);
  if (p === "stop") return { kind: "stop", reason: budget.stopped ?? "stopped" };
  return p && answerMatches(p.name, slab) ? { kind: "priced", prices: p, matchedBy: "search" } : { kind: "miss" };
}

export type SlabRef = SlabCard & { language?: string | null };

export type RefreshStats = {
  cards: number;
  fetched: number;
  matchedTcgplayer: number;
  matchedSearch: number;
  unmatched: number;
  calls: number;
  stopped: string | null;
};

const langOf = (s: SlabRef): "en" | "ja" => (/^ja/i.test(s.language ?? "") || cardLang(s) === "ja" ? "ja" : "en");

// What a card needs tonight: a first match, a retry, a refetch, or nothing
export function cardDue(row: PokeInvestCardRow | undefined, now: number, refetchMs = REFETCH_MS): "match" | "refetch" | null {
  if (!row) return "match";
  if (!row.pokeinvest_id) return now - new Date(row.checked_at).getTime() >= RETRY_MISS_MS ? "match" : null;
  return !row.fetched_at || now - new Date(row.fetched_at).getTime() >= refetchMs ? "refetch" : null;
}

// ── The daily limit, shared by every caller ──
// Slabs, Search and singles all spend from DAILY_CALLS a UTC day, so a month
// stays under the free key's 1,000. Calls are counted from the table: cards
// fetched or checked today (one call each, near enough).
export const DAILY_CALLS = 30;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callsToday(admin: SupabaseClient<any, any, any>, now = new Date()): Promise<number> {
  const day = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const { count, error } = await admin
    .from("pokeinvest_cards")
    .select("card_key", { count: "exact", head: true })
    .or(`fetched_at.gte.${day},checked_at.gte.${day}`);
  // Unknown counts as used up: better a stale price than a blown month
  return error ? DAILY_CALLS : count ?? 0;
}

// Brings the slabs' cards up to date in pokeinvest_cards and returns every
// row for them (fresh or cached). Without the table (migration not applied)
// it returns nothing and slabs keep their eBay values. `products` gives cards
// whose TCGplayer product is already known (Search), skipping the lookup.
export async function refreshPokeInvestCards(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  slabs: SlabRef[],
  opts: { key: string | undefined; maxCalls?: number; refetchMs?: number; now?: Date; products?: Record<string, number> },
): Promise<{ rows: Map<string, PokeInvestCardRow>; stats: RefreshStats; tableMissing: boolean }> {
  const stats: RefreshStats = { cards: 0, fetched: 0, matchedTcgplayer: 0, matchedSearch: 0, unmatched: 0, calls: 0, stopped: null };
  const rows = new Map<string, PokeInvestCardRow>();

  const cards = new Map<string, SlabRef>();
  for (const s of slabs) {
    const k = slabCardKey(s.name, s.set_name, s.card_number);
    if (!cards.has(k)) cards.set(k, s);
  }
  stats.cards = cards.size;
  if (!cards.size) return { rows, stats, tableMissing: false };

  const { data, error } = await admin.from("pokeinvest_cards").select(CARD_COLUMNS).in("card_key", [...cards.keys()]);
  if (error) return { rows, stats, tableMissing: true };
  for (const r of (data ?? []) as PokeInvestCardRow[]) rows.set(r.card_key, r);
  if (!opts.key) { stats.stopped = "no POKEINVEST_API_KEY"; return { rows, stats, tableMissing: false }; }

  const now = opts.now ?? new Date();
  const due = [...cards].map(([k, s]) => ({ k, s, need: cardDue(rows.get(k), now.getTime(), opts.refetchMs) })).filter((d) => d.need);
  // New cards first, then the oldest prices
  due.sort((a, b) => (a.need === b.need ? (rows.get(a.k)?.fetched_at ?? "").localeCompare(rows.get(b.k)?.fetched_at ?? "") : a.need === "match" ? -1 : 1));

  if (!due.length) return { rows, stats, tableMissing: false };

  // Today's share of the daily limit
  const left = Math.min(opts.maxCalls ?? NIGHTLY_CALLS, DAILY_CALLS - (await callsToday(admin, now)));
  if (left <= 0) { stats.stopped = "daily call limit"; return { rows, stats, tableMissing: false }; }

  // TCGplayer products for the cards to match, one lookup per language
  const products = new Map<string, number>(Object.entries(opts.products ?? {}));
  for (const lang of ["en", "ja"] as const) {
    const toMatch = due.filter((d) => d.need === "match" && !products.has(d.k) && langOf(d.s) === lang);
    if (!toMatch.length) continue;
    const quotes = await lookupTcgplayerQuotes(
      toMatch.map((d) => ({ key: d.k, name: d.s.name, setName: d.s.set_name, cardNumber: d.s.card_number })),
      lang,
    ).catch(() => ({} as Record<string, { productId: number }>));
    for (const [k, q] of Object.entries(quotes)) products.set(k, q.productId);
  }

  const budget: CallBudget = { left, stopped: null };
  const stamp = now.toISOString();
  for (const { k, s, need } of due) {
    if (budget.stopped) break;
    const before = rows.get(k);
    let next: PokeInvestCardRow | null = null;

    if (need === "refetch" && before?.pokeinvest_id) {
      const p = await fetchPrices(before.pokeinvest_id, opts.key, budget);
      if (p === "stop") break;
      // A card PokeInvest no longer answers for keeps its last prices
      next = p ? toRow(k, p, before.matched_by ?? "search", stamp) : { ...before, checked_at: stamp };
      if (p) stats.fetched++;
    } else {
      const out = await matchCard(s, products.get(k) ?? null, opts.key, budget);
      if (out.kind === "stop") break;
      if (out.kind === "priced") {
        next = toRow(k, out.prices, out.matchedBy, stamp);
        stats.fetched++;
        if (out.matchedBy === "tcgplayer") stats.matchedTcgplayer++;
        else stats.matchedSearch++;
      } else {
        stats.unmatched++;
        next = {
          card_key: k, pokeinvest_id: null, tcgplayer_id: products.has(k) ? String(products.get(k)) : null, matched_by: null,
          name: null, set_name: null, page_url: null, ungraded: null, graded: [], fetched_at: null, checked_at: stamp,
        };
      }
    }

    const { error: writeError } = await admin.from("pokeinvest_cards").upsert(next);
    if (writeError) console.error(`[pokeinvest] couldn't save ${k}:`, writeError.message);
    rows.set(k, next);
  }

  stats.calls = left - budget.left;
  stats.stopped = budget.stopped;
  return { rows, stats, tableMissing: false };
}

// ── Raw singles ──
// A single TCGplayer and TCGdex can't price takes PokeInvest's ungraded
// median (every condition together, so no condition discount on top) before
// falling back to eBay asking prices. Same rule as grades: 3+ sales in a year.
export function rawPokeInvestPrice(row: Pick<PokeInvestCardRow, "pokeinvest_id" | "ungraded"> | null | undefined): number | null {
  const u = row?.pokeinvest_id ? row.ungraded : null;
  return u && u.median_usd != null && u.sales >= MIN_SALES && u.window_days <= MAX_WINDOW_DAYS ? u.median_usd : null;
}

export async function pokeinvestRawFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  card: SlabRef,
  key: string | undefined,
): Promise<number | null> {
  const { rows } = await refreshPokeInvestCards(admin, [card], { key, maxCalls: 2 });
  return rawPokeInvestPrice(rows.get(slabCardKey(card.name, card.set_name, card.card_number)));
}
