"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

// ── Single-item lookups ──
export async function refreshItemPrice(
  id: string,
  name: string,
  category: "single" | "slab" | "sealed",
  options?: { setName?: string | null; cardNumber?: string | null }
): Promise<{ updated: boolean }> {
  const { lookupCard } = await import("@/lib/pokemonPriceTracker");
  const result = await lookupCard(name, category, options ?? undefined);
  if (!result) return { updated: false };

  const patch: Record<string, unknown> = {};
  if (result.imageUrl) patch.image_url = result.imageUrl;
  if (result.market != null) patch.market = result.market;
  if (Object.keys(patch).length === 0) return { updated: false };

  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase
    .from("items")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
  return { updated: true };
}

export async function getEbayDailyCallCount(): Promise<number> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await admin
    .from("slab_prices")
    .select("*", { count: "exact", head: true })
    .gte("last_updated", `${today}T00:00:00.000Z`);
  const calls = (count ?? 0) * 2; // 2 eBay calls per slab refresh (active + sold)
  console.log(`[eBay] Daily call estimate: ${calls} (${today})`);
  return calls;
}

// ── Slab pricing (eBay) ──
export type RefreshedSlabPrice = {
  lookup_key: string;
  median_price: number | null;
  avg_price: number | null;
  low_price: number | null;
  high_price: number | null;
  comp_count: number;
  previous_median: number | null;
  sold_median: number | null;
  sold_avg: number | null;
  sold_low: number | null;
  sold_high: number | null;
  sold_count: number;
  fair_market_value: number | null;
  last_updated: string;
  active_items: import("@/lib/ebay").SlabSale[] | null;
  sold_items: import("@/lib/ebay").SlabSale[] | null;
};

export async function refreshSlabPrice(
  itemId: string,
  name: string,
  grade: string,
  setName?: string | null,
  cardNumber?: string | null,
  maxAgeMs?: number // undefined = force (manual); number = tier window (background auto-refresh)
): Promise<{ updated: boolean; median: number | null; compCount: number; lowConfidence: boolean; rateLimited?: boolean; refreshedPrice?: RefreshedSlabPrice }> {
  const {
    parseGrade,
    fetchSlabSales,
    calculateSlabPricing,
    fetchSlabSoldSales,
    calculateSoldPricing,
    makeSlabPriceKey,
  } = await import("@/lib/ebay");

  const parsed = parseGrade(grade);
  if (!parsed) return { updated: false, median: null, compCount: 0, lowConfidence: true };

  const admin = createAdminClient();
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const lookupKey = makeSlabPriceKey(name, setName, cardNumber, parsed.company, parsed.grade);

  // Server-side staleness guard — only applies to background auto-refresh calls (maxAgeMs set).
  // Manual calls (maxAgeMs undefined) always hit eBay.
  const { data: existing } = await admin
    .from("slab_prices")
    .select("median_price, comp_count, last_updated, active_items")
    .eq("lookup_key", lookupKey)
    .maybeSingle();

  if (maxAgeMs !== undefined && existing?.last_updated) {
    const age = Date.now() - new Date(existing.last_updated).getTime();
    const hasListings = existing.active_items != null;
    if (age < maxAgeMs && hasListings) {
      console.log("[refreshSlabPrice] cache hit, skipping. Age:", Math.round(age / 60000), "min, tier:", Math.round(maxAgeMs / 60000), "min");
      return {
        updated: false,
        median: existing.median_price ?? null,
        compCount: existing.comp_count ?? 0,
        lowConfidence: (existing.comp_count ?? 0) < 3,
      };
    }
  }

  console.log("[refreshSlabPrice] fetching eBay active + sold", { name, grade, cardNumber });

  // ── Active listings ──────────────────────────────────────────────────────
  // Never throw from eBay calls — a network/API failure should not crash the page.
  let activeSales: import("@/lib/ebay").SlabSale[] = [];
  try {
    activeSales = await fetchSlabSales(name, parsed.company, parsed.grade, setName, cardNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "EBAY_RATE_LIMITED") {
      return { updated: false, median: null, compCount: 0, lowConfidence: true, rateLimited: true };
    }
    console.error("[refreshSlabPrice] active listings fetch failed (non-fatal):", msg);
    return { updated: false, median: null, compCount: 0, lowConfidence: true };
  }
  const activePricing = calculateSlabPricing(activeSales);

  // ── Sold listings ────────────────────────────────────────────────────────
  let soldPricing;
  let soldSalesRaw: import("@/lib/ebay").SlabSale[] = [];
  try {
    const { sales: soldSales, source } = await fetchSlabSoldSales(
      name, parsed.company, parsed.grade, cardNumber
    );
    soldSalesRaw = soldSales;
    soldPricing = calculateSoldPricing(soldSales, source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "EBAY_RATE_LIMITED") {
      console.warn("[refreshSlabPrice] sold fetch rate limited, skipping");
    } else {
      console.error("[refreshSlabPrice] sold listings fetch failed (non-fatal):", msg);
    }
    soldPricing = undefined;
  }

  const fairMarketValue = soldPricing?.median ?? activePricing.median;

  const { error: upsertError } = await admin.from("slab_prices").upsert({
    lookup_key: lookupKey,
    // Active listings
    median_price: activePricing.median,
    avg_price: activePricing.avg,
    low_price: activePricing.low,
    high_price: activePricing.high,
    comp_count: activePricing.compCount,
    previous_median: existing?.median_price ?? null,
    // Sold listings
    sold_median: soldPricing?.median ?? null,
    sold_avg: soldPricing?.avg ?? null,
    sold_low: soldPricing?.low ?? null,
    sold_high: soldPricing?.high ?? null,
    sold_count: soldPricing?.compCount ?? 0,
    fair_market_value: fairMarketValue,
    last_updated: new Date().toISOString(),
    // Raw listing items for detail modal
    active_items: activeSales,
    sold_items: soldSalesRaw,
  });

  console.log(`[eBay] Storing ${activeSales.length} active items and ${soldSalesRaw.length} sold items for modal display`);

  if (upsertError) {
    console.error("[refreshSlabPrice] slab_prices upsert failed:", upsertError);
    throw new Error(`slab_prices upsert failed: ${upsertError.message}`);
  }
  console.log("[refreshSlabPrice] upserted", lookupKey, "active:", activePricing.median, "sold:", soldPricing?.median);

  // Update item market price with fair market value
  if (fairMarketValue != null) {
    await supabase
      .from("items")
      .update({ market: fairMarketValue })
      .eq("id", itemId)
      .eq("workspace_id", workspaceId);
  }

  revalidatePath("/protected/inventory");

  const now = new Date().toISOString();
  const refreshedPrice: RefreshedSlabPrice = {
    lookup_key: lookupKey,
    median_price: activePricing.median,
    avg_price: activePricing.avg,
    low_price: activePricing.low,
    high_price: activePricing.high,
    comp_count: activePricing.compCount,
    previous_median: existing?.median_price ?? null,
    sold_median: soldPricing?.median ?? null,
    sold_avg: soldPricing?.avg ?? null,
    sold_low: soldPricing?.low ?? null,
    sold_high: soldPricing?.high ?? null,
    sold_count: soldPricing?.compCount ?? 0,
    fair_market_value: fairMarketValue,
    last_updated: now,
    active_items: activeSales,
    sold_items: soldSalesRaw,
  };

  return {
    updated: true,
    median: soldPricing?.median ?? activePricing.median,
    compCount: soldPricing?.compCount ?? activePricing.compCount,
    lowConfidence: (soldPricing?.compCount ?? activePricing.compCount) < 3,
    refreshedPrice,
  };
}


