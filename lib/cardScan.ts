// ── Card scanning: a photo in, the card out ──
// PokeInvest's /api/identify takes a photo of a raw card or a slab at any
// angle and returns its best matches (about 0.4s; 91–96% right in their own
// tests). Each match is then found in our catalog (English: pokemon_cards,
// Japanese: tcgplayer_cards) so the rest of the app can treat it like a card
// picked from Search: the card sheet, Add to inventory, the POS cart.
//
// Calls: the free keyless identify first (about 60 a day per address). Only
// when that's used up does a scan spend one of the API key's calls, at most
// KEY_SCANS_PER_DAY a day, counted in card_scans
// (migrations/20261120_card_scans.sql), since the key's 1,000 a month also
// price slabs and singles.

import { normNum } from "./cardArtMatch";
import { firstWord, setSimilarity, splitName } from "./pokeinvestSlabs";
import { POKEINVEST_URL } from "./pokeinvest";

export const KEY_SCANS_PER_DAY = 10;
/** Matches shown to pick from */
export const SCAN_CHOICES = 3;

// ── PokeInvest's answer ──

export type IdentifyCandidate = {
  id: string;
  /** "Espeon VMAX #270" */
  name: string;
  set: string;
  image: string | null;
  page_url: string | null;
  /** "likely", … */
  confidence: string;
  similarity: number;
  psa_10_usd: number | null;
  ungraded_usd: number | null;
};

export type IdentifyResult =
  | { status: "ok"; via: "free" | "key"; candidates: IdentifyCandidate[] }
  /** The free scans are used up and the key may not be used (or is capped) */
  | { status: "limit" }
  | { status: "offline" }
  | { status: "error"; message: string };

export function parseCandidates(body: unknown): IdentifyCandidate[] {
  const list = (body as { candidates?: unknown } | null)?.candidates;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: IdentifyCandidate[] = [];
  for (const c of list as Record<string, unknown>[]) {
    if (!c || typeof c.id !== "string" || typeof c.name !== "string" || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({
      id: c.id,
      name: c.name,
      set: typeof c.set === "string" ? c.set : "",
      image: typeof c.image === "string" ? c.image : null,
      page_url: typeof c.page_url === "string" ? c.page_url : null,
      confidence: typeof c.confidence === "string" ? c.confidence : "",
      similarity: typeof c.similarity === "number" ? c.similarity : 0,
      psa_10_usd: typeof c.psa_10_usd === "number" ? c.psa_10_usd : null,
      ungraded_usd: typeof c.ungraded_usd === "number" ? c.ungraded_usd : null,
    });
  }
  return out;
}

async function postImage(image: Blob, key: string | undefined): Promise<{ status: number; body: unknown }> {
  const form = new FormData();
  form.append("image", image, "card.jpg");
  const res = await fetch(`${POKEINVEST_URL}/api/identify`, {
    method: "POST",
    body: form,
    headers: key ? { "X-API-Key": key } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep the text */ }
  return { status: res.status, body };
}

// Keyless first; the key only when the free scans are used up and `useKey`
// says one may be spent (the caller checks today's count)
export async function identifyImage(image: Blob, opts: { key: string | undefined; useKey: () => Promise<boolean> }): Promise<IdentifyResult> {
  try {
    let via: "free" | "key" = "free";
    let answer = await postImage(image, undefined);
    if (answer.status === 429) {
      if (!opts.key || !(await opts.useKey())) return { status: "limit" };
      via = "key";
      answer = await postImage(image, opts.key);
      if (answer.status === 429) return { status: "limit" };
    }
    if (answer.status === 503) return { status: "offline" };
    if (answer.status === 400) return { status: "error", message: "PokeInvest couldn't read that photo." };
    if (answer.status < 200 || answer.status >= 300) return { status: "error", message: `PokeInvest answered ${answer.status}.` };
    return { status: "ok", via, candidates: parseCandidates(answer.body) };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

// ── Finding the match in our catalog ──

/** Which catalog a PokeInvest set lives in; Chinese, Korean and the rest aren't in ours */
export function scanLang(set: string): "en" | "ja" | null {
  if (/^japanese\b/i.test(set.trim())) return "ja";
  if (/^(chinese|korean|thai|indonesian|traditional|simplified)\b/i.test(set.trim())) return null;
  return "en";
}

type CatalogLike = { name: string; setName: string; cardNumber: string | null };

// The catalog card that is PokeInvest's match: same number, same leading
// name, then the closest set name (Charizard #4 is in Base Set and Base Set 2)
export function pickCatalogCard<T extends CatalogLike>(cards: T[], match: { name: string; set: string }): T | null {
  const { name, number } = splitName(match.name);
  const num = normNum(number);
  const word = firstWord(name);
  if (!num || !word) return null;
  const same = cards.filter((c) => normNum(c.cardNumber) === num && firstWord(c.name) === word);
  if (same.length <= 1) return same[0] ?? null;
  return [...same].sort((a, b) => setSimilarity(b.setName, match.set) - setSimilarity(a.setName, match.set))[0];
}

export type ScanMatch<T> = {
  pokeinvestId: string;
  name: string;
  number: string | null;
  set: string;
  image: string | null;
  pageUrl: string | null;
  confidence: string;
  psa10: number | null;
  raw: number | null;
  lang: "en" | "ja" | null;
  /** The same card in our catalog, when it's there */
  card: T | null;
};

// The top matches, each looked up in the catalog by name and number
export async function toScanMatches<T extends CatalogLike>(
  candidates: IdentifyCandidate[],
  search: (query: string, lang: "en" | "ja") => Promise<T[]>,
  limit = SCAN_CHOICES,
): Promise<ScanMatch<T>[]> {
  return Promise.all(candidates.slice(0, limit).map(async (c) => {
    const { name, number } = splitName(c.name);
    const lang = scanLang(c.set);
    const num = (number ?? "").split("/")[0];
    const found = lang ? await search(`${name} ${num}`.trim(), lang).catch(() => [] as T[]) : [];
    return {
      pokeinvestId: c.id, name, number, set: c.set, image: c.image, pageUrl: c.page_url,
      confidence: c.confidence, psa10: c.psa_10_usd, raw: c.ungraded_usd, lang,
      card: pickCatalogCard(found, c),
    };
  }));
}
