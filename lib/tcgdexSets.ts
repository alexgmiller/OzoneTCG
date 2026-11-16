// TCGdex set list and per-set card lists, fetched once per process (a cron
// run or a server instance) and shared by the image lookup and the card art
// memory. Empty on failure, so callers treat TCGdex being down as "no match".

import type { TcgdexCard, TcgdexSet } from "./cardArtMatch";

export const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
export const TCGDEX_JA = "https://api.tcgdex.net/v2/ja";
const TIMEOUT_MS = 8000;

const setListMemo = new Map<string, Promise<TcgdexSet[]>>();
const setCardsMemo = new Map<string, Promise<TcgdexCard[]>>();

function memoFetch<T>(memo: Map<string, Promise<T>>, key: string, url: string, pick: (json: unknown) => T, empty: T): Promise<T> {
  let p = memo.get(key);
  if (!p) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    p = fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (res) => (res.ok ? pick(await res.json()) : empty))
      .catch(() => { memo.delete(key); return empty; })
      .finally(() => clearTimeout(timer));
    memo.set(key, p);
  }
  return p;
}

export function tcgdexSetList(endpoint: string = TCGDEX_EN): Promise<TcgdexSet[]> {
  return memoFetch(setListMemo, endpoint, `${endpoint}/sets`,
    (j) => (Array.isArray(j) ? (j as TcgdexSet[]) : []), []);
}

export function tcgdexSetCards(endpoint: string, setId: string): Promise<TcgdexCard[]> {
  return memoFetch(setCardsMemo, `${endpoint}|${setId}`, `${endpoint}/sets/${encodeURIComponent(setId)}`,
    (j) => ((j as { cards?: TcgdexCard[] })?.cards ?? []), []);
}
