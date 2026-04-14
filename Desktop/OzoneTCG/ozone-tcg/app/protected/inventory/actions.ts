"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

type ItemInput = {
  category: "single" | "slab" | "sealed";
  owner: "alex" | "mila" | "shared" | "consigner";
  status: "inventory" | "sold" | "grading";
  name: string;
  condition: "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
  cost?: number | null;
  market?: number | null;
  sell_price?: number | null;
  current_sale?: number | null;
  sold_price?: number | null;
  previous_sales?: number | null;
  notes?: string | null;
  consigner_id?: string | null;
  image_url?: string | null;
  set_name?: string | null;
  card_number?: string | null;
  grade?: string | null;
  // Trade chain tracking
  cost_basis?: number | null;
  buy_percentage?: number | null;
  acquisition_type?: string | null;
  chain_depth?: number;
  original_cash_invested?: number | null;
  // Grading cert
  cert_number?: string | null;
  sticker_price?: number | null;
  acquired_market_price?: number | null;
  acquired_date?: string | null;
  // Sealed product metadata
  product_type?: string | null;
  quantity?: number | null;
  language?: string | null;
};

export type CardTransaction = {
  id: string;
  card_id: string | null;
  transaction_type: string;
  trade_group_id: string | null;
  date: string;
  market_price_at_time: number | null;
  cost_basis: number | null;
  chain_depth: number;
  buy_percentage: number | null;
  cash_paid: number | null;
  trade_percentage: number | null;
  trade_credit_value: number | null;
  cash_difference: number | null;
  previous_card_id: string | null;
  notes: string | null;
  created_at: string;
};

