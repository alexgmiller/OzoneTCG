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

// ── Grade parsing (re-exported from ebay-client.ts for server-side callers) ───

export type { SlabSale } from "./ebay-client";
export type { ParsedGrade } from "./ebay-client";
export { parseGrade, makeSlabPriceKey } from "./ebay-client";

// ── Query building ────────────────────────────────────────────────────────────

/** Strip parenthetical language/variant tags and TCG descriptor tags from a card name. */
function stripParentheticalTags(name: string): string {
  return name
    // Language codes: (JP), (EN), (CHN), etc.
    .replace(/\s*\([A-Z]{2,3}\)\s*/gi, " ")
    // TCG variant/rarity descriptors that pollute eBay search results
    .replace(/\s*\((Secret Rare|Special Art Rare|Illustration Rare|Alternate Full Art|Alternate Art|Full Art|Hyper Rare|Ultra Rare|Art Rare|Secret)\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
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

// ── URL resolution ────────────────────────────────────────────────────────────

/**
 * Pick the best URL for an eBay Browse API item.
 *
 * Priority:
 *   1. itemWebUrl that already contains /itm/ — direct listing URL
 *   2. itemHref  — always contains "v1|{numericId}|{variantId}"; extract and build /itm/
 *   3. Fallback  — eBay keyword search so the vendor still lands somewhere useful
 *
 * itemWebUrl for catalog-matched items points to /p/{productId} (product page),
 * not the individual listing, which is the root cause of the reported bug.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveEbayItemUrl(item: any, searchQuery: string, sold = false): string {
  const webUrl  = String(item.itemWebUrl  ?? "");
  const href    = String(item.itemHref    ?? "");
  const itemId  = String(item.itemId      ?? "");

  // 1. itemWebUrl already points to a specific listing
  const webItmMatch = webUrl.match(/\/itm\/(\d+)/);
  if (webItmMatch) return `https://www.ebay.com/itm/${webItmMatch[1]}`;

  // 2. itemHref: "https://api.ebay.com/buy/browse/v1/item/v1|123456789|0"
  const hrefMatch = href.match(/\/item\/v1\|(\d+)/);
  if (hrefMatch) return `https://www.ebay.com/itm/${hrefMatch[1]}`;

  // 3. itemId may also look like "v1|123456789|0"
  const idMatch = itemId.replace(/^v1\|/, "").match(/^(\d+)/);
  if (idMatch) return `https://www.ebay.com/itm/${idMatch[1]}`;

  // 4. Log and fall back to search
  console.log("[eBay] URL: no /itm/ found — using search fallback.",
    "itemWebUrl:", webUrl.slice(0, 80),
    "itemHref:", href.slice(0, 80));
  const params = new URLSearchParams({ _nkw: searchQuery, _sacat: POKEMON_CATEGORY_ID });
  if (sold) { params.set("LH_Complete", "1"); params.set("LH_Sold", "1"); }
  return `https://www.ebay.com/sch/i.html?${params}`;
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

  const q = primaryQ; // use the last successful query for search fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return raw.map((item: any) => ({
    price: parseFloat(item.price?.value ?? "0"),
    title: item.title ?? "",
    soldDate: item.itemEndDate ?? "",
    isBestOffer: (item.buyingOptions ?? []).includes("BEST_OFFER"),
    buyingOptions: item.buyingOptions ?? [],
    bidCount: item.bidCount,
    itemUrl: resolveEbayItemUrl(item, q),
  }));
}

/**
 * Cert-aware slab search with progressive query fallbacks.
 * Uses set name, Japanese flag, and year to improve match rates.
 * Falls back through simpler queries until results are found.
 */
export async function fetchSlabSalesFromCert(params: {
  name: string;
  company: string;
  grade: string;
  setName?: string | null;
  cardNumber?: string | null;
  isJapanese?: boolean;
  year?: string | null;
}): Promise<SlabSale[]> {
  const { name, company, grade, setName, cardNumber, isJapanese, year } = params;
  console.log("[eBay] fetchSlabSalesFromCert", params);
  const token = await getEbayToken();

  const gradeTag = `"${company} ${grade}"`;
  const num = baseCardNumber(cardNumber);
  const cleanName = stripParentheticalTags(name);
  const set = setName?.trim() || null;
  const lang = isJapanese ? "Japanese" : null;
  const oldYear = year && parseInt(year) < 2020 ? year : null;

  // Progressive query attempts, most specific → least specific
  const queries: string[] = [];

  // Attempt 1: grade + name + set + language + card number
  if (set && lang && num)  queries.push([gradeTag, cleanName, set, lang, num].join(" "));
  // Attempt 2: grade + name + set + language (no card number)
  if (set && lang)         queries.push([gradeTag, cleanName, set, lang].join(" "));
  // Attempt 3: grade + name + set + year (drop language)
  if (set && oldYear)      queries.push([gradeTag, cleanName, set, oldYear].join(" "));
  // Attempt 4: grade + name + set
  if (set)                 queries.push([gradeTag, cleanName, set].join(" "));
  // Attempt 5: grade + name + card number (drop set)
  if (num)                 queries.push([gradeTag, cleanName, num].join(" "));
  // Attempt 6: grade + name only
  queries.push([gradeTag, cleanName].join(" "));

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const uniqueQueries = queries.filter((q) => { if (seen.has(q)) return false; seen.add(q); return true; });

  for (const q of uniqueQueries) {
    const raw = await browseSearch(q, token);
    if (raw.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return raw.map((item: any) => ({
        price: parseFloat(item.price?.value ?? "0"),
        title: item.title ?? "",
        soldDate: item.itemEndDate ?? "",
        isBestOffer: (item.buyingOptions ?? []).includes("BEST_OFFER"),
        buyingOptions: item.buyingOptions ?? [],
        bidCount: item.bidCount,
        itemUrl: resolveEbayItemUrl(item, q),
      }));
    }
    console.log(`[eBay] 0 results for: ${q} — trying next`);
  }

  return [];
}

// ── Pricing calculation ───────────────────────────────────────────────────────

export type PricingResult = {
  median: number | null;
  q1: number | null;
  q3: number | null;
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
  // 1. Exclude sub-$1 noise. Keep all active listings including Best Offer —
  //    asking price is a valid market signal regardless of offer options.
  const valid = sales.filter((s) => s.price > 1);
  console.log(`[eBay] pricing: ${sales.length} raw → ${valid.length} valid (excluded <$1)`);

  if (valid.length === 0) {
    return { median: null, q1: null, q3: null, avg: null, low: null, high: null, compCount: 0, lowConfidence: true };
  }

  // 2. IQR outlier filter
  const sortedPrices = valid.map((s) => s.price).sort((a, b) => a - b);
  const { filtered: cleaned } = applyIQRFilter(valid, sortedPrices, "pricing");

  // 3. Weighted median: recent sales count fully, older count half
  const weighted = cleaned.map((s) => ({ price: s.price, weight: saleWeight(s.soldDate) }));
  const totalWeight = weighted.reduce((s, e) => s + e.weight, 0);
  const med = weightedMedian(weighted);
  const avg = weighted.reduce((s, e) => s + e.price * e.weight, 0) / totalWeight;
  const cleanedPrices = cleaned.map((s) => s.price).sort((a, b) => a - b);

  return {
    median: Math.round(med),
    q1: Math.round(pctValue(cleanedPrices, 0.25)),
    q3: Math.round(pctValue(cleanedPrices, 0.75)),
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

// ── IQR outlier filtering ─────────────────────────────────────────────────────

/** Linear-interpolation percentile on a sorted array (0 ≤ p ≤ 1). */
function pctValue(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const frac = idx - lo;
  return frac === 0 ? sorted[lo] : sorted[lo] * (1 - frac) + sorted[lo + 1] * frac;
}

type IQRBounds = { q1: number; q3: number; iqr: number; lower: number; upper: number };

/**
 * Tukey IQR filter. Requires ≥ 4 prices for meaningful quartiles.
 * Returns null when the array is too small (caller should skip filtering).
 */
function calcIQRBounds(sorted: number[]): IQRBounds | null {
  if (sorted.length < 4) return null;
  const q1 = pctValue(sorted, 0.25);
  const q3 = pctValue(sorted, 0.75);
  const iqr = q3 - q1;
  return { q1, q3, iqr, lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr };
}

/**
 * Apply IQR outlier filter to a set of items. Logs algorithm steps.
 * Falls back to the full set when IQR filter removes everything (high-variance fallback).
 * Returns { filtered, fallback } where fallback=true means the filter was skipped.
 */
function applyIQRFilter<T extends { price: number }>(
  items: T[],
  sortedPrices: number[],
  label: string
): { filtered: T[]; fallback: boolean } {
  const bounds = calcIQRBounds(sortedPrices);

  if (!bounds) {
    // Too few items for meaningful IQR — return unchanged
    return { filtered: items, fallback: false };
  }

  const { q1, q3, iqr, lower, upper } = bounds;

  // Filter and log each outlier
  const filtered = items.filter((s) => {
    if (s.price < lower) {
      console.log(`[eBay] ${label} Excluded outlier: $${r2(s.price)} (below lower bound $${r2(lower)})`);
      return false;
    }
    if (s.price > upper) {
      console.log(`[eBay] ${label} Excluded outlier: $${r2(s.price)} (above upper bound $${r2(upper)})`);
      return false;
    }
    return true;
  });

  const filteredPrices = filtered.map((s) => s.price).sort((a, b) => a - b);
  const med = filteredPrices.length > 0 ? calcMedian(filteredPrices) : null;

  console.log(
    `[eBay] ${label} IQR pricing: ${sortedPrices.length} raw → Q1=$${r2(q1)} Q3=$${r2(q3)} IQR=$${r2(iqr)} → bounds [$${r2(lower)}, $${r2(upper)}] → ${filtered.length} valid → median=$${med != null ? r2(med) : "n/a"}`
  );

  if (med != null && iqr > 0.5 * med) {
    console.warn(`[eBay] ${label} Warning: high price variance (IQR > 50% of median) — results may include mixed variants`);
  }

  // High-variance fallback: if IQR filter removed everything, use unfiltered set
  if (filtered.length === 0) {
    const fallbackMed = calcMedian(sortedPrices);
    console.log(`[eBay] ${label} IQR filter removed all items — falling back to unfiltered median=$${r2(fallbackMed)} (high variance)`);
    return { filtered: items, fallback: true };
  }

  return { filtered, fallback: false };
}

export function isSlabPriceStale(lastUpdated: string): boolean {
  return Date.now() - new Date(lastUpdated).getTime() > 24 * 60 * 60 * 1000;
}

// ── Sealed product search ─────────────────────────────────────────────────────

/**
 * Search eBay active listings for a sealed product (booster box, ETB, tin, etc.)
 * Returns active fixed-price + auction listings sorted by price ascending.
 */
export async function fetchSealedListings(
  name: string,
  setName?: string | null
): Promise<SlabSale[]> {
  const token = await getEbayToken();
  const cleanName = stripParentheticalTags(name);

  // Build queries most-specific first
  const queries: string[] = [];
  if (setName?.trim()) queries.push(`${cleanName} ${setName.trim()}`);
  queries.push(cleanName);

  const seen = new Set<string>();
  const unique = queries.filter((q) => { if (seen.has(q)) return false; seen.add(q); return true; });

  for (const q of unique) {
    const raw = await browseSearch(q, token);
    if (raw.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return raw.map((item: any) => ({
        price: parseFloat(item.price?.value ?? "0"),
        title: item.title ?? "",
        soldDate: item.itemEndDate ?? "",
        isBestOffer: (item.buyingOptions ?? []).includes("BEST_OFFER"),
        buyingOptions: item.buyingOptions ?? [],
        bidCount: item.bidCount,
        itemUrl: resolveEbayItemUrl(item, q),
      }));
    }
  }

  return [];
}

/**
 * Derive a market price for a sealed product from eBay active listings.
 * Uses median of fixed-price listings, excluding Best Offer and sub-$5 noise.
 */
export function calculateSealedPricing(listings: SlabSale[]): {
  median: number | null;
  low: number | null;
  high: number | null;
  compCount: number;
} {
  const valid = listings.filter(
    (s) => s.price >= 5 && s.buyingOptions.includes("FIXED_PRICE")
  );
  if (valid.length === 0) return { median: null, low: null, high: null, compCount: 0 };

  const sorted = valid.map((s) => s.price).sort((a, b) => a - b);
  const { filtered } = applyIQRFilter(valid, sorted, "sealed");
  const cleanedPrices = filtered.map((s) => s.price).sort((a, b) => a - b);

  return {
    median: Math.round(calcMedian(cleanedPrices)),
    low: r2(cleanedPrices[0]),
    high: r2(cleanedPrices[cleanedPrices.length - 1]),
    compCount: filtered.length,
  };
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

    const soldSearchParams = new URLSearchParams({
      _nkw: primaryQ, _sacat: POKEMON_CATEGORY_ID, LH_Complete: "1", LH_Sold: "1",
    });
    const soldSearchUrl = `https://www.ebay.com/sch/i.html?${soldSearchParams}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sales: SlabSale[] = itemSales.map((item: any) => {
      const numId = (item.itemId ?? "").replace(/^v1\|/, "").split("|")[0];
      const itemUrl = numId ? `https://www.ebay.com/itm/${numId}` : soldSearchUrl;
      console.log("[eBay-sold] Insights item URL:", itemUrl, "| itemId:", item.itemId);
      return {
        price: parseFloat(item.lastSoldPrice?.value ?? "0"),
        title: item.title ?? "",
        soldDate: item.lastSoldDate ?? "",
        isBestOffer: (item.buyingOption ?? "") === "BEST_OFFER",
        buyingOptions: item.buyingOption ? [item.buyingOption] : [],
        bidCount: item.bidCount,
        itemUrl,
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
  q1: number | null;
  q3: number | null;
  avg: number | null;
  low: number | null;
  high: number | null;
  compCount: number;
  lowConfidence: boolean;
  source: "insights" | "ebay_scraper" | "none";
};

/** Same weighting and IQR outlier logic as calculateSlabPricing, applied to sold data. */
export function calculateSoldPricing(
  sales: SlabSale[],
  source: "insights" | "ebay_scraper" | "none"
): SoldPricingResult {
  // Exclude sub-$1 noise and listings that were purely a Best Offer acceptance
  // (no fixed price component). Fixed Price listings that also accept Best Offers
  // have buyingOptions ["FIXED_PRICE","BEST_OFFER"] — those are valid sold prices.
  const valid = sales.filter(
    (s) => !(s.buyingOptions.length === 1 && s.buyingOptions[0] === "BEST_OFFER") && s.price > 1
  );
  console.log(`[eBay-sold] calculateSoldPricing: ${sales.length} raw → ${valid.length} valid (excluded pure-BO / <$1)`);

  if (valid.length === 0) {
    return { median: null, q1: null, q3: null, avg: null, low: null, high: null, compCount: 0, lowConfidence: true, source };
  }

  // IQR outlier filter
  const sortedPrices = valid.map((s) => s.price).sort((a, b) => a - b);
  const { filtered: cleaned } = applyIQRFilter(valid, sortedPrices, "sold");

  const weighted = cleaned.map((s) => ({ price: s.price, weight: saleWeight(s.soldDate) }));
  const totalWeight = weighted.reduce((s, e) => s + e.weight, 0);
  const med = weightedMedian(weighted);
  const avg = weighted.reduce((s, e) => s + e.price * e.weight, 0) / totalWeight;
  const cleanedPrices = cleaned.map((s) => s.price).sort((a, b) => a - b);

  return {
    median: Math.round(med),
    q1: Math.round(pctValue(cleanedPrices, 0.25)),
    q3: Math.round(pctValue(cleanedPrices, 0.75)),
    avg: r2(avg),
    low: r2(cleanedPrices[0]),
    high: r2(cleanedPrices[cleanedPrices.length - 1]),
    compCount: cleaned.length,
    lowConfidence: cleaned.length < 3,
    source,
  };
}