export async function refreshItemPrices(
  items: { id: string; name: string; category: "single" | "slab" | "sealed"; setName?: string | null; cardNumber?: string | null }[]
) {
  if (items.length === 0) return;
  const { lookupCard } = await import("@/lib/pokemonPriceTracker");
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const BATCH = 5;
  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(
      items.slice(i, i + BATCH).map(async (item) => {
        const result = await lookupCard(item.name, item.category, { setName: item.setName, cardNumber: item.cardNumber });
        if (!result) return;
        const patch: Record<string, unknown> = {};
        if (result.imageUrl) patch.image_url = result.imageUrl;
        if (result.market != null) patch.market = result.market;
        if (Object.keys(patch).length === 0) return;
        if (result.market != null) {
          const { data: existing } = await supabase
            .from("items").select("acquired_market_price").eq("id", item.id).eq("workspace_id", workspaceId).single();
          if (existing?.acquired_market_price == null) {
            patch.acquired_market_price = result.market;
            patch.acquired_date = new Date().toISOString();
          }
        }
        await supabase.from("items").update(patch).eq("id", item.id).eq("workspace_id", workspaceId);
      })
    );
  }

  revalidatePath("/protected/inventory");
}

// ── Sealed pricing ──
// pokemonpricetracker.com first, eBay active listings as fallback.
export async function refreshSealedPrice(
  itemId: string,
  name: string,
  setName?: string | null
): Promise<{ updated: boolean; market: number | null; imageUrl: string | null }> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  // Primary: pokemonpricetracker.com
  const { lookupCard } = await import("@/lib/pokemonPriceTracker");
  const result = await lookupCard(name, "sealed", { setName });
  if (result && (result.market != null || result.imageUrl)) {
    const patch: Record<string, unknown> = {};
    if (result.imageUrl) patch.image_url = result.imageUrl;
    if (result.market != null) patch.market = result.market;
    if (Object.keys(patch).length > 0) {
      await supabase.from("items").update(patch).eq("id", itemId).eq("workspace_id", workspaceId);
      revalidatePath("/protected/inventory");
    }
    return { updated: true, market: result.market, imageUrl: result.imageUrl };
  }

  // Fallback: eBay active listings
  const { fetchSealedListings, calculateSealedPricing } = await import("@/lib/ebay");
  let listings;
  try {
    listings = await fetchSealedListings(name, setName);
  } catch {
    return { updated: false, market: null, imageUrl: null };
  }

  const pricing = calculateSealedPricing(listings);
  if (pricing.median == null) return { updated: false, market: null, imageUrl: null };

  await supabase
    .from("items")
    .update({ market: pricing.median })
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);

  revalidatePath("/protected/inventory");
  return { updated: true, market: pricing.median, imageUrl: null };
}