export async function createItem(input: ItemInput) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const now = new Date().toISOString();
  const { error } = await supabase.from("items").insert({
    workspace_id: workspaceId,
    ...input,
    name: input.name.trim(),
    condition: input.condition?.trim() || null,
    notes: input.notes?.trim() || null,
    updated_by: auth.user.id,
    acquired_market_price: input.acquired_market_price !== undefined ? input.acquired_market_price : (input.market ?? null),
    acquired_date: input.acquired_date !== undefined ? input.acquired_date : (input.market != null ? now : null),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
}

export async function createItems(inputs: ItemInput[]) {
  if (inputs.length === 0) return;
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const now = new Date().toISOString();
  const { error } = await supabase.from("items").insert(
    inputs.map((input) => ({
      workspace_id: workspaceId,
      ...input,
      name: input.name.trim(),
      condition: input.condition?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_by: auth.user!.id,
      acquired_market_price: input.acquired_market_price !== undefined ? input.acquired_market_price : (input.market ?? null),
      acquired_date: input.acquired_date !== undefined ? input.acquired_date : (input.market != null ? now : null),
    }))
  );

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
}

export async function uploadCardImage(formData: FormData): Promise<string> {
  // Verify user is logged in
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const admin = createAdminClient();
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");

  const cardId = formData.get("cardId") as string | null;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const filename = cardId ? `${cardId}.${ext}` : `custom-${Date.now()}.${ext}`;

  const { error } = await admin.storage
    .from("card-images")
    .upload(filename, file, { upsert: true, contentType: file.type });

  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("card-images").getPublicUrl(filename);

  // Update pokemon_cards so this image shows in future searches
  if (cardId) {
    await admin.from("pokemon_cards").update({ image_url: data.publicUrl }).eq("id", cardId);
  } else {
    // Fallback: update by name + card number when no cardId (manually typed)
    const name = formData.get("name") as string | null;
    const cardNumber = formData.get("cardNumber") as string | null;
    if (name && cardNumber) {
      await admin.from("pokemon_cards")
        .update({ image_url: data.publicUrl })
        .eq("name", name.trim())
        .eq("card_number", cardNumber.trim());
    } else if (name) {
      await admin.from("pokemon_cards")
        .update({ image_url: data.publicUrl })
        .eq("name", name.trim());
    }
  }

  return data.publicUrl;
}

/**
 * Upload a custom card image from the inventory tile placeholder.
 * - Saves the file to Supabase Storage (card-images bucket)
 * - Upserts card_image_cache so future Sync/Scan hits the manual image
 * - Updates this specific item's image_url immediately
 */
export async function uploadItemImage(
  formData: FormData,
  itemId: string,
  name: string,
  setName: string | null,
  cardNumber: string | null
): Promise<string> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const admin = createAdminClient();
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const num = (cardNumber ?? "").split("/")[0].trim();
  const filename = `manual-${slug}-${num || Date.now()}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from("card-images")
    .upload(filename, file, { upsert: true, contentType: file.type });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = admin.storage.from("card-images").getPublicUrl(filename);
  const imageUrl = urlData.publicUrl;

  // Write to card_image_cache so future lookups (Sync/Scan) skip the APIs
  const { makeLookupKey } = await import("@/lib/cardCache");
  const lookupKey = makeLookupKey(name, setName, cardNumber);
  await admin.from("card_image_cache").upsert({
    lookup_key: lookupKey,
    name,
    set_name: setName ?? null,
    card_number: cardNumber ?? null,
    image_url: imageUrl,
    source: "manual",
    cached_at: new Date().toISOString(),
  });

  // Also persist to pokemon_cards for the manual-images fallback layer
  await admin.from("pokemon_cards").upsert({
    id: `manual-${slug}-${num || "0"}`,
    name,
    card_number: num || null,
    image_url: imageUrl,
  }, { onConflict: "id" });

  // Update this item directly
  const workspaceId = await getWorkspaceId();
  await supabase
    .from("items")
    .update({ image_url: imageUrl, updated_by: auth.user.id })
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);

  revalidatePath("/protected/inventory");
  return imageUrl;
}

export async function updateItem(id: string, input: Partial<ItemInput>) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const patch: Record<string, unknown> = { ...input, updated_by: auth.user.id };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.condition !== undefined) patch.condition = input.condition.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { error } = await supabase
    .from("items")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
}

export async function deleteItem(id: string) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase
    .from("items")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
}

export async function deleteItems(itemIds: string[]) {
  if (itemIds.length === 0) return;
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase
    .from("items")
    .delete()
    .in("id", itemIds)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
}

export async function markItemsAsSold(
  itemIds: string[],
  totalPrice: number,
  perCardPrices?: Record<string, number>
): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  // Fetch market prices + consigner_id for proportional calculation
  const { data: items, error: fetchErr } = await supabase
    .from("items")
    .select("id, market, consigner_id")
    .in("id", itemIds)
    .eq("workspace_id", workspaceId)
    .neq("status", "sold");

  if (fetchErr) throw new Error(fetchErr.message);
  if (!items?.length) return;

  // Fetch consigner rates for any consigner items in this sale
  const consignerIds = [...new Set(
    items.filter((it) => it.consigner_id).map((it) => it.consigner_id!)
  )];
  const consignerRateMap = new Map<string, number>();
  if (consignerIds.length > 0) {
    const { data: consigners } = await supabase
      .from("consigners")
      .select("id, rate")
      .in("id", consignerIds)
      .eq("workspace_id", workspaceId);
    for (const c of consigners ?? []) consignerRateMap.set(c.id, c.rate);
  }

  const totalMarket = items.reduce(
    (sum, it) => sum + (typeof it.market === "number" ? it.market : 0),
    0
  );
  const saleId = crypto.randomUUID();
  const soldAt = new Date().toISOString();

  for (const item of items) {
    // Use explicit per-card price if provided; otherwise fall back to proportional split
    const soldPrice = perCardPrices?.[item.id] != null
      ? perCardPrices[item.id]
      : (() => {
          const m = typeof item.market === "number" ? item.market : 0;
          const proportion = totalMarket > 0 ? m / totalMarket : 1 / items.length;
          return parseFloat((totalPrice * proportion).toFixed(2));
        })();

    const rate = item.consigner_id ? consignerRateMap.get(item.consigner_id) : undefined;
    const consignerPayout = rate != null ? parseFloat((soldPrice * rate).toFixed(2)) : null;

    const { error } = await supabase
      .from("items")
      .update({
        status: "sold",
        sale_id: saleId,
        sold_price: soldPrice,
        sold_at: soldAt,
        updated_by: auth.user!.id,
        ...(consignerPayout != null ? { consigner_payout: consignerPayout } : {}),
      })
      .eq("id", item.id)
      .eq("workspace_id", workspaceId);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/protected/inventory");
  revalidatePath("/protected/sold");
  revalidatePath("/protected/dashboard");
  revalidatePath("/protected/consigners");
}

export async function importItems(input: {
  cards: {
    name: string;
    condition: "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
    cost: number | null;
    market: number | null;
    category: "single" | "slab" | "sealed";
    set_name?: string | null;
    card_number?: string | null;
    grade?: string | null;
  }[];
  owner: string;
  consignerId: string | null;
  status: "inventory";
}): Promise<{ id: string; name: string; category: string; set_name: string | null; card_number: string | null }[]> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  if (input.cards.length === 0) return [];

  const { data: inserted, error } = await supabase
    .from("items")
    .insert(
      input.cards.map((card) => ({
        workspace_id: workspaceId,
        name: card.name,
        category: card.category,
        owner: input.owner,
        status: input.status,
        condition: card.condition,
        cost: card.cost,
        market: card.market,
        consigner_id: input.consignerId,
        set_name: card.set_name ?? null,
        card_number: card.card_number ?? null,
        grade: card.grade ?? null,
        updated_by: userId,
      }))
    )
    .select("id, name, category, set_name, card_number");

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
  return (inserted ?? []) as { id: string; name: string; category: string; set_name: string | null; card_number: string | null }[];
}

export async function massUpdateItems(
  itemIds: string[],
  patch: {
    owner?: string;
    consigner_id?: string | null;
    status?: string;
    category?: string;
  }
) {
  if (itemIds.length === 0) return;
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  const { error } = await supabase
    .from("items")
    .update({ ...patch, updated_by: userId })
    .in("id", itemIds)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
}

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

export async function fetchCardData(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<{ imageUrl: string | null; market: number | null } | null> {
  const { lookupCard } = await import("@/lib/pokemonPriceTracker");
  return lookupCard(name, "single", { setName, cardNumber });
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

/**
 * Refresh TCGPlayer pricing for a single raw card via JustTCG.
 * Writes to raw_card_prices table and updates items.market with the
 * condition-specific price for this item.
 */
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

/**
 * Batch-refresh TCGPlayer pricing for multiple raw cards.
 * Uses JustTCG batch endpoint for cards with known cardIds; falls back to
 * individual search for new cards. Groups into batches of 20.
 */
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

/**
 * Refresh market price for a sealed product.
 * Tries pokemonpricetracker.com first; falls back to eBay active listings.
 * Stores result to items.market and items.image_url.
 */
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

// ── Trade chain actions ────────────────────────────────────────────────────────

/**
 * Record a buy: creates the item, a card_transaction, and an expense entry.
 */
export async function recordBuy(input: {
  name: string;
  setName: string | null;
  cardNumber: string | null;
  grade: string | null;
  category: "single" | "slab" | "sealed";
  condition: "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
  owner: "alex" | "mila" | "shared";
  cashPaid: number;
  marketPrice: number | null;
  buyPct: number | null;
  paidBy: "alex" | "mila" | "shared";
  notes?: string | null;
  imageUrl?: string | null;
}): Promise<{ itemId: string }> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  // 1. Create the inventory item
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .insert({
      workspace_id: workspaceId,
      name: input.name.trim(),
      set_name: input.setName ?? null,
      card_number: input.cardNumber ?? null,
      grade: input.grade ?? null,
      category: input.category,
      condition: input.condition,
      owner: input.owner,
      status: "inventory",
      cost: input.cashPaid,
      market: input.marketPrice ?? null,
      notes: input.notes?.trim() || null,
      image_url: input.imageUrl || null,
      cost_basis: input.cashPaid,
      buy_percentage: input.buyPct,
      acquisition_type: "buy",
      chain_depth: 0,
      original_cash_invested: input.cashPaid,
      updated_by: auth.user.id,
      acquired_market_price: input.marketPrice ?? null,
      acquired_date: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (itemErr || !item) throw new Error(itemErr?.message ?? "Failed to create item");

  // 2. Record the transaction
  await supabase.from("card_transactions").insert({
    workspace_id: workspaceId,
    card_id: item.id,
    transaction_type: "buy",
    market_price_at_time: input.marketPrice ?? null,
    cost_basis: input.cashPaid,
    chain_depth: 0,
    buy_percentage: input.buyPct,
    cash_paid: input.cashPaid,
    notes: input.notes?.trim() || null,
  });

  // 3. Create expense entry for the cash spent
  const desc = `Buy: ${input.name.trim()}${input.setName ? ` (${input.setName})` : ""}`;
  await supabase.from("expenses").insert({
    workspace_id: workspaceId,
    description: desc,
    cost: input.cashPaid,
    paid_by: input.paidBy,
    payment_type: "card_buy",
    updated_by: auth.user.id,
  });

  revalidatePath("/protected/inventory");
  revalidatePath("/protected/expenses");
  return { itemId: item.id };
}

/**
 * Record a trade: marks outgoing items as sold, creates incoming items with
 * calculated cost basis, records all card_transactions, and optionally logs
 * an expense if the vendor paid cash.
 */
export async function recordTrade(input: {
  goingOut: { itemId: string; tradeValue: number }[];
  comingIn: {
    name: string;
    setName: string | null;
    cardNumber: string | null;
    grade: string | null;
    category: "single" | "slab" | "sealed";
    condition: "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
    owner: "alex" | "mila" | "shared";
    marketPrice: number;
    tradePct: number;
  }[];
  cashDifference: number; // positive = vendor paid cash out, negative = vendor received cash
  paidBy: "alex" | "mila" | "shared";
  notes?: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  if (input.goingOut.length === 0 || input.comingIn.length === 0) {
    throw new Error("A trade requires at least one card going out and one coming in");
  }

  // 1. Fetch outgoing items to get their cost basis
  const outgoingIds = input.goingOut.map((g) => g.itemId);
  const { data: outItems, error: fetchErr } = await supabase
    .from("items")
    .select("id, name, cost_basis, cost, chain_depth, original_cash_invested")
    .in("id", outgoingIds)
    .eq("workspace_id", workspaceId);

  if (fetchErr) throw new Error(fetchErr.message);
  if (!outItems?.length) throw new Error("Could not find outgoing items");

  const outMap = new Map(outItems.map((it) => [it.id, it]));

  // 2. Calculate cost basis transfer
  const totalOutBasis = outItems.reduce((sum, it) => sum + (it.cost_basis ?? it.cost ?? 0), 0);
  const totalOutOrigCash = outItems.reduce((sum, it) => sum + (it.original_cash_invested ?? it.cost_basis ?? it.cost ?? 0), 0);
  const maxChainDepth = outItems.reduce((max, it) => Math.max(max, it.chain_depth ?? 0), 0);

  const tradeCreditTotal = input.comingIn.reduce((sum, c) => sum + (c.marketPrice * c.tradePct) / 100, 0);
  const newTotalBasis = totalOutBasis + input.cashDifference;
  // Original cash: only increases when vendor pays MORE cash out
  const newOrigCash = totalOutOrigCash + Math.max(0, input.cashDifference);

  // 3. Build incoming card rows with pro-rata basis split
  const tradeGroupId = crypto.randomUUID();
  const soldAt = new Date().toISOString();
  const incomingCardIds: string[] = [];

  for (const card of input.comingIn) {
    const cardCredit = (card.marketPrice * card.tradePct) / 100;
    const share = tradeCreditTotal > 0 ? cardCredit / tradeCreditTotal : 1 / input.comingIn.length;
    const cardBasis = parseFloat((newTotalBasis * share).toFixed(2));
    const cardOrigCash = parseFloat((newOrigCash * share).toFixed(2));
    const outgoingNames = outItems.map((it) => it.name).join(", ");
    const tradeNote = `Traded for: ${outgoingNames}${input.notes ? ` — ${input.notes}` : ""}`;

    const { data: newItem, error: insertErr } = await supabase
      .from("items")
      .insert({
        workspace_id: workspaceId,
        name: card.name.trim(),
        set_name: card.setName ?? null,
        card_number: card.cardNumber ?? null,
        grade: card.grade ?? null,
        category: card.category,
        condition: card.condition,
        owner: card.owner,
        status: "inventory",
        cost: cardBasis,
        market: card.marketPrice,
        notes: tradeNote,
        cost_basis: cardBasis,
        acquisition_type: "trade",
        chain_depth: maxChainDepth + 1,
        original_cash_invested: cardOrigCash,
        updated_by: auth.user!.id,
      })
      .select("id")
      .single();

    if (insertErr || !newItem) throw new Error(insertErr?.message ?? "Failed to create incoming item");
    incomingCardIds.push(newItem.id);

    // Record trade_in transaction
    await supabase.from("card_transactions").insert({
      workspace_id: workspaceId,
      card_id: newItem.id,
      transaction_type: "trade_in",
      trade_group_id: tradeGroupId,
      market_price_at_time: card.marketPrice,
      cost_basis: cardBasis,
      chain_depth: maxChainDepth + 1,
      trade_percentage: card.tradePct,
      trade_credit_value: cardCredit,
      cash_difference: input.cashDifference,
      previous_card_id: outgoingIds.length === 1 ? outgoingIds[0] : null,
      notes: input.notes?.trim() || null,
    });
  }

  // 4. Mark outgoing items as traded (status=sold, sale_id=tradeGroupId)
  const outgoingNames = input.comingIn.map((c) => c.name).join(", ");
  for (const { itemId, tradeValue } of input.goingOut) {
    const outItem = outMap.get(itemId);
    if (!outItem) continue;
    const tradeNote = `Traded for: ${outgoingNames}${input.notes ? ` — ${input.notes}` : ""}`;

    await supabase
      .from("items")
      .update({
        status: "sold",
        sale_id: tradeGroupId,
        sold_price: tradeValue,
        sold_at: soldAt,
        notes: tradeNote,
        updated_by: auth.user!.id,
      })
      .eq("id", itemId)
      .eq("workspace_id", workspaceId);

    // Record trade_out transaction
    await supabase.from("card_transactions").insert({
      workspace_id: workspaceId,
      card_id: itemId,
      transaction_type: "trade_out",
      trade_group_id: tradeGroupId,
      market_price_at_time: tradeValue,
      cost_basis: outItem.cost_basis ?? outItem.cost ?? null,
      chain_depth: outItem.chain_depth ?? 0,
      cash_difference: input.cashDifference,
      notes: input.notes?.trim() || null,
    });
  }

  // 5. If vendor paid cash, create an expense record
  if (input.cashDifference > 0) {
    const inNames = input.comingIn.map((c) => c.name).join(", ");
    await supabase.from("expenses").insert({
      workspace_id: workspaceId,
      description: `Trade cash: ${inNames}`,
      cost: input.cashDifference,
      paid_by: input.paidBy,
      payment_type: "trade_cash",
      updated_by: auth.user!.id,
    });
  }

  revalidatePath("/protected/inventory");
  revalidatePath("/protected/sold");
  revalidatePath("/protected/expenses");
  revalidatePath("/protected/dashboard");
}

/**
 * Fetch the full transaction history for a card, following the chain back
 * through previous_card_id links.
 */
export async function getItemTransactions(cardId: string): Promise<CardTransaction[]> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("card_transactions")
    .select("id,card_id,transaction_type,trade_group_id,date,market_price_at_time,cost_basis,chain_depth,buy_percentage,cash_paid,trade_percentage,trade_credit_value,cash_difference,previous_card_id,notes,created_at")
    .eq("workspace_id", workspaceId)
    .or(`card_id.eq.${cardId},previous_card_id.eq.${cardId}`)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CardTransaction[];
}
