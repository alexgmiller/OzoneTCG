import { NextRequest, NextResponse } from "next/server";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://www.tcgplayer.com",
  Referer: "https://www.tcgplayer.com/",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json",
};

// Extract TCGplayer product ID from a URL like:
// https://www.tcgplayer.com/product/517940/pokemon-paldean-fates-mew-ex
function extractProductIdFromUrl(url: string): number | null {
  const m = url.match(/\/product\/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// Find product ID via TCGdex — it embeds the TCGplayer product URL in full card data.
// cardId format: "{setId}-{localId}" e.g. "sv04.5-6"
async function findProductIdViaCardId(cardId: string): Promise<number | null> {
  const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(cardId)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const card: any = await res.json();
  const url: string | undefined = card?.tcgplayer?.url;
  if (!url) return null;
  return extractProductIdFromUrl(url);
}

// Fallback: search TCGdex by name, take first result, then fetch full card data
async function findProductIdByName(name: string, setName?: string): Promise<number | null> {
  const qs = new URLSearchParams({ name: `eq:${name}` });
  const res = await fetch(`https://api.tcgdex.net/v2/en/cards?${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cards: any[] = await res.json();
  if (!Array.isArray(cards) || !cards.length) return null;

  // If setName given, prefer a card from that set
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted = setName
    ? [...cards].sort((a: any) =>
        String(a.id ?? "").startsWith(setName) ? -1 : 1
      )
    : cards;

  for (const c of sorted.slice(0, 5)) {
    const productId = await findProductIdViaCardId(String(c.id));
    if (productId) return productId;
  }
  return null;
}

async function fetchListings(productId: number) {
  const body = {
    filters: {
      term: {
        sellerStatus: "Live",
        channelId: 0,
        language: ["English"],
      },
      range: { quantity: { gte: 1 } },
      exclude: { channelExclusion: 0 },
    },
    context: { shippingCountry: "US", cart: {} },
    sort: { field: "price+shipping", order: "asc" },
    from: 0,
    size: 25,
  };

  const res = await fetch(
    `https://mp-search-api.tcgplayer.com/v1/product/${productId}/listings`,
    { method: "POST", headers: BROWSER_HEADERS, body: JSON.stringify(body) }
  );

  if (!res.ok) throw new Error(`TCGplayer listings API returned ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productIdParam = searchParams.get("productId");
  const cardId = searchParams.get("cardId"); // TCGdex card ID e.g. "sv04.5-6"
  const name = searchParams.get("name");
  const setName = searchParams.get("setName") ?? undefined;

  let productId: number | null = productIdParam ? parseInt(productIdParam) : null;

  if (!productId) {
    if (cardId) {
      productId = await findProductIdViaCardId(cardId);
    } else if (name) {
      productId = await findProductIdByName(name, setName);
    } else {
      return NextResponse.json({ error: "productId, cardId, or name required" }, { status: 400 });
    }
    if (!productId) {
      return NextResponse.json({ listings: [], productId: null, error: "Not found on TCGplayer" });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any;
  try {
    data = await fetchListings(productId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch listings" },
      { status: 502 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listings = (data?.results ?? []).map((l: any) => ({
    price: l.price ?? 0,
    shipping: l.shipping ?? 0,
    total: (l.price ?? 0) + (l.shipping ?? 0),
    condition: l.condition ?? "",
    seller: l.sellerName ?? "",
    quantity: l.quantity ?? 1,
  }));

  return NextResponse.json({ productId, listings });
}
