import { searchBaseNames, nameVariants, isJapaneseName, extractEmbeddedNumber } from "./cardNameUtils";

const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
const TCGDEX_JA = "https://api.tcgdex.net/v2/ja";
const FETCH_TIMEOUT_MS = 8000;

type LookupResult = {
  market: number | null;
  imageUrl: string | null;
};

type LookupOptions = {
  setName?: string | null;
  cardNumber?: string | null;
};

/** Extract the base number from "17/115" → "17" */
function baseNumber(n: string | null | undefined): string | undefined {
  if (!n) return undefined;
  return n.split("/")[0].trim() || undefined;
}

function makeFetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/**
 * Map common user-entered promo set name variants → TCGdex canonical set names.
 * Keys are the canonical TCGdex names; values are lower-cased alias strings.
 */
const PROMO_SET_ALIASES: Record<string, string[]> = {
  "SM Black Star Promos": [
    "sm promo", "sm promos", "sm black star promo", "sm black star promos",
    "sun & moon promo", "sun & moon promos", "sun moon promo", "sun moon promos",
    "sun & moon black star promos", "sun and moon promo", "sun and moon promos",
    "sun and moon black star promos",
  ],
  "SWSH Black Star Promos": [
    "swsh promo", "swsh promos", "swsh black star promo", "swsh black star promos",
    "sword & shield promo", "sword & shield promos", "sword and shield promo",
    "sword and shield promos", "sword & shield black star promos",
    "sword and shield black star promos",
  ],
  "XY Black Star Promos": [
    "xy promo", "xy promos", "xy black star promo", "xy black star promos",
  ],
  "BW Black Star Promos": [
    "bw promo", "bw promos", "bw black star promo", "bw black star promos",
    "black & white promo", "black & white promos", "black and white promo",
    "black and white promos", "black & white black star promos",
    "black and white black star promos",
  ],
  "Scarlet & Violet Black Star Promos": [
    "sv promo", "sv promos", "sv black star promo", "sv black star promos",
    "scarlet & violet promo", "scarlet & violet promos", "scarlet and violet promo",
    "scarlet and violet promos", "scarlet & violet black star promos",
    "scarlet and violet black star promos",
  ],
  "DP Black Star Promos": [
    "dp promo", "dp promos", "dp black star promo", "dp black star promos",
    "diamond & pearl promo", "diamond & pearl promos", "diamond and pearl promo",
    "diamond and pearl promos",
  ],
};

/**
 * Given a user-supplied set name, return it plus any canonical TCGdex alias.
 * e.g. "SM Promo" → ["SM Promo", "SM Black Star Promos"]
 */
function canonicalSetNames(setName: string): string[] {
  const lower = setName.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(PROMO_SET_ALIASES)) {
    if (aliases.includes(lower) || lower === canonical.toLowerCase()) {
      return [...new Set([setName, canonical])];
    }
  }
  return [setName];
}

/**
 * Generate localId variants from a promo card number.
 * "SM01"    → ["SM01", "01", "1"]
 * "SWSH001" → ["SWSH001", "001", "1"]
 * "SM-P 001"→ ["SM-P 001", "001", "1"]
 * "17"      → ["17"]  (no-op — already numeric)
 */
function promoNumberVariants(num: string): string[] {
  const variants: string[] = [num];
  const digits = num.replace(/^[A-Za-z\s-]+/, "").trim();
  if (digits && digits !== num) {
    variants.push(digits);
    const stripped = String(parseInt(digits, 10));
    if (stripped !== digits) variants.push(stripped);
  }
  return [...new Set(variants)];
}

type TcgDexMatch = { imageUrl: string; cardId: string; endpoint: string };

