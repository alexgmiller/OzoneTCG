"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export async function createItems(inputs: ItemInput[]) {
  if (inputs.length === 0) return;
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const { error } = await supabase.from("items").insert(
    inputs.map((input) => ({
      workspace_id: workspaceId,
      ...input,
      name: input.name.trim(),
      condition: input.condition?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_by: auth.user!.id,
    }))
  );

  if (error) throw new Error(error.message);
  revalidatePath("/protected/inventory");
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
  totalPrice: number
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
    const m = typeof item.market === "number" ? item.market : 0;
    const proportion = totalMarket > 0 ? m / totalMarket : 1 / items.length;
    const soldPrice = parseFloat((totalPrice * proportion).toFixed(2));

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
        await supabase.from("items").update(patch).eq("id", item.id).eq("workspace_id", workspaceId);
      })
    );
  }

  revalidatePath("/protected/inventory");
}
