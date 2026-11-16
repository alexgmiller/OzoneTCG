// ── Card art matching ──
// Pure rules for deciding which catalog card an inventory item IS, so its art
// is that exact printing or nothing. Set + number identifies a card; a name on
// its own never does (there are hundreds of "Pikachu"). No Supabase, no fetch.
//
// Used by the TCGdex image lookup (pokemonPriceTracker.ts), by the image cache
// (to distrust guesses the old matcher cached) and by the one-off cleanup.

import { stripParens } from "./cardNameUtils";

export type TcgdexSet = { id: string; name: string };
export type TcgdexCard = { id: string; localId: string; name: string; image?: string | null };

// ── Numbers ──
// "185/165" → "185", "027" → "27", "TG01" → "TG1", "SVP 175" → "SVP175",
// "143a" → "143A". Null when there is no number.
export function normNum(n: string | null | undefined): string | null {
  const raw = (n ?? "").split("/")[0].replace(/\s+/g, "").toUpperCase();
  if (!raw) return null;
  const m = raw.match(/^([A-Z-]*?)0*(\d+)([A-Z]*)$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : raw;
}

// Keys a card number may appear under. Inside a known set the SV-era promo
// prefix can be dropped ("SVP 175" is svp #175). Only that prefix: TG / GG /
// SV / RC are part of the number, and "TG22" without its prefix is #022, a
// different card. Without a set, no dropping at all.
const DROPPABLE_PREFIX = /^(SVP|MEP)(\d+[A-Z]*)$/;

export function numberKeys(n: string | null | undefined, opts: { withinSet: boolean }): string[] {
  const key = normNum(n);
  if (!key) return [];
  const keys = [key];
  const bare = opts.withinSet ? key.match(DROPPABLE_PREFIX)?.[2] : undefined;
  if (bare) keys.push(bare);
  return keys;
}

// ── Set names ──
const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();

// Inventory set names for promo sets → TCGdex's names
const PROMO_SETS: [RegExp, string][] = [
  [/^(sm|sun and moon)( black star)? promos?$/, "SM Black Star Promos"],
  [/^(xy)( black star)? promos?$/, "XY Black Star Promos"],
  [/^(sv|svp|scarlet and violet)( black star)? promos?$/, "SVP Black Star Promos"],
  [/^(swsh|sword and shield)( black star)? promos?$/, "SWSH Black Star Promos"],
  [/^(bw|black and white)( black star)? promos?$/, "BW Black Star Promos"],
  [/^(dp|diamond and pearl)( black star)? promos?$/, "DP Black Star Promos"],
  [/^(hgss|heartgold soulsilver)( black star)? promos?$/, "HGSS Black Star Promos"],
  [/^(wizards|wotc)( black star)? promos?$/, "Wizards Black Star Promos"],
];

// Spellings of one set name to try against TCGdex, most literal first
function nameVariants(setName: string): string[] {
  const out = new Set<string>();
  const base = setName.replace(/\((japanese|jp)\)/gi, "").replace(/\s+jp$/i, "").trim();
  const n = norm(base);
  out.add(n);
  for (const [re, name] of PROMO_SETS) if (re.test(n)) out.add(norm(name));
  out.add(n.replace(/^pokemon /, ""));                  // "Pokemon 151" → "151"
  out.add(n.replace(/^sv /, ""));                       // "SV: 151" → "151"
  out.add(n.replace(/^ex /, ""));                       // "EX Delta Species" → "Delta Species"
  out.add(n.replace(/ base set$/, ""));                 // "Sun & Moon Base Set" → "Sun & Moon"
  if (base.includes(":")) out.add(norm(base.split(":")[0]));  // "Legendary Treasures: Radiant Collections"
  if (base.includes(":")) out.add(norm(base.split(":")[1]));  // → "Radiant Collection(s)"
  out.add(n.replace(/s$/, ""));                         // "Radiant Collections" → "Radiant Collection"
  return [...out].filter(Boolean);
}

// Sub-sets keep their art under the parent set (swsh9tg TG22 → /swsh9/TG22)
export function parentSetId(id: string): string | null {
  const m = id.match(/^(.+?)(tg|gg|cc)$/);
  return m ? m[1] : null;
}

// TCGdex set ids an inventory set name refers to: the set itself, its
// sub-sets / parent (Trainer Gallery, Galarian Gallery, Classic Collection)
// and, for "A: B" names, both halves. Empty when the name is unknown.
export function resolveSetIds(setName: string | null | undefined, sets: TcgdexSet[]): string[] {
  if (!setName?.trim()) return [];
  const byId = new Map(sets.map((s) => [s.id.toLowerCase(), s.id]));
  const byName = new Map(sets.map((s) => [norm(s.name), s.id]));
  const found = new Set<string>();

  const asId = byId.get(setName.trim().toLowerCase());
  if (asId) found.add(asId);
  for (const v of nameVariants(setName)) {
    const id = byName.get(v) ?? byName.get(v.replace(/s$/, ""));
    if (id) found.add(id);
  }
  // Include sub-sets and parents so a TG / GG / CC card is found either way
  for (const id of [...found]) {
    const parent = parentSetId(id);
    if (parent && byId.has(parent.toLowerCase())) found.add(byId.get(parent.toLowerCase())!);
    for (const suffix of ["tg", "gg", "cc"]) {
      const sub = byId.get(`${id}${suffix}`.toLowerCase());
      if (sub) found.add(sub);
    }
  }
  return [...found];
}

// ── Names ──
// The item's name is close enough to the catalog card's: its first real word
// appears ("Jolteon (Delta Species)" ↔ "Jolteon δ", "M Gengar EX" ↔ "M Gengar-EX").
export function nameLooksRight(itemName: string, cardName: string): boolean {
  const words = stripParens(itemName).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/);
  const key = words.find((w) => w.length >= 3);
  return !key || cardName.toLowerCase().includes(key);
}

