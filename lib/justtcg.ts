/**
 * JustTCG API client — TCGPlayer pricing for raw Pokémon cards.
 *
 * API base: https://api.justtcg.com/v1
 * Auth:     x-api-key header
 * Plan:     Free — batch limit 20 cards/request
 *
 * Search strategy (two-phase):
 *   Phase 1 — set-filtered:
 *     1. Resolve set name → JustTCG set ID via GET /sets?q={setName}&game=pokemon
 *     2. Search GET /cards?q={name}&game=pokemon&set={setId}
 *     3. Match by exact card number; name as tiebreaker
 *   Phase 2 — name-only fallback (if set ID not found OR phase 1 returns 0 results):
 *     1. Search GET /cards?q={name}&game=pokemon (no set filter)
 *     2. Require BOTH set name fuzzy match AND card number match — otherwise reject
 *
 * Endpoints used:
 *   GET  /sets?q={name}&game=pokemon    — set ID lookup
 *   GET  /cards?q={name}&game=pokemon   — card search (with optional &set={id})
 *   POST /cards                          — batch lookup by cardId
 */

const BASE_URL = "https://api.justtcg.com/v1";
const BATCH_SIZE = 20;

// ── Types ──────────────────────────────────────────────────────────────────

export type PriceHistoryPoint = { date: string; price: number };

type JustTCGVariant = {
  condition: string; // "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged"
  printing: string;  // "Normal" | "Foil" | "1st Edition" | ...
  price: number;
  lastUpdated: string;
  priceHistory?: PriceHistoryPoint[];
};

type JustTCGCard = {
  cardId: string;
  name: string;
  set?: string;      // may be a display name OR a slug ID depending on endpoint
  setId?: string;    // explicit slug ID when present
  setName?: string;  // explicit display name when present
  number?: string;
  variants: JustTCGVariant[];
};

type JustTCGSet = {
  setId?: string;
  id?: string;
  name?: string;
  displayName?: string;
};

export type RawCardPrices = {
  nm: number | null;
  lp: number | null;
  mp: number | null;
  hp: number | null;
  dmg: number | null;
  printing: string;
  justtcgCardId: string;
  /** NM/Normal price history for the past 180 days, sorted ascending by date. */
  priceHistory: PriceHistoryPoint[] | null;
};

// ── Lookup key ─────────────────────────────────────────────────────────────

export function makeRawCardPriceKey(
  name: string,
  setName: string | null | undefined,
  cardNumber: string | null | undefined
): string {
  return [name, setName ?? "", cardNumber ?? ""]
    .map((s) => s.toLowerCase().trim())
    .join("|");
}

// ── Query cleaning ─────────────────────────────────────────────────────────

const LANG_TAG_RE = /\s*\((JP|EN|Japanese|English|KR|Korean|CH|Chinese)\)\s*/gi;

/**
 * Strip language tags from a card or set name before sending to JustTCG.
 * "Dark Alakazam (JP)" → "Dark Alakazam"
 * "Team Rocket (Japanese)" → "Team Rocket"
 * The original inventory value is never modified — only the query string.
 */
function cleanForQuery(s: string): string {
  return s.replace(LANG_TAG_RE, " ").replace(/\s{2,}/g, " ").trim();
}

// ── In-process set ID cache ────────────────────────────────────────────────
// Keyed by lowercase set name. Value is the JustTCG set ID, or null if
// the /sets lookup found no match (so we don't re-query).

const setIdCache = new Map<string, string | null>();

/**
 * Convert a JustTCG set slug ("twilight-masquerade-pokemon") to a readable
 * display name ("Twilight Masquerade") for fuzzy comparison.
 */
function slugToDisplayName(slug: string): string {
  return slug
    .replace(/-pokemon$/i, "")  // strip trailing "-pokemon"
    .replace(/-/g, " ")         // hyphens → spaces
    .replace(/\b\w/g, (c) => c.toUpperCase()); // title-case
}

