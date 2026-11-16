// ── TCGplayer art (via TCGCSV) ──
// Second art source after TCGdex, for the cards TCGdex is thin on: promos
// (SM, SV, XY…) and Japanese sets. TCGCSV (tcgcsv.com) is a free, daily mirror
// of TCGplayer's catalog: group (set) lists per category — 3 = Pokémon,
// 85 = Pokémon Japan — and product lists per group, with image URLs.
// Matching rules live in lib/tcgplayerMatch.ts (set + number, no guessing).
//
// Lists are fetched once per process and shared, so a nightly run downloads
// each relevant group once. Any failure means "no match", never an error.

import { cardLang } from "./cardArtMatch";
import { CATEGORY, hiResImage, pickProduct, resolveGroups, type TcgGroup, type TcgProduct } from "./tcgplayerMatch";

const TCGCSV = "https://tcgcsv.com/tcgplayer";
const TIMEOUT_MS = 15_000; // product lists are a few hundred KB

const groupsMemo = new Map<number, Promise<TcgGroup[]>>();
const productsMemo = new Map<string, Promise<TcgProduct[]>>();

function memoResults<T>(memo: Map<string | number, Promise<T[]>>, key: string | number, url: string): Promise<T[]> {
  let p = memo.get(key);
  if (!p) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    p = fetch(url, { cache: "no-store", signal: controller.signal, headers: { "User-Agent": "OzoneTCG/1.0" } })
      .then(async (res) => (res.ok ? (((await res.json()) as { results?: T[] }).results ?? []) : []))
      .catch(() => { memo.delete(key); return [] as T[]; })
      .finally(() => clearTimeout(timer));
    memo.set(key, p);
  }
  return p;
}

const groups = (category: number) =>
  memoResults<TcgGroup>(groupsMemo as Map<string | number, Promise<TcgGroup[]>>, category, `${TCGCSV}/${category}/groups`);
const products = (category: number, groupId: number) =>
  memoResults<TcgProduct>(productsMemo as Map<string | number, Promise<TcgProduct[]>>, `${category}/${groupId}`, `${TCGCSV}/${category}/${groupId}/products`);

export type TcgplayerArt = { imageUrl: string; productId: number; groupName: string };

// The TCGplayer image for this exact card, or null
export async function lookupTcgplayerArt(
  name: string,
  setName: string | null | undefined,
  cardNumber: string | null | undefined,
): Promise<TcgplayerArt | null> {
  const lang = cardLang({ name, set_name: setName ?? null });
  const category = CATEGORY[lang];
  const matched = resolveGroups(setName, await groups(category), lang);
  for (const g of matched) {
    const p = pickProduct(await products(category, g.groupId), name, cardNumber);
    const imageUrl = hiResImage(p?.imageUrl);
    if (p && imageUrl) {
      console.log(`[TCGplayer] "${name}" → ${p.name} [${p.productId}] in ${g.name}`);
      return { imageUrl, productId: p.productId, groupName: g.name };
    }
  }
  return null;
}
