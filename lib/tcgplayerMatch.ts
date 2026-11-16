// ── TCGplayer card matching ──
// Pure rules for finding an inventory item's exact card in TCGplayer's catalog
// (via TCGCSV, lib/tcgplayerArt.ts). TCGplayer has art for the cards TCGdex is
// thin on: promos and Japanese sets. Same standard as cardArtMatch: set +
// number, never a name on its own.

import { nameLooksRight, normNum, numberKeys } from "./cardArtMatch";
import { stripParens } from "./cardNameUtils";

export type TcgGroup = { groupId: number; name: string; abbreviation?: string | null };
export type TcgProduct = {
  productId: number;
  name: string;
  imageUrl?: string | null;
  /** The product's page on tcgplayer.com */
  url?: string | null;
  extendedData?: { name: string; value: string }[];
};
/** One printing's prices for a product (TCGCSV's /prices rows) */
export type TcgPrice = {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string;
};

export const CATEGORY = { en: 3, ja: 85 } as const;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "") // "Pokémon GO" → "Pokemon GO"
    .toLowerCase()
    .replace(/&/g, " and ").replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bpromos\b/g, "promo").replace(/\bfest\b/g, "festival")
    .replace(/\s+/g, " ").trim();

// "S12a: VSTAR Universe" → "VSTAR Universe"; "SM-P: Sun & Moon Promos" →
// "Sun & Moon Promos". Only a short code before the colon is dropped, so
// "Celebrations: Classic Collection" keeps its name.
export function groupCore(name: string): string {
  // A code is one short word (≤ 6 chars, optional "-P"): SV, SWSH, S12a, SM-P
  return name.replace(/^[A-Za-z0-9]{1,6}(?:-[A-Za-z]{1,2})?:\s+/, "");
}

// Inventory spellings → TCGplayer group names, where the words don't overlap
const EN_ALIASES: [RegExp, string][] = [
  [/^(sm|sun and moon)( black star)? promo$/, "sm promo"],
  [/^(sv|svp|scarlet and violet)( black star)? promo$/, "scarlet and violet promo cards"],
  [/^(swsh|sword and shield)( black star)? promo$/, "sword and shield promo cards"],
  [/^xy( black star)? promo$/, "xy promo"],
  [/^(bw|black and white)( black star)? promo$/, "black and white promo"],
  [/^(dp|diamond and pearl)( black star)? promo$/, "diamond and pearl promo"],
  [/^(hgss|heartgold soulsilver)( black star)? promo$/, "hgss promo"],
  [/^(wizards|wotc)( black star)? promo$/, "wotc promo"],
  [/^ex (.+)$/, "$1"],                          // "EX Delta Species" → "Delta Species"
  // TCGdex catalog names (Search) that TCGplayer spells differently
  [/^sun and moon$/, "sm base set"],
  [/^151$/, "scarlet and violet 151"],
  [/^expedition base set$/, "expedition"],
  [/^yellow a alternate$/, "hidden fates shiny vault"],
];
// Vintage Japanese sets are listed under their original Japanese names. Note
// "Base Expansion Pack" is the 2001 e-series set; Base Set is "Expansion Pack".
const JA_ALIASES: [RegExp, string][] = [
  [/^base( set)?$/, "expansion pack"],
  [/^jungle$/, "pokemon jungle"],
  [/^fossil$/, "mystery of the fossils"],
  [/^team rocket$/, "rocket gang"],
  [/^gym heroes$/, "leaders stadium"],
  [/^gym challenge$/, "challenge from the darkness"],
  [/^neo genesis$/, "gold silver to a new world"],
  [/^neo discovery$/, "crossing the ruins"],
  [/^neo revelation$/, "awakening legends"],
  [/^neo destiny$/, "darkness and to light"],
  [/^(sm|sun and moon)( black star)? promo$/, "sun and moon promo"],
  [/^(swsh|sword and shield)( black star)? promo$/, "sword and shield promo"],
  [/^(sv|svp|scarlet and violet)( black star)? promo$/, "sv p promotional cards"],
];

function itemSetVariants(setName: string, lang: "en" | "ja"): string[] {
  const base = norm(setName.replace(/\((japanese|jp)\)/gi, "").replace(/\s+jp$/i, ""));
  const out = new Set([base]);
  for (const [re, to] of lang === "en" ? EN_ALIASES : JA_ALIASES) if (re.test(base)) out.add(base.replace(re, to));
  return [...out];
}

