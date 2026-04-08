import { NextRequest, NextResponse } from "next/server";
import { searchBaseNames, nameVariants, isJapaneseName, extractEmbeddedNumber } from "@/lib/cardNameUtils";
import { createClient } from "@/lib/supabase/server";

const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
const TCGDEX_JA = "https://api.tcgdex.net/v2/ja";

// Search local pokemon_cards table in Supabase
async function searchLocalDB(
  name: string,
  setName: string | undefined,
  cardNumber: string | undefined,
  lang: "en" | "ja"
): Promise<SearchResult[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pokemon_cards")
      .select("id, name, set_id, set_name, card_number, image_url")
      .eq("language", lang)
      .ilike("name", `%${name}%`)
      .order("name")
      .limit(40);

    if (setName) query = query.ilike("set_name", `%${setName}%`);
    if (cardNumber) query = query.eq("card_number", cardNumber);

    const { data, error } = await query;
    if (error || !data?.length) return [];

    // Sort: exact prefix matches first, then by name length (shorter = more specific)
    const lower = name.toLowerCase();
    const sorted = [...data].sort((a, b) => {
      const aStart = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
      const bStart = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return a.name.length - b.name.length;
    });

    return sorted.map((c) => ({
      name: c.name,
      setName: c.set_id ?? "",
      cardNumber: c.card_number ?? "",
      imageUrl: c.image_url,
      market: null,
      cardId: c.id,
    }));
  } catch {
    return [];
  }
}
const FETCH_TIMEOUT_MS = 8000;

type SearchResult = {
  name: string;
  setName: string;
  cardNumber: string;
  imageUrl: string | null;
  market: null;
  cardId: string;
};

function baseNumber(n: string | null | undefined): string | undefined {
  if (!n) return undefined;
  return n.split("/")[0].trim() || undefined;
}

// Cache year → set IDs that released in that year, keyed by endpoint
const yearSetIdCache = new Map<string, string[]>();

async function fetchSetIdsForYear(year: string, baseUrl: string): Promise<string[]> {
  const cacheKey = `${baseUrl}:${year}`;
  if (yearSetIdCache.has(cacheKey)) return yearSetIdCache.get(cacheKey)!;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${baseUrl}/sets?releaseDate=like:${year}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const ids = data.map((s: any) => String(s.id ?? "")).filter(Boolean);
    yearSetIdCache.set(cacheKey, ids);
    return ids;
  } catch {
    return [];
  }
}

// Detect TCG Pocket cards.
// The brief card response has no set object — detect via image URL path ("/tcgp/")
// or by card ID: all Pocket set IDs start with an uppercase letter (A1, A1a, B1a, P-A…)
// while every main TCG set ID starts with a lowercase letter.
function isPocketCard(card: any): boolean {
  if (card.image && String(card.image).includes("/tcgp/")) return true;
  return /^[A-Z]/.test(String(card.id ?? ""));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toResult(card: any): SearchResult {
  // Extract set ID from card id (format: "{setId}-{localId}").
  // Use localId to find the split point so hyphenated set IDs (e.g. tk-xy-p) work correctly.
  const cardId = String(card.id ?? "");
  const localId = String(card.localId ?? "");
  const setId =
    localId && cardId.endsWith("-" + localId)
      ? cardId.slice(0, cardId.length - localId.length - 1)
      : "";
  return {
    name: card.name ?? "",
    setName: setId,
    cardNumber: localId,
    imageUrl: card.image ? `${card.image}/high.webp` : null,
    market: null,
    cardId,
  };
}

async function fetchTcgDex(
  params: string,
  baseUrl = TCGDEX_EN,
  yearSetIds?: string[]
): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `${baseUrl}/cards?${params}`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = data.filter((card: any) => {
      if (isPocketCard(card)) return false;
      // Year filter: TCGdex doesn't support set-field filtering on the cards endpoint,
      // so we filter post-fetch by checking the card's own id against the year's set IDs.
      if (yearSetIds && yearSetIds.length > 0) {
        const cardId = String(card.id ?? "");
        if (!yearSetIds.some((sid) => cardId.startsWith(sid + "-"))) return false;
      }
      return true;
    });
    return filtered.slice(0, 20).map(toResult);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const { name, setName, cardNumber, year } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const num = baseNumber(cardNumber) ?? extractEmbeddedNumber(name.trim()) ?? undefined;
  const sn = setName?.trim() || undefined;
  const isJP = isJapaneseName(name) || /\bjapanese\b|^jp$/i.test(sn ?? "");
  const yearFilter = year?.trim().match(/^\d{4}$/) ? year.trim() : undefined;

  // Try local DB first — much faster than TCGdex API, and works offline
  // Skip for year-filtered searches (DB doesn't have release dates)
  if (!yearFilter) {
    const lang = isJP ? "ja" : "en";
    const local = await searchLocalDB(name.trim(), sn, num, lang);
    if (local.length > 0) {
      return NextResponse.json({ cards: local, source: "db" });
    }
  }

  // For JP cards: try JP endpoint first, then EN as fallback
  const endpoints = isJP ? [TCGDEX_JA, TCGDEX_EN] : [TCGDEX_EN];

  // Pre-fetch the set IDs that released in the target year.
  // TCGdex cards endpoint doesn't support set field filtering, so we filter
  // results post-fetch by checking each card's id against these set IDs.
  let yearSetIds: string[] = [];
  if (yearFilter) {
    const perEndpoint = await Promise.all(
      endpoints.map((ep) => fetchSetIdsForYear(yearFilter, ep))
    );
    yearSetIds = perEndpoint.flat();
  }

  // Build deduplicated queries using only fields the cards endpoint actually supports:
  // name (exact "eq:" or laxist) and localId.
  // Note: set.name / set.releaseDate / set.id filtering are NOT supported on the cards
  // endpoint and always return 0 results — don't include them.
  const seen = new Set<string>();
  const queries: string[] = [];
  function addQuery(q: string) {
    if (!seen.has(q)) {
      seen.add(q);
      queries.push(q);
    }
  }

  for (const baseName of searchBaseNames(name.trim())) {
    for (const n of nameVariants(baseName)) {
      const en = encodeURIComponent(n);
      if (num) {
        addQuery(`name=eq:${en}&localId=${encodeURIComponent(num)}`);
        addQuery(`name=${en}&localId=${encodeURIComponent(num)}`);
      }
      addQuery(`name=eq:${en}`);
      addQuery(`name=${en}`);
    }
  }

  const resultSeen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const endpoint of endpoints) {
    if (merged.length >= 24) break;
    const allResults = await Promise.all(
      queries.map((q) =>
        fetchTcgDex(q, endpoint, yearSetIds.length > 0 ? yearSetIds : undefined)
      )
    );
    for (const results of allResults) {
      for (const r of results) {
        const key = `${r.name}|${r.setName}|${r.cardNumber}`;
        if (!resultSeen.has(key)) {
          resultSeen.add(key);
          merged.push(r);
          if (merged.length >= 24) break;
        }
      }
      if (merged.length >= 24) break;
    }
  }

  return NextResponse.json({ cards: merged });
}
