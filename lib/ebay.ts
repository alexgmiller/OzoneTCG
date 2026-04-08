/**
 * eBay Browse API — slab pricing.
 * Endpoint: GET https://api.ebay.com/buy/browse/v1/item_summary/search
 * Auth: OAuth2 client credentials (EBAY_APP_ID + EBAY_CERT_ID)
 */

const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const POKEMON_CATEGORY_ID = "183454";

// ── OAuth token (process-level cache) ─────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getEbayToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) throw new Error("Missing EBAY_APP_ID or EBAY_CERT_ID env vars");

  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${appId}:${certId}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`eBay token request failed: ${txt}`);
  }
  const data = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  console.log("[eBay] token acquired, expires in", data.expires_in, "s");
  return tokenCache.token;
}

// ── Grade parsing ─────────────────────────────────────────────────────────────

export type ParsedGrade = { company: string; grade: string };

export function parseGrade(rawGrade: string): ParsedGrade | null {
  const m = rawGrade.trim().match(/^([A-Za-z]+)\s+(.+)$/);
  if (!m) return null;
  return { company: m[1].toUpperCase(), grade: m[2].trim() };
}

export function makeSlabPriceKey(
  name: string,
  setName: string | null | undefined,
  cardNumber: string | null | undefined,
  company: string,
  grade: string
): string {
  const num = (cardNumber ?? "").split("/")[0].trim().toLowerCase();
  return [
    name.toLowerCase().trim(),
    (setName ?? "").toLowerCase().trim(),
    num,
    company.toUpperCase(),
    grade,
  ].join("|");
}

// ── Query building ────────────────────────────────────────────────────────────

/** Strip parenthetical language/variant tags: (JP), (EN), (CHN), etc. */
function stripParentheticalTags(name: string): string {
  return name.replace(/\s*\([A-Z]{2,3}\)\s*/gi, " ").replace(/\s{2,}/g, " ").trim();
}

/** Base card number without the /total denominator: "143a/236" → "143a", "260/172" → "260" */
function baseCardNumber(cardNumber: string | null | undefined): string | null {
  if (!cardNumber) return null;
  return cardNumber.split("/")[0].trim() || null;
}

/** Primary query: "PSA 10" Togepi & Cleffa & Igglybuff GX 143a */
function buildPrimaryQuery(company: string, grade: string, name: string, cardNumber?: string | null): string {
  const parts: string[] = [`"${company} ${grade}"`, stripParentheticalTags(name)];
  const num = baseCardNumber(cardNumber);
  if (num) parts.push(num);
  return parts.join(" ");
}

/** Fallback: grade + name only, no card number */
function buildFallbackQuery(company: string, grade: string, name: string): string {
  return `"${company} ${grade}" ${stripParentheticalTags(name)}`;
}

// ── Browse API search ─────────────────────────────────────────────────────────

let _callCount = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function browseSearch(q: string, token: string): Promise<any[]> {
  _callCount++;
  const callNum = _callCount;

  const params = new URLSearchParams({
    q,
    filter: "buyingOptions:{AUCTION|FIXED_PRICE},priceCurrency:USD,conditions:{2750}",
    category_ids: POKEMON_CATEGORY_ID,
    limit: "50",
  });

  const url = `${EBAY_BROWSE_URL}?${params}`;
  console.log(`[eBay] #${callNum} q=${q}`);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Type": "application/json",
    },
  });

  console.log(`[eBay] #${callNum} HTTP ${res.status}`);

  if (!res.ok) {
    const txt = await res.text();
    console.error(`[eBay] #${callNum} error:`, txt.slice(0, 400));
    if (res.status === 429) throw new Error("EBAY_RATE_LIMITED");
    throw new Error(`eBay Browse API failed (${res.status}): ${txt}`);
  }

  const json = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = json.itemSummaries ?? [];
  console.log(`[eBay] #${callNum} returned ${items.length} / ${json.total ?? "?"}`);
  if (items.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.log(`[eBay] #${callNum} sample:`, items.slice(0, 3).map((i: any) => ({
      title: i.title,
      price: i.price,
      buyingOptions: i.buyingOptions,
      itemEndDate: i.itemEndDate,
    })));
  }
  return items;
}

// ── Public search ─────────────────────────────────────────────────────────────

export type SlabSale = {
  price: number;
  title: string;
  soldDate: string;        // sold date (Insights) or listing end date (Browse active/ended)
  isBestOffer: boolean;
  buyingOptions: string[]; // e.g. ["FIXED_PRICE"], ["AUCTION"], ["FIXED_PRICE","BEST_OFFER"]
  bidCount?: number;       // auctions only
  itemUrl: string;         // direct eBay listing URL
};