const words = (s: string) => new Set(s.split(" ").filter(Boolean));
const within = (a: Set<string>, b: Set<string>) => [...a].every((w) => b.has(w));

// TCGplayer groups an inventory set name refers to. Exact name (code dropped)
// first; otherwise every word of one inside the other ("Tag Team GX All
// Stars" ⊂ "TAG TEAM GX: Tag All Stars", "Pokemon 151" ⊂ "Pokemon Card 151"),
// needing two or more words so a lone "Promo" can't match everything.
export function resolveGroups(setName: string | null | undefined, groups: TcgGroup[], lang: "en" | "ja"): TcgGroup[] {
  if (!setName?.trim()) return [];
  const variants = itemSetVariants(setName, lang);
  const cores = groups.map((g) => ({ g, core: norm(groupCore(g.name)), code: norm(g.abbreviation ?? "") }));

  const exact = cores.filter((c) => variants.some((v) => v === c.core || (c.code && v === c.code)));
  if (exact.length) return exact.map((c) => c.g);

  const loose = cores.filter((c) => variants.some((v) => {
    const a = words(v), b = words(c.core);
    return (a.size >= 2 && within(a, b)) || (b.size >= 2 && within(b, a));
  }));
  return loose.length <= 3 ? loose.map((c) => c.g) : [];
}

// ── Last resort ──
// When a set name maps to nothing, the closest-named groups by shared words
// (ignoring filler like "the", "pokemon", "card"): at most `limit`, each
// sharing at least half its meaningful words with the set name. This only
// widens where to look: pickProduct still has to find the exact card (same
// number and name, or the only card with that name), so a loose guess at the
// set can't put the wrong card's art on an item.
const FILLER = new Set(["the", "and", "to", "a", "of", "pokemon", "card", "cards", "set", "japanese", "jp", "promo", "promotional"]);
const meaningful = (s: string) => new Set(s.split(" ").filter((w) => w && !FILLER.has(w)));

export function closestGroups(setName: string | null | undefined, groups: TcgGroup[], lang: "en" | "ja", limit = 3): TcgGroup[] {
  if (!setName?.trim()) return [];
  const want = new Set(itemSetVariants(setName, lang).flatMap((v) => [...meaningful(v)]));
  if (!want.size) return [];
  return groups
    .map((g) => {
      const have = meaningful(norm(groupCore(g.name)));
      const shared = [...want].filter((w) => have.has(w)).length;
      return { g, score: shared / Math.max(want.size, have.size), shared };
    })
    .filter((x) => x.shared > 0 && x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.g);
}

// ── Sub-sets ──
// TCGplayer lists a set's gallery and vault cards as their own groups
// ("SWSH09: Brilliant Stars Trainer Gallery", "Crown Zenith: Galarian
// Gallery"), while catalogs file them under the main set (TG22 in Brilliant
// Stars). Only these named sub-sets count, so "Base Set" never reaches into
// "Base Set 2".
const SUBSETS = ["trainer gallery", "galarian gallery", "shiny vault", "classic collection", "radiant collection"];

export function withSubsets(mapped: TcgGroup[], groups: TcgGroup[]): TcgGroup[] {
  const out = [...mapped];
  for (const m of mapped) {
    const core = norm(groupCore(m.name));
    for (const g of groups) {
      if (out.includes(g)) continue;
      const other = norm(groupCore(g.name));
      if (SUBSETS.some((s) => other === `${core} ${s}`)) out.push(g);
    }
  }
  return out;
}

// Where to look for a card, in order: the mapped set and its sub-sets; if
// the set maps to nothing, the closest-named sets
export function candidateGroups(setName: string | null | undefined, groups: TcgGroup[], lang: "en" | "ja"): TcgGroup[] {
  const mapped = resolveGroups(setName, groups, lang);
  return mapped.length ? withSubsets(mapped, groups) : closestGroups(setName, groups, lang);
}

const field = (p: TcgProduct, key: string) => p.extendedData?.find((e) => e.name === key)?.value ?? null;
const isCard = (p: TcgProduct) => field(p, "Number") != null || field(p, "Rarity") != null;

