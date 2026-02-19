"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

type ItemInput = {
  category: "single" | "slab" | "sealed";
  owner: "alex" | "mila" | "shared";
  status: "inventory" | "listed" | "sold";
  name: string;
  condition: "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
  cost?: number | null;
  market?: number | null;
  sell_price?: number | null;
  current_sale?: number | null;
  sold_price?: number | null;
  previous_sales?: number | null;
  notes?: string | null;
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
