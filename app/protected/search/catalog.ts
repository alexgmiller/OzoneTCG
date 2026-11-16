// Pure helpers for the Search catalog. Queries live in actions.ts; everything
// here is testable without Supabase. Ranking reuses lib/cardSearchScoring so
// the catalog orders cards the same way the card autocomplete does.

import { parseTerms, scoreLocalCard } from "@/lib/cardSearchScoring";
import { cardLang } from "@/lib/cardArtMatch";
import { stripParens } from "@/lib/cardNameUtils";
import {
  groupCore, resolveGroups, toCatalogEntry, type Quote, type TcgGroup, type TcgPrice, type TcgProduct,
} from "@/lib/tcgplayerMatch";

export type CatalogLang = "en" | "ja";

export type CatalogRow = {
  id: string;
  name: string;
  set_id: string | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
};

export type CatalogCard = {
  /** English: TCGdex id ("sv04.5-232"). Japanese: "tcgp-<TCGplayer product id>" */
  id: string;
  name: string;
  setName: string;
  /** English: TCGdex set code ("sv04.5"), which inventory sometimes stores
   *  instead of the name. Japanese: TCGplayer's set code ("SV2a") */
  setId: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  lang: CatalogLang;
};

// Cards straight from TCGplayer (the Japanese catalog, and sets opened from
// Browse) carry the product id in theirs
export const JA_ID_PREFIX = "tcgp-";
export const productIdOf = (card: Pick<CatalogCard, "id">) =>
  card.id.startsWith(JA_ID_PREFIX) ? Number(card.id.slice(JA_ID_PREFIX.length)) || null : null;

export const CATALOG_LIMIT = 48;

// Terms to try for the indexed name lookup, best guess first: the longest
// ones with a letter in them ("charizard" beats "ex" and "4"). A set word can
// be longer than the name ("charizard evolutions"), so the search tries the
// next one when a term finds nothing. Empty when there is nothing to search.
export function nameTerms(rawQuery: string, max = 3): string[] {
  const terms = [...new Set(parseTerms(rawQuery))];
  const lettered = terms.filter((t) => /[a-z]/i.test(t)).sort((a, b) => b.length - a.length);
  return (lettered.length ? lettered : terms).slice(0, max);
}

// Every term must appear in the name, set name, set code or number; then best
// match first. Among equal matches, cards with art come before art-less ones
// (a name-only tile can't show which printing it is), then incoming order.
export function rankCatalog(
  rows: CatalogRow[], rawQuery: string, limit = CATALOG_LIMIT, lang: CatalogLang = "en",
): CatalogCard[] {
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
      lang,
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
  item: T, card: Pick<CatalogCard, "name" | "setName" | "setId" | "cardNumber" | "lang">,
): boolean {
  if (card.lang === "ja") return matchesJapaneseCard(item, card);
  if (norm(item.name) !== norm(card.name)) return false;
  if (card.cardNumber && normNum(item.card_number) !== normNum(card.cardNumber)) return false;
  if (item.set_name) {
    const set = norm(item.set_name);
    if (set !== norm(card.setName) && set !== norm(card.setId)) return false;
  }
  return true;
}

// Japanese items are marked "(JP)" / "(Japanese)" in the name or set
// (lib/cardArtMatch → cardLang). Same card: the name without its parentheses
// (TCGplayer's "(Poke Ball Pattern)" included), the number before any "/"
// ("006/165", "186/SM-P"), and the set: the item's set name maps to this
// card's TCGplayer set, or, when it doesn't, the full numbers agree
// ("186/SM-P" names the set by itself).
const baseName = (s: string) => norm(stripParens(s));
const numHead = (n: string | null) => normNum((n ?? "").split("/")[0]);

function matchesJapaneseCard(
  item: StockRow, card: Pick<CatalogCard, "name" | "setName" | "setId" | "cardNumber">,
): boolean {
  if (cardLang(item) !== "ja") return false;
  if (baseName(item.name) !== baseName(card.name)) return false;
  if (card.cardNumber && numHead(item.card_number) !== numHead(card.cardNumber)) return false;
  if (!item.set_name) return true;
  const group = { groupId: 0, name: card.setId ? `${card.setId}: ${card.setName}` : card.setName, abbreviation: card.setId };
  if (resolveGroups(item.set_name, [group], "ja").length) return true;
  const full = (n: string | null) => norm(n).replace(/^0+(?=\d)/, "");
  return !!card.cardNumber?.includes("/") && full(item.card_number) === full(card.cardNumber);
}

