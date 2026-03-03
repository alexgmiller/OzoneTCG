import { searchBaseNames, nameVariants } from "./cardNameUtils";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
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

/** Look up a card image from TCGdex — returns high-quality WebP URL */
async function lookupImageFromTcgDex(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<string | null> {
  const num = baseNumber(cardNumber);

  // Build queries across all candidate base names × case variants — most specific first
  const queries: string[] = [];
  for (const baseName of searchBaseNames(name)) {
    for (const n of nameVariants(baseName)) {
      const en = encodeURIComponent(n);
      if (num && setName) queries.push(`name=eq:${en}&set.name=${encodeURIComponent(setName)}&localId=${encodeURIComponent(num)}`);
      if (num)            queries.push(`name=eq:${en}&localId=${encodeURIComponent(num)}`);
      if (setName)        queries.push(`name=eq:${en}&set.name=${encodeURIComponent(setName)}`);
      queries.push(`name=eq:${en}`);
      queries.push(`name=${en}`);
    }
  }

  // Run all queries in parallel, return the most specific hit
  const results = await Promise.all(
    queries.map(async (q) => {
      try {
        const res = await makeFetchWithTimeout(`${TCGDEX_BASE}/cards?${q}`, { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        const card = Array.isArray(data) ? data[0] : null;
        if (!card?.image) return null;
        console.log(`[PriceTracker] TCGdex found "${card.name}" (query: ${q})`);
        return `${card.image}/high.webp`;
      } catch {
        return null;
      }
    })
  );

  return results.find((r) => r != null) ?? null;
}

export async function lookupCard(
  name: string,
  category: "single" | "slab" | "sealed",
  options?: LookupOptions
): Promise<LookupResult | null> {
  const setName = options?.setName?.trim() || undefined;
  const cardNumber = options?.cardNumber?.trim() || undefined;

  // Sealed products: skip TCGdex (not in their DB), fall back to pokemonpricetracker.com
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

  // Singles and slabs: TCGdex for high-quality image (market price entered manually)
  const imageUrl = await lookupImageFromTcgDex(name, setName, cardNumber);
  return imageUrl ? { imageUrl, market: null } : null;
}
