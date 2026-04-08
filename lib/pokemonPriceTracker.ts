import { searchBaseNames, nameVariants, isJapaneseName, extractEmbeddedNumber } from "./cardNameUtils";
import { makeLookupKey, getCardCache, setCardCache, getManualImage } from "./cardCache";

const TCGDEX_EN = "https://api.tcgdex.net/v2/en";
const TCGDEX_JA = "https://api.tcgdex.net/v2/ja";
const TCGIO_BASE = "https://api.pokemontcg.io/v2";
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

function canonicalSetNames(setName: string): string[] {
  const lower = setName.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(PROMO_SET_ALIASES)) {
    if (aliases.includes(lower) || lower === canonical.toLowerCase()) {
      return [...new Set([setName, canonical])];
    }
  }
  return [setName];
}

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

// ── Step 1: TCGdex (primary — high-quality 600×825 WebP images) ──────────────

async function lookupImageFromTcgDex(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<TcgDexMatch | null> {
  const num = baseNumber(cardNumber) ?? extractEmbeddedNumber(name) ?? undefined;
  const isJP = isJapaneseName(name) || /\bjapanese\b|^jp$/i.test(setName?.trim() ?? "");

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
          console.log(`[PriceTracker] TCGdex found "${card.name}" id=${card.id} (${endpoint})`);
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

// ── Step 2: pokemontcg.io (fallback — wider coverage, lower image quality) ───

async function lookupFromTcgIo(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<{ imageUrl: string; market: number | null } | null> {
  const num = baseNumber(cardNumber);

  // Build Lucene query candidates, most specific first
  const queries: string[] = [];
  if (num && setName) queries.push(`name:"${name}" set.name:"${setName}" number:${num}`);
  if (num)            queries.push(`name:"${name}" number:${num}`);
  if (setName)        queries.push(`name:"${name}" set.name:"${setName}"`);
  queries.push(`name:"${name}"`);

  const apiKey = process.env.POKEMON_TCG_IO_API_KEY;
  const headers: Record<string, string> = {};
  if (apiKey) headers["X-Api-Key"] = apiKey;

  for (const q of queries) {
    try {
      const url = `${TCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=1&select=id,name,images,tcgplayer`;
      const res = await makeFetchWithTimeout(url, { headers, cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      const card = json.data?.[0];
      if (!card?.images?.large && !card?.images?.small) continue;

      const imageUrl: string = card.images.large ?? card.images.small;
      const prices = card.tcgplayer?.prices as Record<string, { market?: number }> | undefined;
      let market: number | null = null;
      if (prices) {
        const priority = ["holofoil", "reverseHolofoil", "1stEditionHolofoil", "normal"];
        for (const key of priority) {
          const m = prices[key]?.market;
          if (m != null && m > 0) { market = m; break; }
        }
        if (market == null) {
          for (const val of Object.values(prices)) {
            if (val?.market != null && val.market > 0) { market = val.market; break; }
          }
        }
      }

      console.log(`[PriceTracker] pokemontcg.io found "${card.name}" id=${card.id}`);
      return { imageUrl, market };
    } catch {
      continue;
    }
  }

  return null;
}

// ── Market price from TCGdex (when we already have the card ID) ───────────────

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
    return p.normal?.marketPrice ?? p.holofoil?.marketPrice ?? p.reverseHolofoil?.marketPrice ?? null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function lookupCard(
  name: string,
  category: "single" | "slab" | "sealed",
  options?: LookupOptions
): Promise<LookupResult | null> {
  const setName = options?.setName?.trim() || null;
  const cardNumber = options?.cardNumber?.trim() || null;

  // Sealed products: skip card image APIs, use pokemonpricetracker.com
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

  // ── Fallback chain for singles and slabs ──────────────────────────────────

  const cacheKey = makeLookupKey(name, setName, cardNumber);

  // Step 1: Check local cache (Supabase card_image_cache)
  const cached = await getCardCache(cacheKey);
  if (cached.hit) {
    console.log(`[PriceTracker] Cache hit for "${name}" → ${cached.imageUrl ?? "no image"}`);
    // Market price isn't cached — still worth fetching for syncs, but return cached image immediately
    return { imageUrl: cached.imageUrl, market: null };
  }

  // Step 2: Try TCGdex (primary — best image quality)
  const tcgDexMatch = await lookupImageFromTcgDex(name, setName, cardNumber);
  if (tcgDexMatch) {
    const market = category === "single"
      ? await lookupMarketFromTcgDex(tcgDexMatch.cardId, tcgDexMatch.endpoint)
      : null;
    await setCardCache(cacheKey, name, setName, cardNumber, tcgDexMatch.imageUrl, "tcgdex");
    return { imageUrl: tcgDexMatch.imageUrl, market };
  }

  // Step 3: Try pokemontcg.io (fallback — wider set coverage)
  const tcgIoMatch = await lookupFromTcgIo(name, setName, cardNumber);
  if (tcgIoMatch) {
    await setCardCache(cacheKey, name, setName, cardNumber, tcgIoMatch.imageUrl, "pokemontcg");
    return { imageUrl: tcgIoMatch.imageUrl, market: tcgIoMatch.market };
  }

  // Step 4: Check pokemon_cards table for manually-added images
  const manualUrl = await getManualImage(name, cardNumber);
  if (manualUrl) {
    await setCardCache(cacheKey, name, setName, cardNumber, manualUrl, "manual");
    return { imageUrl: manualUrl, market: null };
  }

  // Step 5: No image found — cache the negative result so we don't retry every time
  await setCardCache(cacheKey, name, setName, cardNumber, null, "not_found");
  return null;
}
