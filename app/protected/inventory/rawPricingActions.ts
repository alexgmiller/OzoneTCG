"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

// ── Raw card pricing (TCGPlayer via JustTCG) ──
export type RefreshedRawCardPrice = {
  lookup_key: string;
  justtcg_card_id: string | null;
  nm_price: number | null;
  lp_price: number | null;
  mp_price: number | null;
  hp_price: number | null;
  dmg_price: number | null;
  printing: string;
  price_source: string;
  last_updated: string;
  price_history: { date: string; price: number }[] | null;
};

// Writes to raw_card_prices and updates items.market with the condition-specific price.
export async function refreshRawCardPrice(
  itemId: string,
  name: string,
  condition: string | null,
  setName?: string | null,
  cardNumber?: string | null
): Promise<{ updated: boolean; refreshedPrice?: RefreshedRawCardPrice }> {
  const { searchRawCard, makeRawCardPriceKey, priceForCondition } = await import("@/lib/justtcg");

  const lookupKey = makeRawCardPriceKey(name, setName, cardNumber);
  const admin = createAdminClient();

  // Check cache first — skip if refreshed within 24h
  const { data: existing } = await admin
    .from("raw_card_prices")
    .select("last_updated,justtcg_card_id")
    .eq("lookup_key", lookupKey)
    .maybeSingle();

  if (existing?.last_updated) {
    const age = Date.now() - new Date(existing.last_updated).getTime();
    if (age < 24 * 60 * 60 * 1000) {
      console.log("[refreshRawCardPrice] cache hit, age:", Math.round(age / 60000), "min");
      return { updated: false };
    }
  }

  console.log("[refreshRawCardPrice] fetching JustTCG", { name, setName, cardNumber });

  let result;
  try {
    result = await searchRawCard(name, setName, cardNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "JUSTTCG_RATE_LIMITED") {
      console.warn("[refreshRawCardPrice] rate limited");
      throw new Error("JUSTTCG_RATE_LIMITED");
    }
    console.error("[refreshRawCardPrice] searchRawCard failed:", msg);
    return { updated: false };
  }

  if (!result) return { updated: false };

  const now = new Date().toISOString();
  const row: RefreshedRawCardPrice = {
    lookup_key: lookupKey,
    justtcg_card_id: result.justtcgCardId,
    nm_price: result.nm,
    lp_price: result.lp,
    mp_price: result.mp,
    hp_price: result.hp,
    dmg_price: result.dmg,
    printing: result.printing,
    price_source: "tcgplayer_via_justtcg",
    last_updated: now,
    price_history: result.priceHistory ?? null,
  };

  const { error: upsertErr } = await admin.from("raw_card_prices").upsert(row);
  if (upsertErr) {
    console.error("[refreshRawCardPrice] upsert failed:", upsertErr.message);
    throw new Error(`raw_card_prices upsert failed: ${upsertErr.message}`);
  }
  const histCount = row.price_history?.length ?? 0;
  if (histCount > 0) {
    console.log(`[JustTCG] Price history saved to raw_card_prices.price_history (${histCount} points)`);
  } else {
    console.log(`[JustTCG] Price history not saved — none returned from API`);
  }

  // Update items.market with the condition-specific price
  const marketPrice = priceForCondition(
    { nm: result.nm, lp: result.lp, mp: result.mp, hp: result.hp, dmg: result.dmg },
    condition
  );
  if (marketPrice != null) {
    const supabase = await createClient();
    const workspaceId = await getWorkspaceId();
    // Fetch current acquired_market_price to check if backfill is needed
    const { data: existing } = await supabase
      .from("items")
      .select("acquired_market_price")
      .eq("id", itemId)
      .eq("workspace_id", workspaceId)
      .single();
    const patch: Record<string, unknown> = { market: marketPrice };
    if (existing?.acquired_market_price == null) {
      patch.acquired_market_price = marketPrice;
      patch.acquired_date = new Date().toISOString();
    }
    await supabase.from("items").update(patch).eq("id", itemId).eq("workspace_id", workspaceId);
  }

  console.log("[refreshRawCardPrice] upserted", lookupKey, "nm:", result.nm, "lp:", result.lp);
  revalidatePath("/protected/inventory");
  return { updated: true, refreshedPrice: row };
}