/**
 * Normalize a set name for fuzzy comparison.
 *
 * Rules applied (in order):
 *   1. Lowercase
 *   2. Strip 2–3 letter set-code prefixes ("ex ", "sv: ", "sv07 ", "xy ", "bw ", …)
 *   3. Treat "&" and " and " as equivalent — both become a space
 *   4. Remove punctuation that varies between naming conventions (: - ' ( ))
 *   5. Collapse whitespace
 *
 * Examples:
 *   "EX Ruby & Sapphire"      → "ruby sapphire"
 *   "Ruby And Sapphire"       → "ruby sapphire"
 *   "SV: Prismatic Evolutions"→ "prismatic evolutions"
 *   "Sv07 Stellar Crown"      → "stellar crown"
 *   "Twilight Masquerade"     → "twilight masquerade"  (unchanged)
 *   "Base Set"                → "base set"             (unchanged — 4-letter "base" not stripped)
 */
function normalizeSetName(raw: string): string {
  return raw
    .toLowerCase()
    // Strip leading 2–3 letter set-code prefixes optionally followed by digits,
    // then a colon and/or whitespace.  Matches: "ex ", "sv: ", "sv07 ", "xy ".
    // Won't match 4-letter words like "base", "dark", "team".
    .replace(/^[a-z]{2,3}\d*[:\s]+/, "")
    // "&" and " and " are the same word
    .replace(/\s+and\s+/g, " ")
    .replace(/&/g, " ")
    // Strip punctuation that differs across naming conventions
    .replace(/[:\-'()]/g, " ")
    // Collapse multiple spaces
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Fuzzy set name comparison — normalizes both sides before comparing.
 * Also handles JustTCG slug IDs ("twilight-masquerade-pokemon").
 */
function setNamesMatch(ourName: string, theirName: string): boolean {
  // If theirName looks like a slug (no spaces, has hyphens), convert to display name first
  const bRaw = theirName.trim();
  const bDisplay = bRaw.includes(" ") ? bRaw : slugToDisplayName(bRaw);
  const a = normalizeSetName(ourName);
  const b = normalizeSetName(bDisplay);
  console.log(`[JustTCG]   setNamesMatch: "${ourName}" → "${a}"  vs  "${bDisplay}" → "${b}"  result=${a === b || a.includes(b) || b.includes(a)}`);
  return a === b || a.includes(b) || b.includes(a);
}

// ── Internal helpers ───────────────────────────────────────────────────────

function extractPricesForPrinting(
  variants: JustTCGVariant[],
  printing: string
): Omit<RawCardPrices, "printing" | "justtcgCardId"> {
  const forPrinting = variants.filter(
    (v) => v.printing.toLowerCase() === printing.toLowerCase()
  );
  // Fall back to all variants if none match the printing (shouldn't happen)
  const pool = forPrinting.length > 0 ? forPrinting : variants;

  const condMap: Record<string, number> = {};
  const histMap: Record<string, PriceHistoryPoint[]> = {};
  for (const v of pool) {
    // Normalise condition key: "Near Mint" → "nearmint"
    const key = v.condition.toLowerCase().replace(/\s+/g, "");
    if (!(key in condMap)) {
      condMap[key] = v.price;
      if (v.priceHistory?.length) {
        histMap[key] = (v.priceHistory as unknown as Array<{ p: number; t: number }>).map((point) => ({
          date: new Date(point.t * 1000).toISOString().split("T")[0],
          price: point.p,
        }));
      }
    }
  }

  // Use NM history; fall back to LP then any available condition
  const rawHistory =
    histMap["nearmint"] ??
    histMap["lightlyplayed"] ??
    Object.values(histMap)[0] ??
    null;

  // Normalise: ensure ascending by date, deduplicate dates
  const priceHistory: PriceHistoryPoint[] | null = rawHistory
    ? [...new Map(rawHistory.map((p) => [p.date, p])).values()]
        .sort((a, b) => a.date.localeCompare(b.date))
    : null;

  if (priceHistory && priceHistory.length > 0) {
    const first = priceHistory[0];
    const last = priceHistory[priceHistory.length - 1];
    console.log(`[JustTCG] Price history: ${priceHistory.length} data points (180d)`);
    console.log(`[JustTCG] History sample: first={date: '${first.date}', price: ${first.price}} last={date: '${last.date}', price: ${last.price}}`);
  } else {
    console.log(`[JustTCG] Price history: none returned`);
  }

  return {
    nm: condMap["nearmint"] ?? null,
    lp: condMap["lightlyplayed"] ?? null,
    mp: condMap["moderatelyplayed"] ?? null,
    hp: condMap["heavilyplayed"] ?? null,
    dmg: condMap["damaged"] ?? null,
    priceHistory,
  };
}

function pickBestPrinting(variants: JustTCGVariant[]): string {
  const printings = [...new Set(variants.map((v) => v.printing))];
  if (printings.includes("Normal")) return "Normal";
  if (printings.includes("Foil")) return "Foil";
  return printings[0] ?? "Normal";
}

/** Strip denominator: "188/167" → "188", "TG13" → "TG13" */
function cleanNumber(n: string | null | undefined): string {
  return (n ?? "").split("/")[0].trim();
}

function apiKey(): string | null {
  return process.env.JUSTTCG_API_KEY ?? null;
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const key = apiKey();
  if (!key) throw new Error("JUSTTCG_API_KEY not set");

  return fetch(url, {
    ...options,
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });
}

function parseCards(body: unknown): JustTCGCard[] {
  if (Array.isArray(body)) return body as JustTCGCard[];
  const b = body as Record<string, unknown>;
  return (b?.cards as JustTCGCard[] | undefined) ??
         (b?.results as JustTCGCard[] | undefined) ??
         (b?.data as JustTCGCard[] | undefined) ??
         [];
}

/** Log NM price for a card (for debug output). */
function nmPriceStr(c: JustTCGCard): string {
  const v = (c.variants ?? []).find(
    (v) => v.condition.toLowerCase().replace(/\s+/g, "") === "nearmint" &&
           v.printing.toLowerCase() === "normal"
  ) ?? (c.variants ?? []).find(
    (v) => v.condition.toLowerCase().replace(/\s+/g, "") === "nearmint"
  );
  return v ? `$${v.price.toFixed(2)}` : "(no NM)";
}

/** The set display string on a card — prefers explicit setName, falls back to set. */
function cardSetDisplay(c: JustTCGCard): string {
  return c.setName ?? c.set ?? "(none)";
}

// ── Set ID resolution ──────────────────────────────────────────────────────

/**
 * Look up the JustTCG set ID for a given set display name.
 * Results are cached in process memory so each set is only queried once.
 * Returns null if the set can't be resolved.
 */
async function lookupSetId(setName: string): Promise<string | null> {
  const cacheKey = setName.toLowerCase().trim();
  if (setIdCache.has(cacheKey)) {
    const cached = setIdCache.get(cacheKey)!;
    console.log(`[JustTCG] Set ID cache hit for "${setName}" → ${cached ?? "(not found)"}`);
    return cached;
  }

  const params = new URLSearchParams({ q: setName, game: "pokemon" });
  const url = `${BASE_URL}/sets?${params}`;
  console.log(`[JustTCG] GET ${url}  (resolving set ID for "${setName}")`);

  let res: Response;
  try {
    res = await apiFetch(url);
  } catch (err) {
    console.error("[JustTCG] set lookup network error:", err instanceof Error ? err.message : err);
    setIdCache.set(cacheKey, null);
    return null;
  }

  if (res.status === 429) {
    console.warn("[JustTCG] Rate limited (429) during set lookup");
    throw new Error("JUSTTCG_RATE_LIMITED");
  }
  if (!res.ok) {
    console.warn(`[JustTCG] Set lookup HTTP ${res.status} for "${setName}"`);
    setIdCache.set(cacheKey, null);
    return null;
  }

  let body: unknown;
  try { body = await res.json(); } catch {
    console.warn("[JustTCG] Failed to parse set lookup JSON");
    setIdCache.set(cacheKey, null);
    return null;
  }

  // Normalise response — could be array or wrapped
  const sets: JustTCGSet[] = Array.isArray(body)
    ? (body as JustTCGSet[])
    : ((body as Record<string, unknown>)?.sets as JustTCGSet[] | undefined) ??
      ((body as Record<string, unknown>)?.data as JustTCGSet[] | undefined) ??
      ((body as Record<string, unknown>)?.results as JustTCGSet[] | undefined) ??
      [];

  console.log(`[JustTCG] Set lookup returned ${sets.length} set(s) for "${setName}"`);
  sets.slice(0, 5).forEach((s, i) => {
    const id = s.setId ?? s.id ?? "(no id)";
    const name = s.displayName ?? s.name ?? "(no name)";
    console.log(`[JustTCG]   Set[${i + 1}]: id="${id}"  name="${name}"`);
  });

  if (sets.length === 0) {
    // Retry with the normalized name (strips "EX ", "SV: ", etc. and special chars)
    const normalized = normalizeSetName(setName);
    if (normalized !== setName.toLowerCase().trim()) {
      console.log(`[JustTCG] 0 sets for "${setName}" — retrying with normalized query "${normalized}"`);
      const params2 = new URLSearchParams({ q: normalized, game: "pokemon" });
      const url2 = `${BASE_URL}/sets?${params2}`;
      console.log(`[JustTCG] GET ${url2}`);
      try {
        const res2 = await apiFetch(url2);
        if (res2.ok) {
          const body2 = await res2.json();
          const sets2: JustTCGSet[] = Array.isArray(body2)
            ? (body2 as JustTCGSet[])
            : ((body2 as Record<string, unknown>)?.sets as JustTCGSet[] | undefined) ??
              ((body2 as Record<string, unknown>)?.data as JustTCGSet[] | undefined) ??
              ((body2 as Record<string, unknown>)?.results as JustTCGSet[] | undefined) ??
              [];
          console.log(`[JustTCG] Retry set lookup returned ${sets2.length} set(s)`);
          sets2.slice(0, 5).forEach((s, i) => {
            console.log(`[JustTCG]   Set[${i + 1}]: id="${s.setId ?? s.id ?? "(no id)"}"  name="${s.displayName ?? s.name ?? "(no name)"}"`);
          });
          if (sets2.length > 0) {
            // Use the retry results — fall through with sets2
            let bestSet2 = sets2[0];
            for (const s of sets2) {
              const sName = s.displayName ?? s.name ?? "";
              if (setNamesMatch(setName, sName)) { bestSet2 = s; break; }
            }
            const resolvedId2 = bestSet2.setId ?? bestSet2.id ?? null;
            const resolvedName2 = bestSet2.displayName ?? bestSet2.name ?? "";
            console.log(`[JustTCG] Resolved set "${setName}" (via normalized retry) → id="${resolvedId2}" (display="${resolvedName2}")`);
            setIdCache.set(cacheKey, resolvedId2);
            return resolvedId2;
          }
        }
      } catch { /* fall through */ }
    }
    console.warn(`[JustTCG] No sets found for "${setName}" — will fall back to name-only search`);
    setIdCache.set(cacheKey, null);
    return null;
  }

  // Pick the best set match: prefer one whose display name fuzzy-matches our set name
  let bestSet = sets[0];
  for (const s of sets) {
    const sName = s.displayName ?? s.name ?? "";
    if (setNamesMatch(setName, sName)) { bestSet = s; break; }
  }

  const resolvedId = bestSet.setId ?? bestSet.id ?? null;
  const resolvedName = bestSet.displayName ?? bestSet.name ?? "";
  console.log(`[JustTCG] Resolved set "${setName}" → id="${resolvedId}" (display="${resolvedName}")`);
  setIdCache.set(cacheKey, resolvedId);
  return resolvedId;
}

// ── Card search helpers ────────────────────────────────────────────────────

async function fetchCards(name: string, setId?: string | null): Promise<JustTCGCard[]> {
  const p: Record<string, string> = {
    q: name,
    game: "pokemon",
    include_price_history: "true",
    priceHistoryDuration: "180d",
  };
  if (setId) p.set = setId;
  const params = new URLSearchParams(p);
  const url = `${BASE_URL}/cards?${params}`;
  console.log(`[JustTCG] GET ${url}`);

  let res: Response;
  try {
    res = await apiFetch(url);
  } catch (err) {
    console.error("[JustTCG] network error:", err instanceof Error ? err.message : err);
    return [];
  }
  if (res.status === 429) { throw new Error("JUSTTCG_RATE_LIMITED"); }
  if (!res.ok) { console.warn(`[JustTCG] HTTP ${res.status}`); return []; }

  let body: unknown;
  try { body = await res.json(); } catch { return []; }
  return parseCards(body);
}

/**
 * From a list of cards, find the best match for (name, cardNumber).
 * Priority:
 *   1. Exact card number match → prefer exact name match as tiebreaker
 *   2. If no number provided/matched: exact name match only
 *   3. Returns null if no confident match
 */
function pickBestCard(
  cards: JustTCGCard[],
  name: string,
  cardNumber: string | null | undefined,
  logPrefix: string
): JustTCGCard | null {
  const targetNum = cleanNumber(cardNumber);
  const targetName = name.toLowerCase();

  // ── Step 1: find all cards with matching card number ─────────────────────
  const numberMatches = targetNum
    ? cards.filter((c) => cleanNumber(c.number) === targetNum)
    : [];

  console.log(`[JustTCG] ${logPrefix} number matches for "${targetNum || "(none)"}": ${numberMatches.length}`);

  if (numberMatches.length === 1) {
    console.log(`[JustTCG] ${logPrefix} → single number match: "${numberMatches[0].name}" #${numberMatches[0].number ?? "?"}`);
    return numberMatches[0];
  }

  if (numberMatches.length > 1) {
    // Tiebreak: prefer exact name match
    const exactName = numberMatches.find((c) => c.name.toLowerCase() === targetName);
    if (exactName) {
      console.log(`[JustTCG] ${logPrefix} → number+name match: "${exactName.name}" #${exactName.number ?? "?"}`);
      return exactName;
    }
    // Multiple number matches, none with exact name — take first and warn
    console.warn(`[JustTCG] ${logPrefix} → ${numberMatches.length} number matches, no exact name match — using first: "${numberMatches[0].name}"`);
    return numberMatches[0];
  }

  // ── Step 2: no number match — try exact name only ────────────────────────
  if (!targetNum) {
    const exactName = cards.find((c) => c.name.toLowerCase() === targetName);
    if (exactName) {
      console.log(`[JustTCG] ${logPrefix} → exact name match (no number provided): "${exactName.name}"`);
      return exactName;
    }
  }

  console.log(`[JustTCG] ${logPrefix} → no match found`);
  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Search JustTCG for a raw Pokémon card and return condition-based pricing.
 * Returns null if no confident match found or API unavailable.
 * Throws "JUSTTCG_RATE_LIMITED" if rate limit hit.
 */
export async function searchRawCard(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<RawCardPrices | null> {
  if (!apiKey()) {
    console.warn("[JustTCG] JUSTTCG_API_KEY not configured — skipping");
    return null;
  }

  // Clean language tags from query values (JP, EN, Japanese, etc.)
  // Inventory names are left untouched — only the API query strings are cleaned.
  const queryName = cleanForQuery(name);
  const querySetName = setName ? cleanForQuery(setName) : null;
  const wasNameCleaned = queryName !== name;
  const wasSetCleaned = querySetName !== setName;

  console.log(`[JustTCG] ┌─ SEARCH ──────────────────────────────────────────`);
  console.log(`[JustTCG] │  Looking for: name="${name}" set="${setName ?? "(none)"}" number="${cardNumber ?? "(none)"}"`);
  if (wasNameCleaned) console.log(`[JustTCG] │  Name cleaned for query: "${queryName}"`);
  if (wasSetCleaned)  console.log(`[JustTCG] │  Set  cleaned for query: "${querySetName}"`);
  console.log(`[JustTCG] └───────────────────────────────────────────────────`);

  // ── Phase 1: set-filtered search ─────────────────────────────────────────
  let resolvedSetId: string | null = null;
  if (querySetName) {
    try {
      resolvedSetId = await lookupSetId(querySetName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "JUSTTCG_RATE_LIMITED") throw err;
      console.warn("[JustTCG] set lookup failed:", msg);
    }
  }

  if (resolvedSetId) {
    const phase1Cards = await fetchCards(queryName, resolvedSetId);
    console.log(`[JustTCG] ┌─ PHASE 1 RESULTS (set-filtered, ${phase1Cards.length} cards) ──────`);
    phase1Cards.slice(0, 5).forEach((c, i) => {
      console.log(`[JustTCG] │  [${i + 1}] "${c.name}"  set="${cardSetDisplay(c)}"  #${c.number ?? "?"}  NM=${nmPriceStr(c)}`);
    });
    if (phase1Cards.length > 5) console.log(`[JustTCG] │  ... and ${phase1Cards.length - 5} more`);
    console.log(`[JustTCG] └───────────────────────────────────────────────────`);

    if (phase1Cards.length > 0) {
      const match = pickBestCard(phase1Cards, queryName, cardNumber, "Phase 1");
      if (match) {
        const printing = pickBestPrinting(match.variants ?? []);
        const prices = extractPricesForPrinting(match.variants ?? [], printing);
        console.log(`[JustTCG] ✓ SELECTED (Phase 1): "${match.name}" / "${cardSetDisplay(match)}" #${match.number ?? "?"} printing="${printing}"`);
        console.log(`[JustTCG]   NM=${prices.nm != null ? `$${prices.nm.toFixed(2)}` : "—"} LP=${prices.lp != null ? `$${prices.lp.toFixed(2)}` : "—"} MP=${prices.mp != null ? `$${prices.mp.toFixed(2)}` : "—"} HP=${prices.hp != null ? `$${prices.hp.toFixed(2)}` : "—"} DMG=${prices.dmg != null ? `$${prices.dmg.toFixed(2)}` : "—"}`);
        return { ...prices, printing, justtcgCardId: match.cardId };
      }
      console.log(`[JustTCG] Phase 1 returned ${phase1Cards.length} cards but no number match — falling back to Phase 2`);
    } else {
      console.log(`[JustTCG] Phase 1 returned 0 cards — falling back to Phase 2`);
    }
  } else if (querySetName) {
    console.log(`[JustTCG] Set ID not resolved for "${querySetName}" — skipping Phase 1, going straight to Phase 2`);
  }

  // ── Phase 2: name-only search with strict matching ────────────────────────
  console.log(`[JustTCG] ── Phase 2: name-only search ─────────────────────────`);
  const phase2Cards = await fetchCards(queryName);
  console.log(`[JustTCG] ┌─ PHASE 2 RESULTS (name-only, ${phase2Cards.length} cards) ──────────`);
  phase2Cards.slice(0, 5).forEach((c, i) => {
    const setDisplay = cardSetDisplay(c);
    const setNorm = setDisplay.includes(" ") ? setDisplay : slugToDisplayName(setDisplay);
    const setOk = querySetName ? setNamesMatch(querySetName, setDisplay) : false;
    const numOk = cardNumber ? cleanNumber(c.number) === cleanNumber(cardNumber) : false;
    console.log(`[JustTCG] │  [${i + 1}] "${c.name}"  set="${setNorm}"  #${c.number ?? "?"}  NM=${nmPriceStr(c)}  [set=${setOk ? "✓" : "✗"} num=${numOk ? "✓" : "✗"}]`);
  });
  if (phase2Cards.length > 5) console.log(`[JustTCG] │  ... and ${phase2Cards.length - 5} more`);
  console.log(`[JustTCG] └───────────────────────────────────────────────────`);

  if (phase2Cards.length === 0) {
    // Could be a Japanese-only card with no TCGPlayer listing
    const wasJP = wasNameCleaned || wasSetCleaned;
    console.warn(`[JustTCG] ✗ No results for "${queryName}"${wasJP ? " (JP language tags stripped — possibly Japanese-only card with no TCGPlayer data)" : ""} — skipping`);
    return null;
  }

  // Phase 2 requires BOTH set name AND card number to match for selection
  const targetNum = cleanNumber(cardNumber);
  const phase2Candidates = phase2Cards.filter((c) => {
    const numOk = targetNum ? cleanNumber(c.number) === targetNum : false;
    const setOk = querySetName ? setNamesMatch(querySetName, cardSetDisplay(c)) : false;
    return numOk && setOk;
  });

  if (phase2Candidates.length > 0) {
    const best = phase2Candidates.find((c) => c.name.toLowerCase() === queryName.toLowerCase())
               ?? phase2Candidates[0];
    const printing = pickBestPrinting(best.variants ?? []);
    const prices = extractPricesForPrinting(best.variants ?? [], printing);
    console.log(`[JustTCG] ✓ SELECTED (Phase 2 fallback): "${best.name}" / "${cardSetDisplay(best)}" #${best.number ?? "?"} printing="${printing}"`);
    console.log(`[JustTCG]   NM=${prices.nm != null ? `$${prices.nm.toFixed(2)}` : "—"} LP=${prices.lp != null ? `$${prices.lp.toFixed(2)}` : "—"} MP=${prices.mp != null ? `$${prices.mp.toFixed(2)}` : "—"} HP=${prices.hp != null ? `$${prices.hp.toFixed(2)}` : "—"} DMG=${prices.dmg != null ? `$${prices.dmg.toFixed(2)}` : "—"}`);
    return { ...prices, printing, justtcgCardId: best.cardId };
  }

  // Both phases failed — don't guess
  const hasNum = !!targetNum;
  const hasSet = !!querySetName;
  if (hasNum && hasSet) {
    console.warn(`[JustTCG] ✗ No match in Phase 2: needed set="${querySetName}" + number="${targetNum}" — no card satisfied both. Not guessing.`);
  } else if (hasNum) {
    console.warn(`[JustTCG] ✗ No match: no card with number="${targetNum}" in ${phase2Cards.length} results.`);
  } else {
    console.warn(`[JustTCG] ✗ No match: insufficient criteria (no set + no number) to confidently select from ${phase2Cards.length} results.`);
  }
  return null;
}

/**
 * Batch price refresh for cards whose JustTCG cardId is already known.
 * Returns a Map<cardId, RawCardPrices>. Missing IDs are omitted.
 * Max 20 per request (free plan).
 */
export async function batchLookupRawCards(
  cardIds: string[]
): Promise<Map<string, RawCardPrices>> {
  const result = new Map<string, RawCardPrices>();
  if (cardIds.length === 0 || !apiKey()) return result;

  const batches: string[][] = [];
  for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
    batches.push(cardIds.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const url = `${BASE_URL}/cards`;
    console.log(`[JustTCG] POST ${url} batch size=${batch.length}`);

    let res: Response;
    try {
      res = await apiFetch(url, {
        method: "POST",
        body: JSON.stringify(batch.map((id) => ({ cardId: id }))),
      });
    } catch (err) {
      console.error("[JustTCG] batch network error:", err instanceof Error ? err.message : err);
      continue;
    }

    if (res.status === 429) {
      console.warn("[JustTCG] Rate limited (429) during batch — stopping");
      throw new Error("JUSTTCG_RATE_LIMITED");
    }
    if (!res.ok) {
      console.warn(`[JustTCG] Batch HTTP ${res.status}`);
      continue;
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      console.warn("[JustTCG] Failed to parse batch JSON");
      continue;
    }

    const cards: JustTCGCard[] = Array.isArray(body)
      ? (body as JustTCGCard[])
      : ((body as Record<string, unknown>)?.cards as JustTCGCard[] | undefined) ??
        ((body as Record<string, unknown>)?.data as JustTCGCard[] | undefined) ??
        [];

    for (const card of cards) {
      if (!card.cardId) continue;
      const printing = pickBestPrinting(card.variants ?? []);
      const prices = extractPricesForPrinting(card.variants ?? [], printing);
      result.set(card.cardId, { ...prices, printing, justtcgCardId: card.cardId });
    }
  }

  return result;
}

/**
 * Return the condition-specific price from a set of raw card prices.
 * Falls back to NM if the condition isn't priced.
 */
export function priceForCondition(
  prices: { nm: number | null; lp: number | null; mp: number | null; hp: number | null; dmg: number | null },
  condition: string | null | undefined
): number | null {
  switch (condition) {
    case "Near Mint":         return prices.nm;
    case "Lightly Played":    return prices.lp;
    case "Moderately Played": return prices.mp;
    case "Heavily Played":    return prices.hp;
    case "Damaged":           return prices.dmg;
    default:                  return prices.nm;
  }
}
