"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

// Reverts all items in a sale group back to inventory status.
// Pass saleId to revert all items in the group, or itemIds to revert specific items.
export async function revertSale(params: { saleId: string } | { itemIds: string[] }) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  let query = supabase
    .from("items")
    .update({
      status: "inventory",
      sale_id: null,
      sold_price: null,
      sold_at: null,
      consigner_payout: null,
      updated_by: auth.user.id,
    })
    .eq("workspace_id", workspaceId)
    .eq("status", "sold");

  if ("saleId" in params) {
    query = query.eq("sale_id", params.saleId);
  } else {
    query = query.in("id", params.itemIds);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);

  revalidatePath("/protected/sold");
  revalidatePath("/protected/inventory");
  revalidatePath("/protected/dashboard");
  revalidatePath("/protected/consigners");
}
