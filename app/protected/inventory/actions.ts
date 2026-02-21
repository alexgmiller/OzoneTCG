"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

type ItemInput = {
  category: "single" | "slab" | "sealed";
  owner: "alex" | "mila" | "shared" | "consigner";
  status: "inventory" | "listed" | "sold" | "grading";
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
};

export async function createItem(input: ItemInput) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const { error } = await supabase.from("items").insert({
    workspace_id: workspaceId,
    ...input,
    name: input.name.trim(),
    condition: input.condition?.trim() || null,
    notes: input.notes?.trim() || null,
    updated_by: auth.user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
}

export async function updateItem(id: string, input: Partial<ItemInput>) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const { error } = await supabase
    .from("items")
    .update({
      ...input,
      name: input.name?.trim(),
      condition: input.condition?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_by: auth.user.id,
    })
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
  totalPrice: number
): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  // Fetch market prices for proportional calculation
  const { data: items, error: fetchErr } = await supabase
    .from("items")
    .select("id, market")
    .in("id", itemIds)
    .eq("workspace_id", workspaceId)
    .neq("status", "sold");

  if (fetchErr) throw new Error(fetchErr.message);
  if (!items?.length) return;

  const totalMarket = items.reduce(
    (sum, it) => sum + (typeof it.market === "number" ? it.market : 0),
    0
  );
  const saleId = crypto.randomUUID();
  const soldAt = new Date().toISOString();

  for (const item of items) {
    const m = typeof item.market === "number" ? item.market : 0;
    const proportion = totalMarket > 0 ? m / totalMarket : 1 / items.length;
    const soldPrice = parseFloat((totalPrice * proportion).toFixed(2));

    const { error } = await supabase
      .from("items")
      .update({
        status: "sold",
        sale_id: saleId,
        sold_price: soldPrice,
        sold_at: soldAt,
        updated_by: auth.user!.id,
      })
      .eq("id", item.id)
      .eq("workspace_id", workspaceId);

    if (error) throw new Error(error.message);
  }

  revalidatePath("/protected/inventory");
  revalidatePath("/protected/sold");
  revalidatePath("/protected/dashboard");
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
  }[];
  owner: string;
  consignerId: string | null;
  status: "inventory" | "listed";
}) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  for (const card of input.cards) {
    const { error } = await supabase.from("items").insert({
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
      updated_by: userId,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/protected/inventory");
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

export async function refreshItemPrices(
  items: { id: string; name: string; category: "single" | "slab" | "sealed"; setName?: string | null; cardNumber?: string | null }[]
) {
  if (items.length === 0) return;
  const { lookupCard } = await import("@/lib/pokemonPriceTracker");
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  for (const item of items) {
    const result = await lookupCard(item.name, item.category, { setName: item.setName, cardNumber: item.cardNumber });
    if (!result) continue;

    const patch: Record<string, unknown> = {};
    if (result.imageUrl) patch.image_url = result.imageUrl;
    if (result.market != null) patch.market = result.market;
    if (Object.keys(patch).length === 0) continue;

    await supabase
      .from("items")
      .update(patch)
      .eq("id", item.id)
      .eq("workspace_id", workspaceId);
  }

  revalidatePath("/protected/inventory");
}
