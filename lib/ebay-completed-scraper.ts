/**
 * eBay completed listings scraper.
 *
 * Scrapes eBay's public completed-items search page to get real sold data.
 * Used as a fallback when Marketplace Insights API access is unavailable.
 *
 * Source URL: https://www.ebay.com/sch/i.html?_nkw=...&LH_Complete=1&LH_Sold=1&_sacat=183454
 *
 * HTML structure (confirmed from live page — April 2026):
 *   .su-card-container__content      — wrapper for each sold listing card
 *     [aria-label="Sold Item"]       — sold date text: "Sold  Apr 3, 2026"
 *     a.s-card__link                 — href: https://www.ebay.com/itm/{id}?...
 *     .s-card__title span            — listing title text
 *     .s-card__price                 — sold price: "$486.91"
 *     .su-card-container__attributes .su-styled-text.secondary
 *                                    — sale type: "Buy It Now" / "N bids" / "Best offer accepted"
 *
 * NOTE on URLs: each a.s-card__link href is a unique /itm/{itemId}?... URL.
 * The page also contains /p/{productId} links (product review anchors) — those
 * are NOT s-card__link elements; they are filtered out by the /itm/ regex.
 *
 * To remove this fallback when Marketplace Insights access is approved:
 *   1. Delete this file
 *   2. Remove the import + fallback call in lib/ebay.ts fetchSlabSoldSales()
 */

import * as cheerio from "cheerio";

const EBAY_SCH_URL = "https://www.ebay.com/sch/i.html";
const POKEMON_CAT_ID = "183454";
const SCRAPER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type ScrapedSale = {
  price: number;
  title: string;
  soldDate: string;
  isBestOffer: boolean;
  buyingOptions: string[];
  itemUrl: string;
};

/** Build a clean eBay keyword query for completed slab sales. */
function buildQuery(
  company: string,
  grade: string,
  name: string,
  cardNumber?: string | null
): string {
  // Strip language codes (JP), (EN), (CHN) and TCG descriptor tags (Secret), (Full Art), etc.
  const cleanName = name
    .replace(/\s*\([A-Z]{2,3}\)\s*/gi, " ")
    .replace(/\s*\((Secret Rare|Special Art Rare|Illustration Rare|Alternate Full Art|Alternate Art|Full Art|Hyper Rare|Ultra Rare|Art Rare|Secret)\)\s*/gi, " ")
    .replace(/&/g, " ") // & in card names can confuse URL parsing
    .replace(/\s{2,}/g, " ")
    .trim();
  const num = cardNumber ? cardNumber.split("/")[0].trim() : null;
  const parts = [`${company} ${grade}`, cleanName];
  if (num) parts.push(num);
  return parts.join(" ");
}

/**
 * Extract keywords from a card name for relevance checking.
 * Returns the first word(s) that unambiguously identify the card:
 * "Togepi & Cleffa & Igglybuff GX" → ["togepi", "igglybuff"]
 * "Charizard VMAX" → ["charizard"]
 */
function extractRelevanceKeywords(name: string): string[] {
  const clean = name
    .replace(/\s*\([A-Z]{2,3}\)\s*/gi, " ")
    .replace(/&/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toLowerCase();
  // Split on spaces, filter out common generic terms
  const stopWords = new Set(["gx", "v", "vmax", "vstar", "ex", "tag", "team", "ultra", "rare", "holo", "full", "art", "promo"]);
  const words = clean.split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w));
  // Return first two meaningful words
  return words.slice(0, 2);
}

/**
 * Scrape eBay completed/sold listings for a graded slab.
 * Returns up to ~60 sold records (one page of eBay results).
 */
export async function scrapeEbayCompletedSales(
  name: string,
  company: string,
  grade: string,
  cardNumber?: string | null
): Promise<{ sales: ScrapedSale[]; source: "ebay_scraper" | "none" }> {
  const primaryQ = buildQuery(company, grade, name, cardNumber);
  const fallbackQ = buildQuery(company, grade, name); // no card number

  let sales = await fetchAndParse(primaryQ, name, company, grade);
  if (sales.length === 0 && cardNumber) {
    console.log(`[eBay-scraper] 0 results on primary query — retrying without card number`);
    sales = await fetchAndParse(fallbackQ, name, company, grade);
  }

  if (sales.length === 0) {
    console.warn(`[eBay-scraper] 0 sold items found for "${primaryQ}" — sold data unavailable`);
    return { sales: [], source: "none" };
  }

  console.log(`[eBay-scraper] Final: ${sales.length} relevant sold items for "${primaryQ}"`);
  return { sales, source: "ebay_scraper" };
}

async function fetchAndParse(
  q: string,
  name: string,
  company: string,
  grade: string
): Promise<ScrapedSale[]> {
  const params = new URLSearchParams({
    _nkw: q,
    LH_Complete: "1",
    LH_Sold: "1",
    _sacat: POKEMON_CAT_ID,
  });
  const url = `${EBAY_SCH_URL}?${params}`;
  // Fallback URL used when a listing's /itm/ link can't be extracted
  const soldSearchUrl = url;

  console.log(`[eBay-scraper] GET ${url}`);

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": SCRAPER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    console.log(`[eBay-scraper] HTTP ${res.status} for q="${q}"`);
    if (!res.ok) {
      console.warn(`[eBay-scraper] Non-200 (${res.status}) — skipping`);
      return [];
    }
    html = await res.text();
  } catch (err) {
    console.error(`[eBay-scraper] fetch error:`, err instanceof Error ? err.message : err);
    return [];
  }

  return parseCompletedHtml(html, q, name, company, grade, soldSearchUrl);
}