// The card in a set with this number, preferring one that has art. An exact
// number always wins: "TG22" is the Trainer Gallery card, never #022 in the
// main set. The prefix-less form ("SVP 175" → #175) is only a fallback.
export function pickByNumber(cards: TcgdexCard[], number: string | null | undefined): TcgdexCard | null {
  for (const key of numberKeys(number, { withinSet: true })) {
    const hits = cards.filter((c) => normNum(c.localId) === key);
    if (hits.length) return hits.find((c) => c.image) ?? hits[0];
  }
  return null;
}

// ── Checking an existing image ──
// Image URLs carry their card's set and number:
//   https://assets.tcgdex.net/en/sv/sv03.5/198/high.webp
//   https://images.pokemontcg.io/sv3pt5/198_hires.png
export type ArtVerdict = "ok" | "wrong" | "unknown";

type ParsedArt = {
  host: "tcgdex" | "ptcgio" | "other";
  lang: string | null;   // "en" / "ja"…; pokemontcg.io is English-only
  serie: string | null;  // TCGdex series folder; "tcgp" = TCG Pocket
  setId: string | null;
  num: string | null;
};

export function parseArtUrl(url: string): ParsedArt {
  try {
    const u = new URL(url);
    const p = u.pathname.split("/").filter(Boolean);
    if (u.host === "assets.tcgdex.net") return { host: "tcgdex", lang: p[0] ?? null, serie: p[1] ?? null, setId: p[2] ?? null, num: p[3] ?? null };
    if (u.host === "images.pokemontcg.io") return { host: "ptcgio", lang: "en", serie: null, setId: p[0] ?? null, num: (p[1] ?? "").replace(/(_hires)?\.png$/i, "") };
  } catch { /* fall through */ }
  return { host: "other", lang: null, serie: null, setId: null, num: null };
}

// Whether an image URL is this item's card. "unknown" when the URL or the
// item doesn't carry enough to tell (other hosts, unmappable set names).
export function artVerdict(
  item: { set_name: string | null; card_number: string | null },
  url: string | null | undefined,
  sets: TcgdexSet[],
): ArtVerdict {
  if (!url) return "unknown";
  const p = parseArtUrl(url);
  if (p.host === "other") return "unknown";
  // TCG Pocket art (its own "tcgp" series folder) is never a physical card
  if (p.host === "tcgdex" && p.serie === "tcgp") return "wrong";

  // `sets` is TCGdex's English list, so a Japanese printing's set code
  // ("SV2a") can't be compared against it; its number still can
  const english = p.lang === "en";
  const setIds = english ? resolveSetIds(item.set_name, sets).map((s) => s.toLowerCase()) : [];
  const keys = numberKeys(item.card_number, { withinSet: setIds.length > 0 });
  if (keys.length && !keys.includes(normNum(p.num) ?? "")) return "wrong";
  if (p.host === "tcgdex" && setIds.length) {
    return setIds.includes((p.setId ?? "").toLowerCase()) ? "ok" : "wrong";
  }
  return "unknown";
}
