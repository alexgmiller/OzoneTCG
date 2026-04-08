import { NextRequest, NextResponse } from "next/server";
import { getEbayToken } from "@/lib/ebay";

const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const POKEMON_CATEGORY_ID = "183454";

export async function POST(req: NextRequest) {
  const { name, setName } = await req.json() as { name: string; setName?: string | null };
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let token: string;
  try {
    token = await getEbayToken();
  } catch (err) {
    console.error("[ebay-psa10] token error:", err);
    return NextResponse.json({ error: "eBay auth failed" }, { status: 500 });
  }

  const q = `"PSA 10" ${name}${setName ? ` ${setName}` : ""}`;
  const params = new URLSearchParams({
    q,
    filter: "buyingOptions:{AUCTION|FIXED_PRICE},priceCurrency:USD,conditions:{2750}",
    category_ids: POKEMON_CATEGORY_ID,
    limit: "50",
  });

  let prices: number[] = [];

  try {
    const res = await fetch(`${EBAY_BROWSE_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        "Content-Type": "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[ebay-psa10] API error", res.status, body.slice(0, 300));
      return NextResponse.json({ error: "eBay API error", status: res.status }, { status: 502 });
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of data.itemSummaries ?? [] as any[]) {
      if ((item.buyingOptions ?? []).includes("BEST_OFFER")) continue;
      const price = parseFloat(item.price?.value ?? "");
      if (Number.isFinite(price) && price > 1) prices.push(price);
    }
  } catch (err) {
    console.error("[ebay-psa10] fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch from eBay" }, { status: 502 });
  }

  if (prices.length === 0) {
    return NextResponse.json({ avgPrice: null, medianPrice: null, count: 0 });
  }

  prices.sort((a, b) => a - b);

  // Outlier filter: 2.5× rough median
  const mid = Math.floor(prices.length / 2);
  const roughMedian = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
  const cleaned = prices.filter((p) => p <= roughMedian * 2.5);
  const working = cleaned.length > 0 ? cleaned : prices;

  const avg = working.reduce((s, p) => s + p, 0) / working.length;
  const wMid = Math.floor(working.length / 2);
  const median = working.length % 2 === 0 ? (working[wMid - 1] + working[wMid]) / 2 : working[wMid];

  return NextResponse.json({
    avgPrice: parseFloat(avg.toFixed(2)),
    medianPrice: parseFloat(median.toFixed(2)),
    count: prices.length,
  });
}