function parseCompletedHtml(
  html: string,
  q: string,
  name: string,
  company: string,
  grade: string,
  fallbackUrl: string
): ScrapedSale[] {
  const $ = cheerio.load(html);
  const relevanceKeywords = extractRelevanceKeywords(name);
  const gradeToken = `${company} ${grade}`.toLowerCase(); // e.g. "psa 10"

  console.log(`[eBay-scraper] Relevance keywords: ${JSON.stringify(relevanceKeywords)} + "${gradeToken}"`);

  const allItems: Array<ScrapedSale & { _debug: string }> = [];
  let debugCount = 0;

  $(".su-card-container__content").each((idx, el) => {
    // Only process cards that have the sold-item label
    const soldEl = $(el).find('[aria-label="Sold Item"]');
    if (soldEl.length === 0) return;

    // ── DEBUG: dump raw inner HTML of first 3 items ──────────────────────────
    if (debugCount < 3) {
      const rawHtml = $(el).html() ?? "";
      console.log(`[eBay-scraper] DEBUG item[${debugCount}] raw HTML (first 600 chars):`);
      console.log(rawHtml.slice(0, 600));
      debugCount++;
    }

    // Sold date: "Sold  Apr 3, 2026" → "Apr 3, 2026"
    const soldDate = soldEl.text().trim().replace(/^Sold\s+/, "").trim();

    // URL: first s-card__link href — always /itm/{itemId}?...
    // The page also has /p/{productId} anchors (product reviews) — they are NOT
    // s-card__link elements, so they are naturally excluded here.
    const linkEl = $(el).find("a.s-card__link").first();
    const rawHref = linkEl.attr("href") ?? "";
    const itemIdMatch = rawHref.match(/https?:\/\/(?:www\.)?ebay\.com\/itm\/(\d+)/);
    // Fall back to the sold-search URL so the click still lands somewhere useful.
    const itemUrl = itemIdMatch
      ? `https://www.ebay.com/itm/${itemIdMatch[1]}`
      : fallbackUrl;

    if (!itemIdMatch) {
      console.warn(`[eBay-scraper] item[${idx}] no /itm/ link — using search fallback. href="${rawHref.slice(0, 120)}"`);
    }

    // Title: first span inside .s-card__title
    const title = $(el).find(".s-card__title span").first().text().trim();

    // Price: .s-card__price text
    const priceRaw = $(el).find(".s-card__price").first().text().trim();
    const price = parseFloat(priceRaw.replace(/[^0-9.]/g, "")) || 0;
    if (price === 0) return; // no parseable price — skip

    // Sale type from secondary attribute text
    const saleTypeRaw = $(el)
      .find(".su-card-container__attributes .su-styled-text.secondary")
      .first()
      .text()
      .trim();
    const isAuction = /\d+\s*bid/i.test(saleTypeRaw);
    const isBestOffer = /best offer/i.test(saleTypeRaw);

    allItems.push({
      price,
      title,
      soldDate,
      isBestOffer,
      buyingOptions: isAuction
        ? ["AUCTION"]
        : isBestOffer
          ? ["FIXED_PRICE", "BEST_OFFER"]
          : ["FIXED_PRICE"],
      itemUrl,
      _debug: saleTypeRaw,
    });
  });

  // ── Relevance filtering ───────────────────────────────────────────────────
  // Title must contain at least one card keyword AND the grade string.
  // This prevents completely unrelated cards from skewing pricing.
  let passed = 0;
  let filtered = 0;
  const sales: ScrapedSale[] = [];

  for (const item of allItems) {
    const tl = item.title.toLowerCase();
    const hasKeyword = relevanceKeywords.length === 0 || relevanceKeywords.some((kw) => tl.includes(kw));
    const hasGrade = tl.includes(gradeToken);

    if (!hasKeyword || !hasGrade) {
      console.log(`[eBay-scraper] filtered: irrelevant — "${item.title.slice(0, 80)}" (keyword=${hasKeyword} grade=${hasGrade})`);
      filtered++;
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _debug, ...sale } = item;
    sales.push(sale);
    passed++;
  }

  // ── Summary log ──────────────────────────────────────────────────────────
  console.log(`[eBay-scraper] Parsed ${allItems.length} items, ${passed} passed relevance, ${filtered} filtered`);
  console.log(`[eBay-scraper] All extracted titles and URLs:`);
  for (let i = 0; i < allItems.length; i++) {
    const it = allItems[i];
    const tl = it.title.toLowerCase();
    const hasKeyword = relevanceKeywords.length === 0 || relevanceKeywords.some((kw) => tl.includes(kw));
    const hasGrade = tl.includes(gradeToken);
    const status = hasKeyword && hasGrade ? "PASS" : "FILTERED";
    console.log(`[eBay-scraper]   [${String(i + 1).padStart(2, "0")}] ${status} | ${it.soldDate} | $${it.price} | ${it.itemUrl || "NO URL"}`);
    console.log(`[eBay-scraper]        "${it.title.slice(0, 90)}"`);
  }

  return sales;
}
