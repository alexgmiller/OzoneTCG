import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "EBAY_APP_ID not configured" }, { status: 500 });
  }

  const { name, setName } = await req.json() as { name: string; setName?: string | null };
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Build a focused query: PSA 10 + card name + set if available
  const parts = ["PSA 10", name];
  if (setName) parts.push(setName);
  parts.push("pokemon");
  const keywords = parts.join(" ");

  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.0.0",
    "SECURITY-APPNAME": appId,
    "RESPONSE-DATA-FORMAT": "JSON",
    "REST-PAYLOAD": "",
    "keywords": keywords,
    "categoryId": "183454", // PSA Graded Trading Cards
    "itemFilter(0).name": "SoldItemsOnly",
    "itemFilter(0).value": "true",
    "itemFilter(1).name": "ListingType",
    "itemFilter(1).value": "AuctionWithBIN",
    "itemFilter(2).name": "ListingType(1)",
    "itemFilter(2).value": "FixedPrice",
    "sortOrder": "EndTimeSoonest",
    "paginationInput.entriesPerPage": "50",
  });

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`;

  let prices: number[] = [];

  try {
    const resp = await fetch(url, { next: { revalidate: 3600 } });
    if (!resp.ok) {
      const body = await resp.text();
      console.error("eBay API error", resp.status, body.slice(0, 500));
      return NextResponse.json({ error: "eBay API error", status: resp.status }, { status: 502 });
    }

    const data = await resp.json();
    const searchResult = data?.findCompletedItemsResponse?.[0];
    const items = searchResult?.searchResult?.[0]?.item ?? [];

    for (const item of items) {
      const sellingStatus = item?.sellingStatus?.[0];
      const soldPriceStr = sellingStatus?.convertedCurrentPrice?.[0]?.__value__;
      const price = parseFloat(soldPriceStr ?? "");
      if (Number.isFinite(price) && price > 0) {
        prices.push(price);
      }
    }
  } catch (err) {
    console.error("eBay PSA10 fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch from eBay" }, { status: 502 });
  }

  if (prices.length === 0) {
    return NextResponse.json({ avgPrice: null, medianPrice: null, count: 0, priceRange: null });
  }

  prices.sort((a, b) => a - b);

  // Remove outliers: drop bottom 10% and top 10%
  const trimCount = Math.floor(prices.length * 0.1);
  const trimmed = prices.slice(trimCount, prices.length - trimCount);
  const working = trimmed.length > 0 ? trimmed : prices;

  const avg = working.reduce((s, p) => s + p, 0) / working.length;
  const mid = Math.floor(working.length / 2);
  const median =
    working.length % 2 === 0
      ? (working[mid - 1] + working[mid]) / 2
      : working[mid];

  return NextResponse.json({
    avgPrice: parseFloat(avg.toFixed(2)),
    medianPrice: parseFloat(median.toFixed(2)),
    count: prices.length,
    priceRange: { min: prices[0], max: prices[prices.length - 1] },
  });
}