// Batch refresh: JustTCG batch endpoint for known cardIds, individual search for new cards.
export async function refreshRawCardPrices(
  items: { id: string; name: string; condition: string | null; setName?: string | null; cardNumber?: string | null }[]
): Promise<void> {
  if (items.length === 0) return;

  const { searchRawCard, batchLookupRawCards, makeRawCardPriceKey, priceForCondition } = await import("@/lib/justtcg");
  const admin = createAdminClient();
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const now = new Date().toISOString();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  // Build lookup keys, fetch existing cached prices
  const keyedItems = items.map((it) => ({
    ...it,
    lookupKey: makeRawCardPriceKey(it.name, it.setName, it.cardNumber),
  }));

  const allKeys = [...new Set(keyedItems.map((i) => i.lookupKey))];
  const { data: existingRows } = await admin
    .from("raw_card_prices")
    .select("lookup_key,justtcg_card_id,last_updated")
    .in("lookup_key", allKeys);

  const existingMap = new Map((existingRows ?? []).map((r) => [r.lookup_key, r]));

  // Partition: cards with known IDs that aren't stale go into batch lookup;
  // new or stale-without-ID cards go through individual search
  const needsBatch: Array<{ lookupKey: string; cardId: string }> = [];
  const needsSearch: typeof keyedItems = [];

  for (const item of keyedItems) {
    const existing = existingMap.get(item.lookupKey);
    const isStale = !existing?.last_updated || new Date(existing.last_updated).getTime() < cutoff;
    if (!isStale) continue; // still fresh — skip

    if (existing?.justtcg_card_id) {
      needsBatch.push({ lookupKey: item.lookupKey, cardId: existing.justtcg_card_id });
    } else {
      needsSearch.push(item);
    }
  }

  console.log(`[refreshRawCardPrices] batch=${needsBatch.length} search=${needsSearch.length}`);

  // ── Batch lookup for known card IDs ──────────────────────────────────────
  if (needsBatch.length > 0) {
    const cardIds = [...new Set(needsBatch.map((b) => b.cardId))];
    let batchResults: Map<string, import("@/lib/justtcg").RawCardPrices>;
    try {
      batchResults = await batchLookupRawCards(cardIds);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[refreshRawCardPrices] batch lookup error:", msg);
      batchResults = new Map();
    }

    for (const { lookupKey, cardId } of needsBatch) {
      const prices = batchResults.get(cardId);
      if (!prices) continue;

      await admin.from("raw_card_prices").upsert({
        lookup_key: lookupKey,
        justtcg_card_id: prices.justtcgCardId,
        nm_price: prices.nm,
        lp_price: prices.lp,
        mp_price: prices.mp,
        hp_price: prices.hp,
        dmg_price: prices.dmg,
        printing: prices.printing,
        price_source: "tcgplayer_via_justtcg",
        last_updated: now,
        price_history: prices.priceHistory ?? null,
      });

      // Update market price on all items sharing this lookup key
      const matchingItems = keyedItems.filter((i) => i.lookupKey === lookupKey);
      for (const item of matchingItems) {
        const marketPrice = priceForCondition(
          { nm: prices.nm, lp: prices.lp, mp: prices.mp, hp: prices.hp, dmg: prices.dmg },
          item.condition
        );
        if (marketPrice != null) {
          const { data: existing } = await supabase
            .from("items").select("acquired_market_price").eq("id", item.id).eq("workspace_id", workspaceId).single();
          const patch: Record<string, unknown> = { market: marketPrice };
          if (existing?.acquired_market_price == null) { patch.acquired_market_price = marketPrice; patch.acquired_date = now; }
          await supabase.from("items").update(patch).eq("id", item.id).eq("workspace_id", workspaceId);
        }
      }
    }
  }

  // ── Individual search for new cards ──────────────────────────────────────
  for (const item of needsSearch) {
    let prices;
    try {
      prices = await searchRawCard(item.name, item.setName, item.cardNumber);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "JUSTTCG_RATE_LIMITED") {
        console.warn("[refreshRawCardPrices] rate limited — stopping");
        break;
      }
      console.error("[refreshRawCardPrices] search error for", item.name, ":", msg);
      continue;
    }
    if (!prices) continue;

    await admin.from("raw_card_prices").upsert({
      lookup_key: item.lookupKey,
      justtcg_card_id: prices.justtcgCardId,
      nm_price: prices.nm,
      lp_price: prices.lp,
      mp_price: prices.mp,
      hp_price: prices.hp,
      dmg_price: prices.dmg,
      printing: prices.printing,
      price_source: "tcgplayer_via_justtcg",
      last_updated: now,
      price_history: prices.priceHistory ?? null,
    });

    const marketPrice = priceForCondition(
      { nm: prices.nm, lp: prices.lp, mp: prices.mp, hp: prices.hp, dmg: prices.dmg },
      item.condition
    );
    if (marketPrice != null) {
      const { data: existing } = await supabase
        .from("items").select("acquired_market_price").eq("id", item.id).eq("workspace_id", workspaceId).single();
      const patch: Record<string, unknown> = { market: marketPrice };
      if (existing?.acquired_market_price == null) { patch.acquired_market_price = marketPrice; patch.acquired_date = now; }
      await supabase.from("items").update(patch).eq("id", item.id).eq("workspace_id", workspaceId);
    }
  }

  revalidatePath("/protected/inventory");
}
