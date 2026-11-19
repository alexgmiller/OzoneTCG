/**
 * Cron-based background slab price refresh.
 * Scheduled daily at 02:30 in vercel.json (Vercel Hobby crons run at most
 * daily), before refresh-prices writes the snapshot; any scheduler can call
 * it more often.
 * Authorization: Bearer $CRON_SECRET
 *
 * Processes stale slabs across all workspaces using tier-based refresh windows:
 *   FMV > $200 or low confidence (<3 comps): every 2h
 *   FMV $50–$200:                             every 4h
 *   FMV < $50:                                every 8h
 *
 * Daily eBay call budget: 5,000. Stops at 80% (4,000 calls).
 * Each slab refresh = 2 calls (active + sold listings).
 *
 * PokeInvest goes first (lib/pokeinvestSlabs.ts): a slab whose exact grade
 * has a PokeInvest price (3+ sales within a year) takes it and skips eBay.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasMarketSourceColumns, marketStamp } from "@/lib/marketSource";
import { refreshPokeInvestCards, slabCardKey, slabPokeInvestPrice } from "@/lib/pokeinvestSlabs";
import { backfillSlabHistory } from "@/lib/pokeinvestHistory";
// Up to 5 minutes; the loop stops itself before that (time guard below)
export const maxDuration = 300;
import {
  parseGrade,
  makeSlabPriceKey,
  fetchSlabSales,
  calculateSlabPricing,
  fetchSlabSoldSales,
  calculateSoldPricing,
} from "@/lib/ebay";

const TIER_2H = 2 * 60 * 60 * 1000;
const TIER_4H = 4 * 60 * 60 * 1000;
const TIER_8H = 8 * 60 * 60 * 1000;
const DAILY_BUDGET = 5000;
const BUDGET_WARN_PCT = 0.8;
const DELAY_MS = 3000; // 3s between requests — respectful scraping cadence

function getSlabTierMs(fmv: number | null, compCount: number): number {
  if (compCount < 3) return TIER_2H;
  if (fmv == null)   return TIER_2H;
  if (fmv > 200)     return TIER_2H;
  if (fmv >= 50)     return TIER_4H;
  return TIER_8H;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const started = Date.now();

  // ── Daily call count (2 calls per row updated today) ──────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const { count: todayCount } = await admin
    .from("slab_prices")
    .select("*", { count: "exact", head: true })
    .gte("last_updated", `${today}T00:00:00.000Z`);
  let callCount = (todayCount ?? 0) * 2;

  // ── Fetch all slab items with their cached prices ─────────────────────────
  const withSource = await hasMarketSourceColumns(admin);
  const { data: rows, error: itemsErr } = await admin
    .from("items")
    .select(`id,name,grade,set_name,card_number,language,workspace_id,market${withSource ? ",market_source" : ""}`)
    .eq("category", "slab")
    .neq("status", "sold")
    .neq("status", "grading")
    .not("grade", "is", null);
  type SlabRow = {
    id: string; name: string; grade: string; set_name: string | null; card_number: string | null;
    language: string | null; workspace_id: string; market: number | null; market_source?: string | null;
  };
  const items = rows as unknown as SlabRow[] | null;

  if (itemsErr) {
    console.error("[cron] items fetch error:", itemsErr);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  if (!items?.length) {
    return NextResponse.json({ processed: 0, skipped: 0, elapsed: 0 });
  }

  // ── PokeInvest first ──────────────────────────────────────────────────────
  // Brings each card's PokeInvest prices up to date (one call per card every
  // 3 days), then gives every slab with a trusted grade price that price.
  const pokeinvest = await refreshPokeInvestCards(admin, items, { key: process.env.POKEINVEST_API_KEY?.trim() });
  const pokeinvestPriced = new Set<string>();
  let pokeinvestChanged = 0;
  for (const it of items) {
    const price = slabPokeInvestPrice(pokeinvest.rows.get(slabCardKey(it.name, it.set_name, it.card_number)), it.grade);
    if (!price) continue;
    pokeinvestPriced.add(it.id);
    if (it.market === price.median && (!withSource || it.market_source === "pokeinvest")) continue;
    const { error } = await admin
      .from("items")
      .update({ market: price.median, ...(withSource ? marketStamp("pokeinvest", price.fetchedAt ?? new Date().toISOString()) : {}) })
      .eq("id", it.id)
      .eq("workspace_id", it.workspace_id);
    if (error) console.error(`[cron] PokeInvest price for ${it.name} not saved:`, error.message);
    else pokeinvestChanged++;
  }
  console.log(
    `[cron] PokeInvest: ${pokeinvestPriced.size}/${items.length} slabs priced, ${pokeinvestChanged} changed · ${JSON.stringify(pokeinvest.stats)}` +
    (pokeinvest.tableMissing ? " · pokeinvest_cards is missing (run migrations/20261118_pokeinvest_cards.sql)" : ""),
  );

  // Charts back to 2022 for the slabs PokeInvest prices (lib/pokeinvestHistory.ts):
  // one call per card, once, at most 10 a night inside the daily limit
  const history = await backfillSlabHistory(admin, items.filter((it) => pokeinvestPriced.has(it.id)), {
    key: process.env.POKEINVEST_API_KEY?.trim(),
  }).catch((e) => ({ fetched: 0, filled: 0, points: 0, stopped: e instanceof Error ? e.message : String(e) }));
  console.log(`[cron] PokeInvest history: ${JSON.stringify(history)}`);

  if (callCount >= DAILY_BUDGET * BUDGET_WARN_PCT) {
    console.log(`[cron] Daily budget at ${callCount}/${DAILY_BUDGET} — skipping eBay`);
    return NextResponse.json({ skipped: true, reason: "budget", callCount, pokeinvest: { priced: pokeinvestPriced.size, changed: pokeinvestChanged, ...pokeinvest.stats } });
  }

  // eBay for the rest
  const keyed = items.filter((it) => !pokeinvestPriced.has(it.id)).flatMap((it) => {
    const parsed = parseGrade(it.grade);
    if (!parsed) return [];
    const key = makeSlabPriceKey(it.name, it.set_name, it.card_number, parsed.company, parsed.grade);
    return [{ item: it, parsed, key }];
  });

  // Fetch cached prices for all keys
  const { data: priceRows } = await admin
    .from("slab_prices")
    .select("lookup_key,fair_market_value,sold_median,median_price,comp_count,sold_count,last_updated,active_items")
    .in("lookup_key", keyed.map((k) => k.key));
  const priceMap = new Map((priceRows ?? []).map((r) => [r.lookup_key, r]));

  // ── Build stale queue ─────────────────────────────────────────────────────
  const stale = keyed.filter(({ key }) => {
    const sp = priceMap.get(key);
    if (!sp?.last_updated) return true;
    const fmv = sp.fair_market_value ?? sp.sold_median ?? sp.median_price ?? null;
    const compCount = (sp.sold_count ?? 0) > 0 ? sp.sold_count : (sp.comp_count ?? 0);
    const tierMs = getSlabTierMs(fmv, compCount);
    const hasListings = sp.active_items != null;
    return !hasListings || Date.now() - new Date(sp.last_updated).getTime() > tierMs;
  });

  // Sort: no cached data first, then low confidence, then high value
  stale.sort((a, b) => {
    const rank = (k: string) => {
      const sp = priceMap.get(k);
      if (!sp) return 0;
      const compCount = (sp.sold_count ?? 0) > 0 ? sp.sold_count : (sp.comp_count ?? 0);
      if (compCount < 3) return 1;
      const fmv = sp.fair_market_value ?? sp.sold_median ?? sp.median_price ?? 0;
      if (fmv > 200) return 2;
      if (fmv >= 50) return 3;
      return 4;
    };
    return rank(a.key) - rank(b.key);
  });

  console.log(`[cron] ${stale.length} stale slabs to refresh (callCount so far: ${callCount})`);

  let processed = 0;
  let skipped = 0;

  for (const { item, parsed, key } of stale) {
    if (callCount >= DAILY_BUDGET * BUDGET_WARN_PCT) {
      console.log(`[cron] Budget limit reached at ${callCount} calls — stopping`);
      break;
    }
    // Stop after 4 minutes to stay within Vercel function timeout
    if (Date.now() - started > 4 * 60 * 1000) {
      console.log("[cron] Approaching timeout — stopping early");
      break;
    }

    const sp = priceMap.get(key);
    const fmv = sp ? (sp.fair_market_value ?? sp.sold_median ?? sp.median_price ?? null) : null;
    const compCount = sp ? ((sp.sold_count ?? 0) > 0 ? sp.sold_count : (sp.comp_count ?? 0)) : 0;
    const tierMs = getSlabTierMs(fmv, compCount);

    try {
      // Active listings
      const activeSales = await fetchSlabSales(item.name, parsed.company, parsed.grade, item.set_name, item.card_number);
      callCount++;
      const activePricing = calculateSlabPricing(activeSales);

      // Sold listings
      let soldSalesRaw: Awaited<ReturnType<typeof fetchSlabSoldSales>>["sales"] = [];
      let soldPricing;
      try {
        const { sales, source } = await fetchSlabSoldSales(item.name, parsed.company, parsed.grade, item.card_number);
        soldSalesRaw = sales;
        soldPricing = calculateSoldPricing(sales, source);
        callCount++;
      } catch {
        soldPricing = undefined;
      }

      const fairMarketValue = soldPricing?.median ?? activePricing.median;

      await admin.from("slab_prices").upsert({
        lookup_key: key,
        median_price: activePricing.median,
        avg_price: activePricing.avg,
        low_price: activePricing.low,
        high_price: activePricing.high,
        comp_count: activePricing.compCount,
        previous_median: sp?.median_price ?? null,
        sold_median: soldPricing?.median ?? null,
        sold_avg: soldPricing?.avg ?? null,
        sold_low: soldPricing?.low ?? null,
        sold_high: soldPricing?.high ?? null,
        sold_count: soldPricing?.compCount ?? 0,
        fair_market_value: fairMarketValue,
        last_updated: new Date().toISOString(),
        active_items: activeSales,
        sold_items: soldSalesRaw,
      });

      if (fairMarketValue != null) {
        await admin
          .from("items")
          .update({ market: fairMarketValue, ...(withSource ? marketStamp("ebay", new Date().toISOString()) : {}) })
          .eq("id", item.id)
          .eq("workspace_id", item.workspace_id);
      }

      processed++;
      console.log(`[cron] Refreshed ${item.name} (${parsed.company} ${parsed.grade}) fmv=${fairMarketValue} tier=${Math.round(tierMs / 60000)}m`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "EBAY_RATE_LIMITED") {
        console.warn("[cron] eBay rate limited — stopping");
        break;
      }
      console.error(`[cron] Error refreshing ${item.name}:`, msg);
      skipped++;
    }

    await sleep(DELAY_MS);
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(`[cron] Done. processed=${processed} skipped=${skipped} callCount=${callCount} elapsed=${elapsed}s`);

  return NextResponse.json({
    processed, skipped, callCount, elapsed, staleCount: stale.length,
    pokeinvest: { priced: pokeinvestPriced.size, changed: pokeinvestChanged, ...pokeinvest.stats },
  });
}
