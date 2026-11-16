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
  extendedData?: { name: string; value: string }[];
};

export const CATEGORY = { en: 3, ja: 85 } as const;

const norm = (s: string) =>
  s.toLowerCase()
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
];
const JA_ALIASES: [RegExp, string][] = [
  [/^team rocket$/, "rocket gang"],
  [/^base set$/, "base expansion pack"],
  [/^(sm|sun and moon) promo$/, "sun and moon promo"],
  [/^(swsh|sword and shield) promo$/, "sword and shield promo"],
  [/^(sv|scarlet and violet) promo$/, "sv p promotional cards"],
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
