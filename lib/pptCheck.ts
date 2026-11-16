// ── PokemonPriceTracker check ──
// One request for one card with eBay (graded) sales included, to see whether
// the deployed key works and what data the API offers before building on it.
// Used by Settings → Check price sources. The key never leaves the server.
//
// Japanese cards need language=japanese: without it the API only searches
// English cards, and a Japanese tcgPlayerId comes back empty. History is left
// out (the free plan keeps only 3 days of it), so each card costs 2 credits.

const PPT_CARDS = "https://www.pokemonpricetracker.com/api/v2/cards";

export type PptCheck = {
  configured: boolean;
  ok?: boolean;
  status?: number;
  error?: string;
  /** Rate-limit / credit headers, when the API sends them */
  limits?: Record<string, string>;
  /** The response, shortened (long arrays and strings cut) */
  sample?: unknown;
};

export function pptCheckParams(tcgPlayerId: number, lang: "en" | "ja"): URLSearchParams {
  const params = new URLSearchParams({ tcgPlayerId: String(tcgPlayerId), includeEbay: "true", days: "30" });
  if (lang === "ja") params.set("language", "japanese");
  return params;
}

export async function checkPokemonPriceTracker(tcgPlayerId: number, lang: "en" | "ja"): Promise<PptCheck> {
  const key = process.env.POKEMON_PRICE_TRACKER_API_KEY?.trim();
  if (!key) return { configured: false };
  const params = pptCheckParams(tcgPlayerId, lang);
  try {
    const res = await fetch(`${PPT_CARDS}?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const limits = Object.fromEntries([...res.headers].filter(([k]) => /rate|credit|limit|remaining|usage|quota/i.test(k)));
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* not JSON: keep the text */ }
    return { configured: true, ok: res.ok, status: res.status, limits, sample: shrink(body) };
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// A readable slice of a large response: arrays keep their first items and say
// how many there were, long strings are cut, deep nesting stops
export function shrink(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  if (Array.isArray(v)) {
    const head = v.slice(0, 2).map((x) => shrink(x, depth + 1));
    return v.length > 2 ? [...head, `…${v.length} items`] : head;
  }
  if (v && typeof v === "object") {
    if (depth >= 6) return "{…}";
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shrink(x, depth + 1)]));
  }
  return v;
}