// The product in a group that is this card: the same number with a matching
// name; or, for vintage Japanese cards that carry no number, the only card in
// the group with this name.
export function pickProduct(products: TcgProduct[], itemName: string, number: string | null | undefined): TcgProduct | null {
  const cards = products.filter(isCard);
  // Within the matched group, "SVP 175" may be listed as 175; exact wins
  for (const key of numberKeys(number, { withinSet: true })) {
    const hits = cards.filter((p) => normNum(field(p, "Number")) === key && nameLooksRight(itemName, p.name));
    if (hits.length) return hits.find((p) => p.imageUrl) ?? hits[0];
  }
  const base = norm(stripParens(itemName).replace(/\s+-\s+[\w/-]+$/, ""));
  const unnumbered = cards.filter((p) => !field(p, "Number") && norm(stripParens(p.name)) === base);
  return unnumbered.length === 1 ? unnumbered[0] : null;
}

// TCGCSV gives the 200px thumbnail; TCGplayer serves 1000px at a sibling URL
export function hiResImage(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/_200w\.jpg$/, "_in_1000x1000.jpg");
}

// ── Prices ──
/** One printing's TCGplayer prices: "Holofoil", "Reverse Holofoil", "1st Edition Holofoil"… */
export type Printing = { name: string; market: number | null; low: number | null };

/** A card's TCGplayer listing: its rarity and prices per printing, primary first */
export type Quote = {
  productId: number;
  url: string | null;
  rarity: string | null;
  /** The primary printing's market price (what a tile shows) */
  market: number | null;
  printings: Printing[];
};

// The standard print comes before reverse holos and 1st Editions, which
// people name when they mean them
const PRIMARY = ["Holofoil", "Normal", "Unlimited Holofoil", "Unlimited"];
const printRank = (name: string) => {
  const i = PRIMARY.indexOf(name);
  return i < 0 ? PRIMARY.length : i;
};

// A product's printings that have a price, primary first
export function toPrintings(prices: TcgPrice[]): Printing[] {
  return prices
    .filter((p) => p.marketPrice != null || p.lowPrice != null)
    .map((p) => ({ name: p.subTypeName, market: p.marketPrice ?? null, low: p.lowPrice ?? null }))
    .sort((a, b) => printRank(a.name) - printRank(b.name) || a.name.localeCompare(b.name));
}

// TCGplayer writes "None" for cards without a rarity mark
const rarityOf = (p: TcgProduct) => {
  const r = field(p, "Rarity")?.trim();
  return r && r !== "None" ? r : null;
};

export function toQuote(product: TcgProduct, prices: TcgPrice[]): Quote {
  const printings = toPrintings(prices.filter((p) => p.productId === product.productId));
  const url = product.url && /^https:\/\/www\.tcgplayer\.com\//.test(product.url) ? product.url : null;
  return {
    productId: product.productId,
    url,
    rarity: rarityOf(product),
    market: printings.find((p) => p.market != null)?.market ?? null,
    printings,
  };
}