export async function fetchSlabSales(
  name: string,
  company: string,
  grade: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<SlabSale[]> {
  console.log("[eBay] fetchSlabSales", { name, company, grade, cardNumber });
  const token = await getEbayToken();

  const primaryQ = buildPrimaryQuery(company, grade, name, cardNumber);
  let raw = await browseSearch(primaryQ, token);

  if (raw.length === 0) {
    console.log("[eBay] 0 results — retrying without card number");
    const fallbackQ = buildFallbackQuery(company, grade, name);
    raw = await browseSearch(fallbackQ, token);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return raw.map((item: any) => ({
    price: parseFloat(item.price?.value ?? "0"),
    title: item.title ?? "",
    soldDate: item.itemEndDate ?? "",
    isBestOffer: (item.buyingOptions ?? []).includes("BEST_OFFER"),
    buyingOptions: item.buyingOptions ?? [],
    bidCount: item.bidCount,
    itemUrl: item.itemWebUrl ?? "",
  }));
}

// ── Pricing calculation ───────────────────────────────────────────────────────

export type PricingResult = {
  median: number | null;
  avg: number | null;
  low: number | null;
  high: number | null;
  compCount: number;
  lowConfidence: boolean;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Recent sales (≤30 days) weight 1.0; older weight 0.5 */
function saleWeight(soldDate: string): number {
  if (!soldDate) return 0.5;
  return Date.now() - new Date(soldDate).getTime() <= THIRTY_DAYS_MS ? 1.0 : 0.5;
}

function weightedMedian(entries: Array<{ price: number; weight: number }>): number {
  const sorted = [...entries].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((s, e) => s + e.weight, 0);
  let cum = 0;
  for (const e of sorted) {
    cum += e.weight;
    if (cum >= total / 2) return e.price;
  }
  return sorted[sorted.length - 1].price;
}

export function calculateSlabPricing(sales: SlabSale[]): PricingResult {
  // 1. Exclude Best Offer and sub-$1 noise
  const valid = sales.filter((s) => !s.isBestOffer && s.price > 1);
  console.log(`[eBay] pricing: ${sales.length} raw → ${valid.length} valid (excluded Best Offer / <$1)`);

  if (valid.length === 0) {
    return { median: null, avg: null, low: null, high: null, compCount: 0, lowConfidence: true };
  }

  // 2. Rough unweighted median to anchor outlier cutoff
  const sortedPrices = valid.map((s) => s.price).sort((a, b) => a - b);
  const roughMedian = calcMedian(sortedPrices);

  // 3. Remove outliers beyond 2.5× rough median
  const cleaned = valid.filter((s) => s.price <= roughMedian * 2.5);
  console.log(`[eBay] pricing: ${cleaned.length} after outlier filter (cutoff=${r2(roughMedian * 2.5)})`);

  if (cleaned.length === 0) {
    return { median: null, avg: null, low: null, high: null, compCount: 0, lowConfidence: true };
  }

  // 4. Weighted entries: recent sales count fully, older count half
  const weighted = cleaned.map((s) => ({ price: s.price, weight: saleWeight(s.soldDate) }));
  const totalWeight = weighted.reduce((s, e) => s + e.weight, 0);

  const med = weightedMedian(weighted);
  const avg = weighted.reduce((s, e) => s + e.price * e.weight, 0) / totalWeight;

  const cleanedPrices = cleaned.map((s) => s.price).sort((a, b) => a - b);

  console.log(`[eBay] pricing result: median=${r2(med)} avg=${r2(avg)} comps=${cleaned.length}`);

  return {
    median: r2(med),
    avg: r2(avg),
    low: r2(cleanedPrices[0]),
    high: r2(cleanedPrices[cleanedPrices.length - 1]),
    compCount: cleaned.length,
    lowConfidence: cleaned.length < 3,
  };
}

function calcMedian(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isSlabPriceStale(lastUpdated: string): boolean {
  return Date.now() - new Date(lastUpdated).getTime() > 24 * 60 * 60 * 1000;
}

// ── Sold listings (Marketplace Insights → eBay completed-search scraper) ─────

const EBAY_INSIGHTS_URL =
  "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search";

/**
 * Fetch sold/completed listings.
 *
 * Step 1: Marketplace Insights API — returns real eBay sold data (requires approved access).
 * Step 2: If Insights returns 403, fall back to scraping eBay's public completed-items
 *         search page (lib/ebay-completed-scraper.ts).
 *
 * To remove the scraper fallback when Marketplace Insights access is approved:
 *   Delete lib/ebay-completed-scraper.ts and remove the 403 branch below.
 */
export async function fetchSlabSoldSales(
  name: string,
  company: string,
  grade: string,
  cardNumber?: string | null
): Promise<{ sales: SlabSale[]; source: "insights" | "ebay_scraper" | "none" }> {
  const token = await getEbayToken();
  const primaryQ = buildPrimaryQuery(company, grade, name, cardNumber);
  const fallbackQ = buildFallbackQuery(company, grade, name);

  _callCount++;
  const callNum = _callCount;
  const params = new URLSearchParams({
    q: primaryQ,
    category_ids: POKEMON_CATEGORY_ID,
    limit: "50",
    filter: "priceCurrency:USD,conditions:{2750}",
  });

  const insightsUrl = `${EBAY_INSIGHTS_URL}?${params}`;
  console.log(`[eBay-sold] #${callNum} Insights q=${primaryQ}`);
  console.log(`[eBay-sold] #${callNum} Insights URL: ${insightsUrl}`);
  const res = await fetch(insightsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Type": "application/json",
    },
  });
  console.log(`[eBay-sold] #${callNum} Insights HTTP ${res.status}`);

  if (res.ok) {
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let itemSales: any[] = json.itemSales ?? [];
    console.log(`[eBay-sold] #${callNum} Insights returned ${itemSales.length} sales`);
    if (itemSales.length > 0) {
      console.log(`[eBay-sold] #${callNum} Insights raw item[0]:`, JSON.stringify(itemSales[0]));
      if (itemSales.length > 1) console.log(`[eBay-sold] #${callNum} Insights raw item[1]:`, JSON.stringify(itemSales[1]));
    }

    if (itemSales.length === 0) {
      _callCount++;
      const params2 = new URLSearchParams({
        q: fallbackQ,
        category_ids: POKEMON_CATEGORY_ID,
        limit: "50",
        filter: "priceCurrency:USD,conditions:{2750}",
      });
      const insightsUrl2 = `${EBAY_INSIGHTS_URL}?${params2}`;
      console.log(`[eBay-sold] #${_callCount} Insights retry q=${fallbackQ}`);
      console.log(`[eBay-sold] #${_callCount} Insights retry URL: ${insightsUrl2}`);
      const res2 = await fetch(insightsUrl2, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          "Content-Type": "application/json",
        },
      });
      if (res2.ok) {
        const json2 = await res2.json();
        itemSales = json2.itemSales ?? [];
        console.log(`[eBay-sold] #${_callCount} Insights retry returned ${itemSales.length} sales`);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sales: SlabSale[] = itemSales.map((item: any) => {
      const numId = (item.itemId ?? "").replace(/^v1\|/, "").split("|")[0];
      return {
        price: parseFloat(item.lastSoldPrice?.value ?? "0"),
        title: item.title ?? "",
        soldDate: item.lastSoldDate ?? "",
        isBestOffer: (item.buyingOption ?? "") === "BEST_OFFER",
        buyingOptions: item.buyingOption ? [item.buyingOption] : [],
        bidCount: item.bidCount,
        itemUrl: numId ? `https://www.ebay.com/itm/${numId}` : "",
      };
    });
    return { sales, source: "insights" };
  }

  // 403 = no Marketplace Insights access; fall back to eBay completed-search scraper
  if (res.status === 403) {
    console.log(`[eBay-sold] #${callNum} Insights 403 — falling back to eBay completed-search scraper`);
    const { scrapeEbayCompletedSales } = await import("./ebay-completed-scraper");
    const { sales, source } = await scrapeEbayCompletedSales(name, company, grade, cardNumber);
    return { sales, source };
  }

  const txt = await res.text();
  if (res.status === 429) throw new Error("EBAY_RATE_LIMITED");
  throw new Error(`eBay Insights failed (${res.status}): ${txt}`);
}

export type SoldPricingResult = {
  median: number | null;
  avg: number | null;
  low: number | null;
  high: number | null;
  compCount: number;
  lowConfidence: boolean;
  source: "insights" | "ebay_scraper" | "none";
};

/** Same weighting and outlier logic as calculateSlabPricing, applied to sold data. */
export function calculateSoldPricing(
  sales: SlabSale[],
  source: "insights" | "ebay_scraper" | "none"
): SoldPricingResult {
  const valid = sales.filter((s) => !s.isBestOffer && s.price > 1);
  console.log(`[eBay-sold] calculateSoldPricing: ${sales.length} raw → ${valid.length} valid`);

  if (valid.length === 0) {
    return { median: null, avg: null, low: null, high: null, compCount: 0, lowConfidence: true, source };
  }

  const sortedPrices = valid.map((s) => s.price).sort((a, b) => a - b);
  const roughMedian = calcMedian(sortedPrices);
  const cleaned = valid.filter((s) => s.price <= roughMedian * 2.5);

  if (cleaned.length === 0) {
    return { median: null, avg: null, low: null, high: null, compCount: 0, lowConfidence: true, source };
  }

  const weighted = cleaned.map((s) => ({ price: s.price, weight: saleWeight(s.soldDate) }));
  const totalWeight = weighted.reduce((s, e) => s + e.weight, 0);
  const med = weightedMedian(weighted);
  const avg = weighted.reduce((s, e) => s + e.price * e.weight, 0) / totalWeight;
  const cleanedPrices = cleaned.map((s) => s.price).sort((a, b) => a - b);

  console.log(`[eBay-sold] sold result: median=${r2(med)} comps=${cleaned.length} source=${source}`);

  return {
    median: r2(med),
    avg: r2(avg),
    low: r2(cleanedPrices[0]),
    high: r2(cleanedPrices[cleanedPrices.length - 1]),
    compCount: cleaned.length,
    lowConfidence: cleaned.length < 3,
    source,
  };
}
