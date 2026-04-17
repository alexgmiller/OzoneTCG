import { NextRequest, NextResponse } from "next/server";
import { searchBaseNames, nameVariants, isJapaneseName } from "@/lib/cardNameUtils";
import { createClient } from "@/lib/supabase/server";

const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
const TCGDEX_JA = "https://api.tcgdex.net/v2/ja";
const FETCH_TIMEOUT_MS = 8000;

// ── Types ──────────────────────────────────────────────────────────────────────

type SearchResult = {
  name: string;
  setName: string;
  cardNumber: string;
  imageUrl: string | null;
  market: null;
  cardId: string;
};

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score a local DB card against the parsed search terms + full query string.
 * Higher score = better match.
 */
function scoreLocalCard(
  c: { name: string; set_name: string | null; set_id: string; card_number: string | null },
  terms: string[],
  fullQuery: string
): number {
  const name = c.name.toLowerCase();
  const setName = (c.set_name ?? c.set_id ?? "").toLowerCase();
  const num = (c.card_number ?? "").toLowerCase();
  let score = 0;

  // Full name exactly equals the full query (e.g. "Charizard ex")
  if (name === fullQuery) score += 100;
  // Name starts with the full query
  if (name.startsWith(fullQuery)) score += 50;
  // Name starts with the first term
  if (terms.length > 0 && name.startsWith(terms[0])) score += 20;

  for (const term of terms) {
    const numClean = term.replace(/^0+/, "");
    if (name === term) score += 30;
    if (name.startsWith(term)) score += 10;
    if (name.includes(term)) score += 5;
    if (setName.includes(term)) score += 3;
    if (numClean && num === numClean) score += 25;
    else if (numClean && /^\d/.test(numClean) && num.startsWith(numClean)) score += 12;
  }

  return score;
}

// ── Local DB search ───────────────────────────────────────────────────────────

/**
 * Multi-term AND search against the local pokemon_cards table.
 *
 * Strategy:
 *  1. Use the longest non-numeric term to hit the name index (fast fetch of candidates).
 *  2. Post-filter in JS: every term must appear somewhere in name | set_name | set_id | card_number.
 *  3. Score and sort by relevance.
 *  4. Return top 10 with full set_name (not set_id code).
 */