// ── Catalog rows (tcgplayer_cards, Search's Japanese tab) ──
// TCGplayer's product names carry the number, and variants are separate
// products: "Bulbasaur - 001/165 (Poke Ball Pattern)" → "Bulbasaur (Poke Ball
// Pattern)". The number has its own column.
export function productCardName(name: string): string {
  return name.replace(/\s+-\s+[\w/.-]+(?=\s*\(|\s*$)/, "").replace(/\s+/g, " ").trim();
}

export type CatalogEntry = {
  product_id: number;
  lang: "en" | "ja";
  group_id: number;
  set_name: string;
  set_code: string | null;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  url: string | null;
  /** Left out (not null) when the group's price list didn't load, so stored prices stay */
  market?: number | null;
  printings?: Printing[];
  updated_at: string;
};

// The catalog row for a product that is a card; sealed products and other
// non-cards are null. `prices` null = the price list is missing.
export function toCatalogEntry(
  p: TcgProduct, g: TcgGroup, lang: "en" | "ja", prices: TcgPrice[] | null, now: string,
): CatalogEntry | null {
  if (!isCard(p)) return null;
  const quote = toQuote(p, prices ?? []);
  return {
    product_id: p.productId,
    lang,
    group_id: g.groupId,
    set_name: groupCore(g.name),
    set_code: g.abbreviation?.trim() || null,
    name: productCardName(p.name),
    card_number: field(p, "Number")?.trim() || null,
    rarity: quote.rarity,
    image_url: hiResImage(p.imageUrl),
    url: quote.url,
    ...(prices ? { market: quote.market, printings: quote.printings } : {}),
    updated_at: now,
  };
}

// ── Inventory prices (nightly job) ──
// The market price for an inventory single: the primary printing, unless the
// item names a variant. "Reverse" / "1st Edition" price that printing, or
// nothing when TCGplayer doesn't list it (never the primary's price instead).
export function printingMarket(quote: Quote, itemName: string): number | null {
  const want = /\breverse\b/i.test(itemName) ? /reverse/i
    : /\b1st\s*ed(ition)?\b/i.test(itemName) ? /^1st edition/i
    : null;
  if (!want) return quote.market;
  return quote.printings.find((p) => want.test(p.name) && p.market != null)?.market ?? null;
}

// ── Sealed products ──
// TCGplayer names sealed products "<set> <kind>": "Surging Sparks Elite
// Trainer Box", "151 Booster Bundle". Cases, displays and store exclusives are
// products of their own ("… Elite Trainer Box Case", "… Pokemon Center Elite
// Trainer Box (Exclusive)"), so an item matches only the one product whose
// kind has exactly its words. Two candidates (an "(LGS)" and a "(Retail)"
// bundle) mean no match rather than a guess.
const SEALED_ALIASES: [RegExp, string][] = [
  [/\bpc etb\b/g, "pokemon center elite trainer box"],
  [/\betb\b/g, "elite trainer box"],
  [/\bupc\b/g, "ultra premium collection"],
  [/\bspc\b/g, "super premium collection"],
  [/\bbooster display\b/g, "booster box"],
];
// Words about the listing, not the product
// ("Pokemon Center … (Exclusive)" is still told apart by "pokemon center")
const SEALED_NOISE = new Set(["sealed", "english", "japanese", "jp", "new", "factory", "tcg", "exclusive"]);
// What an item whose name is just the set is, by its product type
const TYPE_KIND: Record<string, string> = {
  etb: "elite trainer box", booster_box: "booster box", bundle: "booster bundle", booster_pack: "booster pack",
};

function sealedWords(s: string): string[] {
  let t = norm(s);
  for (const [re, to] of SEALED_ALIASES) t = t.replace(re, to);
  return t.split(" ").filter((w) => w && !SEALED_NOISE.has(w));
}

const productKind = (p: TcgProduct, setWords: Set<string>) =>
  sealedWords(p.name).filter((w) => !setWords.has(w)).sort().join(" ");

export type SealedItem = { name: string; set_name: string | null; product_type: string | null };

// The item's kind ("booster box elite trainer" sorted), or null when the name
// and product type don't say
export function sealedKind(item: SealedItem, group: TcgGroup): string | null {
  const setWords = new Set([...sealedWords(groupCore(group.name)), ...(item.set_name ? sealedWords(item.set_name) : [])]);
  let words = sealedWords(item.name);
  if (words[0] === "pokemon" && words[1] !== "center") words = words.slice(1); // "Pokemon 151 ETB"
  words = words.filter((w) => !setWords.has(w));
  if (!words.length && item.product_type && TYPE_KIND[item.product_type]) words = TYPE_KIND[item.product_type].split(" ");
  return words.length ? words.sort().join(" ") : null;
}

export function pickSealedProduct(products: TcgProduct[], item: SealedItem, group: TcgGroup): TcgProduct | null {
  const want = sealedKind(item, group);
  if (!want) return null;
  const setWords = new Set(sealedWords(groupCore(group.name)));
  const hits = products.filter((p) => !isCard(p) && productKind(p, setWords) === want);
  return hits.length === 1 ? hits[0] : null;
}

// The sets a sealed item is from: its set name when it has one, else the
// longest set name inside its own name ("Surging Sparks Booster Box"). "151"
// alone names Scarlet & Violet 151.
export function sealedGroups(item: SealedItem, groups: TcgGroup[], lang: "en" | "ja"): TcgGroup[] {
  if (item.set_name?.trim()) return candidateGroups(item.set_name, groups, lang);
  const name = ` ${sealedWords(item.name).join(" ")} `;
  let best: TcgGroup[] = [];
  let bestLen = 0;
  for (const g of groups) {
    const core = sealedWords(groupCore(g.name)).join(" ");
    for (const v of new Set([core, core.replace(/^scarlet and violet (?=\d+$)/, "")])) {
      if (!v || !name.includes(` ${v} `)) continue;
      if (v.length > bestLen) { best = [g]; bestLen = v.length; }
      else if (v.length === bestLen && !best.includes(g)) best.push(g);
    }
  }
  return best;
}
