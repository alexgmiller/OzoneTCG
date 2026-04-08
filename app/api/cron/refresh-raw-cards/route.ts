/**
 * Cron-based background raw card price refresh.
 * Runs daily — raw card prices don't move as fast as slab prices.
 * Authorization: Bearer $CRON_SECRET
 *
 * Processes all raw cards (singles + sealed) across all workspaces.
 * Uses JustTCG batch endpoint (20 cards/request) for cards with known IDs;
 * falls back to individual search for new cards.
 *
 * Stops early if rate limited or approaching 5-minute Vercel timeout.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchRawCard, batchLookupRawCards, makeRawCardPriceKey, priceForCondition } from "@/lib/justtcg";

const DAILY_STALENESS_MS = 24 * 60 * 60 * 1000;
const DELAY_MS = 1000; // 1s between individual search requests

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

  // ── Fetch all raw card items across all workspaces ─────────────────────
  const { data: items, error: itemsErr } = await admin
    .from("items")
    .select("id,name,condition,set_name,card_number,workspace_id")
    .in("category", ["single", "sealed"])
    .neq("status", "sold");

  if (itemsErr) {
    console.error("[cron/raw] items fetch error:", itemsErr.message);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  if (!items?.length) {
    return NextResponse.json({ processed: 0, skipped: 0, elapsed: 0 });
  }

  // Deduplicate by lookup key (multiple items can share same card)
  const seenKeys = new Map<string, typeof items[number]>();
  for (const item of items) {
    const key = makeRawCardPriceKey(item.name, item.set_name, item.card_number);
    if (!seenKeys.has(key)) seenKeys.set(key, item);
  }

  const uniqueKeys = [...seenKeys.keys()];
  console.log(`[cron/raw] ${items.length} raw items → ${uniqueKeys.length} unique cards`);

  // Fetch existing cached prices to find stale ones and get known cardIds
  const { data: priceRows } = await admin
    .from("raw_card_prices")
    .select("lookup_key,justtcg_card_id,last_updated")
    .in("lookup_key", uniqueKeys);

  const priceMap = new Map((priceRows ?? []).map((r) => [r.lookup_key, r]));

  const cutoff = Date.now() - DAILY_STALENESS_MS;
  const staleKeys = uniqueKeys.filter((k) => {
    const p = priceMap.get(k);
    return !p?.last_updated || new Date(p.last_updated).getTime() < cutoff;
  });

  console.log(`[cron/raw] ${staleKeys.length} stale cards to refresh`);

  if (staleKeys.length === 0) {
    return NextResponse.json({ processed: 0, skipped: 0, staleCount: 0, elapsed: 0 });
  }

  // ── Partition: batch (known IDs) vs individual search (new cards) ─────
  const batchItems: Array<{ key: string; cardId: string }> = [];
  const searchItems: Array<{ key: string; item: typeof items[number] }> = [];

  for (const key of staleKeys) {
    const existing = priceMap.get(key);
    if (existing?.justtcg_card_id) {
      batchItems.push({ key, cardId: existing.justtcg_card_id });
    } else {
      const item = seenKeys.get(key)!;
      searchItems.push({ key, item });
    }
  }

  const now = new Date().toISOString();
  let processed = 0;
  let skipped = 0;

  // ── Batch refresh for cards with known IDs ────────────────────────────
  if (batchItems.length > 0) {
    const cardIds = [...new Set(batchItems.map((b) => b.cardId))];
    console.log(`[cron/raw] batch lookup for ${cardIds.length} known card IDs`);

    let batchResults: Map<string, import("@/lib/justtcg").RawCardPrices>;
    try {
      batchResults = await batchLookupRawCards(cardIds);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[cron/raw] batch lookup error:", msg);
      batchResults = new Map();
    }

    for (const { key, cardId } of batchItems) {
      const prices = batchResults.get(cardId);
      if (!prices) { skipped++; continue; }

      await admin.from("raw_card_prices").upsert({
        lookup_key: key,
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

      // Update market on all items sharing this key
      const matchingItems = items.filter((i) =>
        makeRawCardPriceKey(i.name, i.set_name, i.card_number) === key
      );
      for (const item of matchingItems) {
        const marketPrice = priceForCondition(
          { nm: prices.nm, lp: prices.lp, mp: prices.mp, hp: prices.hp, dmg: prices.dmg },
          item.condition
        );
        if (marketPrice != null) {
          await admin
            .from("items")
            .update({ market: marketPrice })
            .eq("id", item.id)
            .eq("workspace_id", item.workspace_id);
        }
      }

      processed++;
    }
  }

  // ── Individual search for new cards ──────────────────────────────────
  for (const { key, item } of searchItems) {
    // Respect Vercel 5-min timeout
    if (Date.now() - started > 4 * 60 * 1000) {
      console.log("[cron/raw] approaching timeout — stopping");
      break;
    }

    let prices;
    try {
      prices = await searchRawCard(item.name, item.set_name, item.card_number);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "JUSTTCG_RATE_LIMITED") {
        console.warn("[cron/raw] rate limited — stopping");
        break;
      }
      console.error(`[cron/raw] search error for "${item.name}":`, msg);
      skipped++;
      continue;
    }

    if (!prices) { skipped++; continue; }

    await admin.from("raw_card_prices").upsert({
      lookup_key: key,
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

    const matchingItems = items.filter((i) =>
      makeRawCardPriceKey(i.name, i.set_name, i.card_number) === key
    );
    for (const mi of matchingItems) {
      const marketPrice = priceForCondition(
        { nm: prices.nm, lp: prices.lp, mp: prices.mp, hp: prices.hp, dmg: prices.dmg },
        mi.condition
      );
      if (marketPrice != null) {
        await admin
          .from("items")
          .update({ market: marketPrice })
          .eq("id", mi.id)
          .eq("workspace_id", mi.workspace_id);
      }
    }

    processed++;
    await sleep(DELAY_MS);
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(`[cron/raw] Done. processed=${processed} skipped=${skipped} elapsed=${elapsed}s`);

  return NextResponse.json({
    processed,
    skipped,
    elapsed,
    staleCount: staleKeys.length,
    batchCount: batchItems.length,
    searchCount: searchItems.length,
  });
}
