// ── TCGCSV client ──
// TCGCSV (tcgcsv.com) is a free, daily mirror of TCGplayer's catalog and
// prices: group (set) lists per category — 3 = Pokémon, 85 = Pokémon Japan —
// and, per group, a product list (names, numbers, rarity, images) and a price
// list (low / mid / market per printing). It refreshes once a day, so lists
// are kept per process for a few hours: a search grid, the card sheet and the
// nightly art job share each download.
//
// Any failure reads as an empty list ("no match"), never an error.

import type { TcgGroup, TcgPrice, TcgProduct } from "./tcgplayerMatch";

const BASE = "https://tcgcsv.com/tcgplayer";
const TIMEOUT_MS = 15_000; // product lists are a few hundred KB
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_PARALLEL = 8; // polite to a free service; a grid touches ~30 sets

// ── At most MAX_PARALLEL requests in flight ──
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running < MAX_PARALLEL) running++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await fn();
  } finally {
    // Hand the slot straight to the next waiter, or free it
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

// ── Lists, kept for TTL_MS ──
const memo = new Map<string, { at: number; value: Promise<unknown[]> }>();

function results<T>(path: string, slim?: (rows: T[]) => T[]): Promise<T[]> {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T[]>;
  const value = slot(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}/${path}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "User-Agent": "OzoneTCG/1.0" },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const rows = ((await res.json()) as { results?: T[] }).results ?? [];
      return slim ? slim(rows) : rows;
    } finally {
      clearTimeout(timer);
    }
  }).catch(() => {
    memo.delete(path); // try again next time
    return [] as T[];
  });
  memo.set(path, { at: Date.now(), value });
  return value;
}

// Products carry long card text; keep only what matching and display use
const KEEP = new Set(["Number", "Rarity"]);
const slimProducts = (rows: TcgProduct[]): TcgProduct[] =>
  rows.map(({ productId, name, imageUrl, url, extendedData }) => ({
    productId, name, imageUrl, url,
    extendedData: extendedData?.filter((e) => KEEP.has(e.name)),
  }));

export const tcgGroups = (category: number) => results<TcgGroup>(`${category}/groups`);
export const tcgProducts = (category: number, groupId: number) =>
  results<TcgProduct>(`${category}/${groupId}/products`, slimProducts);
export const tcgPrices = (category: number, groupId: number) => results<TcgPrice>(`${category}/${groupId}/prices`);