// ── Results controls ──
export type SortKey = "best" | "price-high" | "price-low" | "name" | "number" | "set";
export const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: "best", label: "Best match" },
  { value: "price-high", label: "Price: high to low" },
  { value: "price-low", label: "Price: low to high" },
  { value: "name", label: "Name" },
  { value: "set", label: "Set" },
  { value: "number", label: "Number" },
];

export type Facet = { name: string; count: number };

// The distinct values in a result list, most cards first (blanks skipped)
export function facets(values: (string | null | undefined)[]): Facet[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Sets present in a result list, for the set filter
export const setFacets = (cards: CatalogCard[]): Facet[] => facets(cards.map((c) => c.setName));

// Card numbers compare by their digits first ("TG2" < "TG10", "4" < "25")
function numberOrder(n: string | null): [number, string] {
  const s = (n ?? "").split("/")[0];
  const digits = s.match(/\d+/)?.[0];
  return [digits ? Number(digits) : Number.MAX_SAFE_INTEGER, s];
}

// "best" keeps the search's own ranking; the others are stable re-orders.
// Price sorts put cards with no price last either way.
export function sortCards(
  cards: CatalogCard[], sort: SortKey, priceOf: (c: CatalogCard) => number | null = () => null,
): CatalogCard[] {
  if (sort === "best") return cards;
  const byNum = (a: CatalogCard, b: CatalogCard) => {
    const [x, xs] = numberOrder(a.cardNumber), [y, ys] = numberOrder(b.cardNumber);
    return x - y || xs.localeCompare(ys);
  };
  const byPrice = (dir: 1 | -1) => (a: CatalogCard, b: CatalogCard) => {
    const x = priceOf(a), y = priceOf(b);
    if (x == null || y == null) return Number(x == null) - Number(y == null);
    return (x - y) * dir;
  };
  const cmp: Record<Exclude<SortKey, "best">, (a: CatalogCard, b: CatalogCard) => number> = {
    "price-high": byPrice(-1),
    "price-low": byPrice(1),
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

// ── Browse by set ──
// TCGplayer's set list (TCGCSV groups) for each language, newest first. A set's
// cards come from its product list, which already carries names, numbers,
// rarity, images and prices, so opening a set is one download.
export type BrowseSet = { groupId: number; name: string; code: string | null; released: string | null };

// Some groups carry a placeholder release date later than their own last
// update (POP Series 9 "released" yesterday); those count as undated
export function toBrowseSet(g: TcgGroup): BrowseSet {
  const pub = g.publishedOn?.slice(0, 10) ?? null;
  const mod = g.modifiedOn?.slice(0, 10) ?? null;
  return {
    groupId: g.groupId,
    name: groupCore(g.name),
    code: g.abbreviation?.trim() || null,
    released: pub && !(mod && pub > mod) ? pub : null,
  };
}

// Newest first; undated sets after, by name
export function sortSets(sets: BrowseSet[]): BrowseSet[] {
  return [...sets].sort((a, b) =>
    a.released && b.released ? b.released.localeCompare(a.released) || a.name.localeCompare(b.name)
    : a.released ? -1 : b.released ? 1 : a.name.localeCompare(b.name));
}

// A set's cards (sealed products left out) in number order, with their quotes
export function setCardsFrom(
  products: TcgProduct[], prices: TcgPrice[], group: TcgGroup, lang: CatalogLang,
): { cards: CatalogCard[]; quotes: Record<string, Quote> } {
  const cards: CatalogCard[] = [];
  const quotes: Record<string, Quote> = {};
  for (const p of products) {
    const e = toCatalogEntry(p, group, lang, prices, "");
    if (!e) continue;
    const id = `${JA_ID_PREFIX}${e.product_id}`;
    cards.push({ id, name: e.name, setName: e.set_name, setId: e.set_code, cardNumber: e.card_number, imageUrl: e.image_url, lang });
    quotes[id] = { productId: e.product_id, url: e.url, rarity: e.rarity, market: e.market ?? null, printings: e.printings ?? [] };
  }
  return { cards: sortCards(cards, "number"), quotes };
}