/** Look up a card from TCGdex search — returns image URL, card ID, and which endpoint matched */
async function lookupImageFromTcgDex(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<TcgDexMatch | null> {
  const num = baseNumber(cardNumber) ?? extractEmbeddedNumber(name) ?? undefined;
  const isJP = isJapaneseName(name) || /\bjapanese\b|^jp$/i.test(setName?.trim() ?? "");

  // For JP cards, clean "(Japanese)" suffix and trailing " JP" from the set name so the
  // Japanese API gets "Base Set" instead of "Base Set (Japanese)" / "Sun & Moon Promos JP"
  const cleanedSetName = isJP && setName
    ? setName.replace(/\s*\(Japanese\)\s*/i, "").replace(/\s+JP\s*$/i, "").trim() || undefined
    : setName;

  const setNames: (string | undefined)[] = cleanedSetName ? canonicalSetNames(cleanedSetName) : [undefined];
  const nums: (string | undefined)[] = num ? promoNumberVariants(num) : [undefined];

  const seen = new Set<string>();
  const queries: string[] = [];
  function addQuery(q: string) {
    if (!seen.has(q)) { seen.add(q); queries.push(q); }
  }

  for (const baseName of searchBaseNames(name)) {
    for (const n of nameVariants(baseName)) {
      const en = encodeURIComponent(n);
      for (const sn of setNames) {
        for (const nv of nums) {
          if (nv && sn) addQuery(`name=eq:${en}&set.name=${encodeURIComponent(sn)}&localId=${encodeURIComponent(nv)}`);
        }
      }
      for (const nv of nums) {
        if (nv) addQuery(`name=eq:${en}&localId=${encodeURIComponent(nv)}`);
      }
      for (const sn of setNames) {
        if (sn) addQuery(`name=eq:${en}&set.name=${encodeURIComponent(sn)}`);
      }
      addQuery(`name=eq:${en}`);
      addQuery(`name=${en}`);
    }
  }

  const endpoints = isJP ? [TCGDEX_JA, TCGDEX_EN] : [TCGDEX_EN];

  for (const endpoint of endpoints) {
    const results = await Promise.all(
      queries.map(async (q) => {
        try {
          const res = await makeFetchWithTimeout(`${endpoint}/cards?${q}`, { cache: "no-store" });
          if (!res.ok) return null;
          const data = await res.json();
          const card = Array.isArray(data) ? data[0] : null;
          if (!card?.image) return null;
          console.log(`[PriceTracker] TCGdex found "${card.name}" id=${card.id} (${endpoint}, query: ${q})`);
          return { imageUrl: `${card.image}/high.webp`, cardId: String(card.id ?? ""), endpoint } as TcgDexMatch;
        } catch {
          return null;
        }
      })
    );
    const found = results.find((r) => r != null);
    if (found) return found;
  }

  return null;
}

/**
 * Fetch market price from TCGdex full-card endpoint using the card's ID.
 * Pricing data comes from TCGplayer (USD) updated hourly–daily.
 * Only meaningful for singles — graded/slab prices differ significantly from raw card prices.
 */
async function lookupMarketFromTcgDex(cardId: string, endpoint: string): Promise<number | null> {
  if (!cardId) return null;
  try {
    const res = await makeFetchWithTimeout(
      `${endpoint}/cards/${encodeURIComponent(cardId)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card: any = await res.json();
    const p = card?.pricing?.tcgplayer;
    if (!p) return null;
    // Try variants in order: normal → holofoil → reverse holo
    return p.normal?.marketPrice ?? p.holofoil?.marketPrice ?? p.reverseHolofoil?.marketPrice ?? null;
  } catch {
    return null;
  }
}

export async function lookupCard(
  name: string,
  category: "single" | "slab" | "sealed",
  options?: LookupOptions
): Promise<LookupResult | null> {
  const setName = options?.setName?.trim() || undefined;
  const cardNumber = options?.cardNumber?.trim() || undefined;

  // Sealed products: skip TCGdex (not in their DB), use pokemonpricetracker.com
  if (category === "sealed") {
    const key = process.env.POKEMON_PRICE_TRACKER_API_KEY;
    if (!key) return null;

    try {
      const searchTerm = setName ? `${name} ${setName}` : name;
      const url = `https://www.pokemonpricetracker.com/api/v2/sealed-products?search=${encodeURIComponent(searchTerm)}&limit=1`;
      const res = await makeFetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const json = await res.json();
      const item = json.data?.[0];
      if (!item) return null;
      const market: number | null = item.prices?.market ?? null;
      const imageUrl: string | null = item.imageUrlHiRes ?? item.imageUrl ?? null;
      return market || imageUrl ? { market, imageUrl } : null;
    } catch {
      return null;
    }
  }

  // Singles and slabs: TCGdex for image; also fetch market price for singles
  const match = await lookupImageFromTcgDex(name, setName, cardNumber);
  if (!match) return null;

  // Slabs: skip pricing fetch — raw card price != graded price
  const market = category === "single" && match.cardId
    ? await lookupMarketFromTcgDex(match.cardId, match.endpoint)
    : null;

  return { imageUrl: match.imageUrl, market };
}
