// Pure helpers for the Search catalog. Queries live in actions.ts; everything
// here is testable without Supabase. Ranking reuses lib/cardSearchScoring so
// the catalog orders cards the same way the card autocomplete does.

import { parseTerms, scoreLocalCard } from "@/lib/cardSearchScoring";

export type CatalogRow = {
  id: string;
  name: string;
  set_id: string | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
};

export type CatalogCard = {
  id: string;
  name: string;
  setName: string;
  /** TCGdex set code ("sv04.5"); inventory often stores this instead of the name */
  setId: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
};

export const CATALOG_LIMIT = 48;

// The term that drives the indexed name lookup: the longest one with a letter
// in it ("charizard" beats "ex" and "4"). Null when there is nothing to search.
export function nameTerm(rawQuery: string): string | null {
  const terms = parseTerms(rawQuery);
  if (!terms.length) return null;
  return [...terms].filter((t) => /[a-z]/i.test(t)).sort((a, b) => b.length - a.length)[0] ?? terms[0];
}

// Every term must appear in the name, set name, set code or number; then best
// match first. Among equal matches, cards with art come before art-less ones
// (a name-only tile can't show which printing it is), then incoming order.
export function rankCatalog(rows: CatalogRow[], rawQuery: string, limit = CATALOG_LIMIT): CatalogCard[] {
  const terms = parseTerms(rawQuery);
  if (!terms.length) return [];
  const full = rawQuery.toLowerCase().trim();

  return rows
    .filter((r) => {
      const text = [r.name, r.set_name, r.set_id, r.card_number].map((s) => (s ?? "").toLowerCase()).join(" ");
      return terms.every((t) => text.includes(t));
    })
    .map((r, i) => ({ r, i, score: scoreLocalCard(r, terms, full) }))
    .sort((a, b) => b.score - a.score || Number(!!b.r.image_url) - Number(!!a.r.image_url) || a.i - b.i)
    .slice(0, limit)
    .map(({ r }) => ({
      id: r.id,
      name: r.name,
      setName: r.set_name || r.set_id || "",
      setId: r.set_id,
      cardNumber: r.card_number,
      imageUrl: r.image_url,
    }));
}

// Inventory items that are this catalog card: same name (case-insensitive),
// same number with leading zeros ignored, and the same set when the item has
// one. Inventory stores either the set name ("Paldean Fates") or the TCGdex
// code ("sv04.5"), so either counts.
export type StockRow = { id: string; name: string; set_name: string | null; card_number: string | null };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const normNum = (n: string | null) => norm(n).replace(/^0+(?=\d)/, "");

export function matchesCard<T extends StockRow>(
  item: T, card: Pick<CatalogCard, "name" | "setName" | "setId" | "cardNumber">,
): boolean {
  if (norm(item.name) !== norm(card.name)) return false;
  if (card.cardNumber && normNum(item.card_number) !== normNum(card.cardNumber)) return false;
  if (item.set_name) {
    const set = norm(item.set_name);
    if (set !== norm(card.setName) && set !== norm(card.setId)) return false;
  }
  return true;
}

// ── Results controls ──
export type SortKey = "best" | "name" | "number" | "set";
export const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: "best", label: "Best match" },
  { value: "name", label: "Name" },
  { value: "set", label: "Set" },
  { value: "number", label: "Number" },
];

// Sets present in a result list, most cards first, for the set filter
export function setFacets(cards: CatalogCard[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.setName, (counts.get(c.setName) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Card numbers compare by their digits first ("TG2" < "TG10", "4" < "25")
function numberOrder(n: string | null): [number, string] {
  const s = (n ?? "").split("/")[0];
  const digits = s.match(/\d+/)?.[0];
  return [digits ? Number(digits) : Number.MAX_SAFE_INTEGER, s];
}

// "best" keeps the search's own ranking; the others are stable re-orders
export function sortCards(cards: CatalogCard[], sort: SortKey): CatalogCard[] {
  if (sort === "best") return cards;
  const byNum = (a: CatalogCard, b: CatalogCard) => {
    const [x, xs] = numberOrder(a.cardNumber), [y, ys] = numberOrder(b.cardNumber);
    return x - y || xs.localeCompare(ys);
  };
  const cmp: Record<Exclude<SortKey, "best">, (a: CatalogCard, b: CatalogCard) => number> = {
    name: (a, b) => a.name.localeCompare(b.name) || byNum(a, b),
    set: (a, b) => a.setName.localeCompare(b.setName) || byNum(a, b),
    number: byNum,
  };
  return [...cards].sort(cmp[sort]);
}

// ── Recent searches (per device) ──
export const RECENT_MAX = 8;

// Newest first, no duplicates (case-insensitive), capped
export function pushRecent(list: string[], query: string, max = RECENT_MAX): string[] {
  const q = query.trim();
  if (!q) return list;
  return [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, max);
}
