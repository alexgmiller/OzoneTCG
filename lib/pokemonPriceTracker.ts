const BASE = "https://www.pokemonpricetracker.com/api/v2";
const TCGIO_BASE = "https://api.pokemontcg.io/v2";

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

/** pokemontcg.io image fallback — tries progressively looser queries */
async function lookupImageFallback(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<string | null> {
  const num = baseNumber(cardNumber);
  try {
    // Most specific → least specific
    const queries: string[] = [];
    if (num && setName) {
      queries.push(`number:${num} set.name:"${setName}"`);
    }
    if (num) {
      queries.push(`name:"${name}" number:${num}`);
    }
    if (setName) {
      queries.push(`name:"${name}" set.name:"${setName}"`);
    }
    queries.push(`name:"${name}"`);
    // Progressively shorter name
    const words = name.split(" ");
    if (words.length > 2) queries.push(`name:"${words.slice(0, 3).join(" ")}"`);
    if (words.length > 1) queries.push(`name:"${words.slice(0, 2).join(" ")}"`);

    for (const q of queries) {
      const url = `${TCGIO_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=1&select=id,name,images`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      const card = json.data?.[0];
      if (card?.images?.large || card?.images?.small) {
        console.log(`[PriceTracker] pokemontcg.io found "${card.name}" for "${name}" (query: ${q})`);
        return card.images.large ?? card.images.small;
      }
    }
  } catch (err) {
    console.warn("[PriceTracker] pokemontcg.io fallback error:", err);
  }
  return null;
}

export async function lookupCard(
  name: string,
  category: "single" | "slab" | "sealed",
  options?: LookupOptions
): Promise<LookupResult | null> {
  const key = process.env.POKEMON_PRICE_TRACKER_API_KEY;
  if (!key) {
    console.error("[PriceTracker] POKEMON_PRICE_TRACKER_API_KEY is not set");
    return null;
  }

  const setName = options?.setName?.trim() || undefined;
  const cardNumber = options?.cardNumber?.trim() || undefined;

  let market: number | null = null;
  let imageUrl: string | null = null;

  // --- Step 1: pokemonpricetracker.com (price + image) ---
  try {
    const endpoint = category === "sealed" ? "sealed-products" : "cards";
    // Append set name to the search term for better disambiguation
    const searchTerm = setName ? `${name} ${setName}` : name;
    const url = `${BASE}/${endpoint}?search=${encodeURIComponent(searchTerm)}&limit=1`;
    console.log(`[PriceTracker] GET ${url}`);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[PriceTracker] HTTP ${res.status} for "${name}": ${body}`);
    } else {
      const json = await res.json();
      const item = json.data?.[0];
      if (item) {
        console.log(`[PriceTracker] Raw item:`, JSON.stringify(item, null, 2));
        market = item.prices?.market ?? null;
        // Prefer hi-res image; fall back through progressively smaller sizes
        imageUrl = item.imageUrlHiRes ?? item.imageUrl ?? item.image?.large ?? item.image?.small ?? null;
        console.log(`[PriceTracker] Found "${item.name}" — market: ${market}, image: ${imageUrl}`);
      } else {
        console.warn(`[PriceTracker] No results for "${searchTerm}" (${category}) on pokemonpricetracker`);
      }
    }
  } catch (err) {
    console.error(`[PriceTracker] Error for "${name}":`, err);
  }

  // --- Step 2: pokemontcg.io fallback for image if still missing ---
  if (!imageUrl && category !== "sealed") {
    imageUrl = await lookupImageFallback(name, setName, cardNumber);
  }

  if (market == null && imageUrl == null) return null;

  return { market, imageUrl };
}