async function searchLocalDB(
  rawQuery: string,
  lang: "en" | "ja"
): Promise<SearchResult[]> {
  try {
    const supabase = await createClient();
    const terms = rawQuery
      .toLowerCase()
      .replace(/[',\-.]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => t.length > 0);

    if (!terms.length) return [];

    // Pick the best term to drive the indexed name lookup.
    // Longest alphabetic term is most distinctive (e.g. "charizard" beats "ex").
    const nameTerm =
      [...terms]
        .filter((t) => /[a-z]/i.test(t))
        .sort((a, b) => b.length - a.length)[0] ?? terms[0];

    // Fetch up to 60 candidates by name (uses index)
    const { data, error } = await supabase
      .from("pokemon_cards")
      .select("id, name, set_id, set_name, card_number, image_url")
      .eq("language", lang)
      .ilike("name", `%${nameTerm}%`)
      .order("name")
      .limit(60);

    if (error || !data?.length) return [];

    // Post-filter: ALL terms must match somewhere in the card's searchable text
    const filtered = data.filter((c) => {
      const searchable = [
        (c.name ?? "").toLowerCase(),
        (c.set_name ?? "").toLowerCase(),
        (c.set_id ?? "").toLowerCase(),
        (c.card_number ?? "").toLowerCase(),
      ].join(" ");
      return terms.every((term) => searchable.includes(term));
    });

    if (!filtered.length) return [];

    // Score, sort, trim to 10
    const fullQuery = rawQuery.toLowerCase().trim();
    const scored = filtered
      .map((c) => ({ c, score: scoreLocalCard(c, terms, fullQuery) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return scored.map(({ c }) => ({
      name: c.name,
      // Always use the human-readable set name; fall back to set_id code only if missing
      setName: c.set_name || c.set_id || "",
      cardNumber: c.card_number ?? "",
      imageUrl: c.image_url,
      market: null,
      cardId: c.id,
    }));
  } catch {
    return [];
  }
}

// ── TCGdex helpers ────────────────────────────────────────────────────────────

// Detect TCG Pocket cards (pocket set IDs start with an uppercase letter)
function isPocketCard(card: Record<string, unknown>): boolean {
  if (card.image && String(card.image).includes("/tcgp/")) return true;
  return /^[A-Z]/.test(String(card.id ?? ""));
}

function toResult(card: Record<string, unknown>): SearchResult {
  const cardId = String(card.id ?? "");
  const localId = String(card.localId ?? "");
  const setId =
    localId && cardId.endsWith("-" + localId)
      ? cardId.slice(0, cardId.length - localId.length - 1)
      : "";
  return {
    name: String(card.name ?? ""),
    setName: setId,           // TCGdex brief response only gives us the set code
    cardNumber: localId,
    imageUrl: card.image ? `${String(card.image)}/high.webp` : null,
    market: null,
    cardId,
  };
}

async function fetchTcgDex(
  params: string,
  baseUrl = TCGDEX_EN
): Promise<SearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/cards?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((c: Record<string, unknown>) => !isPocketCard(c))
      .slice(0, 20)
      .map(toResult);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── TCGdex name extraction ─────────────────────────────────────────────────────

/**
 * Known card-name qualifiers.
 * When we see one of these tokens, everything up to and including it is the card name.
 */
const CARD_QUALIFIERS = new Set([
  "ex", "gx", "v", "vmax", "vstar", "mega", "break", "prime", "legend",
  "lv.x", "gl", "fb", "4", "sp", "c", "δ",
]);

/**
 * Given a raw multi-word query, extract the most likely card name portion.
 *
 * "charizard ex obsidian" → "charizard ex"
 * "umbreon vmax"          → "umbreon vmax"
 * "rayquaza evolving"     → "rayquaza"      (no qualifier; single word)
 * "pikachu 25"            → "pikachu"
 * "base charizard"        → "base charizard" (no qualifier, all words kept as name)
 */
function extractTcgDexName(query: string): string {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const wordTokens = tokens.filter((t) => !/^\d+$/.test(t));

  if (wordTokens.length <= 1) return wordTokens[0] ?? query;

  // Scan for the first qualifier token; include it and stop
  const qualifierIdx = wordTokens.findIndex((t) => CARD_QUALIFIERS.has(t));
  if (qualifierIdx >= 0) {
    return wordTokens.slice(0, qualifierIdx + 1).join(" ");
  }

  // No qualifier found: use the first word only (the rest are likely set name hints)
  return wordTokens[0];
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Accept both new { query } format and old { name, setName, cardNumber } format
  const rawQuery: string = (body.query ?? body.name ?? "").trim();
  const cardNumber: string | undefined = body.cardNumber?.trim() || undefined;

  if (!rawQuery) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // Language detection
  const isJP = isJapaneseName(rawQuery) || /\bjapanese\b|^jp$/i.test(rawQuery);
  const lang: "en" | "ja" = isJP ? "ja" : "en";

  // ── 1. Local DB (multi-term AND search) ─────────────────────────────────────
  const local = await searchLocalDB(rawQuery, lang);
  if (local.length > 0) {
    return NextResponse.json({ cards: local, source: "db" });
  }

  // ── 2. TCGdex fallback ───────────────────────────────────────────────────────
  // Extract the card name portion from the raw query (stops at qualifiers)
  const tcgName = extractTcgDexName(rawQuery);

  const endpoints = isJP ? [TCGDEX_JA, TCGDEX_EN] : [TCGDEX_EN];

  // Build de-duplicated query strings for TCGdex
  const seen = new Set<string>();
  const queries: string[] = [];
  function addQuery(q: string) {
    if (!seen.has(q)) { seen.add(q); queries.push(q); }
  }

  for (const baseName of searchBaseNames(tcgName)) {
    for (const n of nameVariants(baseName)) {
      const en = encodeURIComponent(n);
      if (cardNumber) {
        addQuery(`name=eq:${en}&localId=${encodeURIComponent(cardNumber)}`);
        addQuery(`name=${en}&localId=${encodeURIComponent(cardNumber)}`);
      }
      addQuery(`name=eq:${en}`);
      addQuery(`name=${en}`);
    }
  }

  const resultSeen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const endpoint of endpoints) {
    if (merged.length >= 24) break;
    const allResults = await Promise.all(queries.map((q) => fetchTcgDex(q, endpoint)));
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

  // Post-filter TCGdex results against the remaining terms
  // (TCGdex results don't have set_name, only set code — best-effort filter on name terms)
  const terms = rawQuery.toLowerCase().replace(/[',\-.]/g, " ").split(/\s+/).filter(Boolean);
  const nameTerms = terms.filter((t) => !/^\d+$/.test(t));
  const filtered = merged.filter((r) => {
    const searchable = `${r.name.toLowerCase()} ${r.setName.toLowerCase()} ${r.cardNumber.toLowerCase()}`;
    // Require at least the name-related terms to match (set terms may not be matchable via set code)
    return nameTerms.every((t) => searchable.includes(t));
  });

  // Return filtered if we got anything, else fall back to unfiltered merged
  const final = filtered.length > 0 ? filtered : merged;
  return NextResponse.json({ cards: final.slice(0, 10) });
}
