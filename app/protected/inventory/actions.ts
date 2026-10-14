"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { recordSell } from "@/app/protected/pos/actions";

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

  let resolvedImageUrl = input.image_url ?? null;
  if (!resolvedImageUrl && input.category !== "sealed") {
    const { findManualCacheEntry } = await import("@/lib/cardCache");
    resolvedImageUrl = await findManualCacheEntry(input.name, input.card_number, input.set_name);
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("items").insert({
    workspace_id: workspaceId,
    ...input,
    name: input.name.trim(),
    image_url: resolvedImageUrl,
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

  const { findManualCacheEntry } = await import("@/lib/cardCache");

  const now = new Date().toISOString();
  const rows = await Promise.all(
    inputs.map(async (input) => {
      let resolvedImageUrl = input.image_url ?? null;
      if (!resolvedImageUrl && input.category !== "sealed") {
        resolvedImageUrl = await findManualCacheEntry(input.name, input.card_number, input.set_name);
      }
      return {
        workspace_id: workspaceId,
        ...input,
        name: input.name.trim(),
        image_url: resolvedImageUrl,
        condition: input.condition?.trim() || null,
        notes: input.notes?.trim() || null,
        updated_by: auth.user!.id,
        acquired_market_price: input.acquired_market_price !== undefined ? input.acquired_market_price : (input.market ?? null),
        acquired_date: input.acquired_date !== undefined ? input.acquired_date : (input.market != null ? now : null),
      };
    })
  );

  const { error } = await supabase.from("items").insert(rows);

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

// Bulk sell from Inventory; recorded as a POS sell so it appears in the ledger
export async function markItemsAsSold(
  itemIds: string[],
  totalPrice: number,
  perCardPrices?: Record<string, number>
): Promise<void> {
  await recordSell({
    itemIds, total: totalPrice, prices: perCardPrices,
    show_session_id: null, payment_method: null,
  });
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

export async function fetchCardData(
  name: string,
  setName?: string | null,
  cardNumber?: string | null
): Promise<{ imageUrl: string | null; market: number | null } | null> {
  const { lookupCard } = await import("@/lib/pokemonPriceTracker");
  return lookupCard(name, "single", { setName, cardNumber });
}

// ── Trade chain history ──
// Follows the chain back through previous_card_id links.
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
