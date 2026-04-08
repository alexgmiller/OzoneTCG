"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

type PaidBy = "alex" | "mila" | "shared";

export async function revertSale({ saleId }: { saleId: string }) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const { error } = await supabase
    .from("items")
    .update({
      status: "inventory",
      sold_price: null,
      sale_id: null,
      sold_at: null,
      updated_by: auth.user.id,
    })
    .or(`sale_id.eq.${saleId},id.eq.${saleId}`)
    .eq("workspace_id", workspaceId)
    .eq("status", "sold");

  if (error) throw new Error(error.message);
  revalidatePath("/protected/transactions");
  revalidatePath("/protected/inventory");
}

export type QuickBuyCard = {
  name: string;
  condition: "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
  market: number;
};

export async function recordQuickBuy(input: {
  sellerName: string;
  cards: QuickBuyCard[];
  totalCost: number;
  paidBy: PaidBy;
  paymentType: string | null;
  addToInventory: boolean;
}) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");
  const userId = auth.user.id;

  // Record as expense
  const { error: expErr } = await supabase.from("expenses").insert({
    workspace_id: workspaceId,
    description: `Buy: ${input.sellerName} — ${input.cards.length} card${input.cards.length !== 1 ? "s" : ""}`,
    cost: parseFloat(input.totalCost.toFixed(2)),
    paid_by: input.paidBy,
    payment_type: input.paymentType,
    updated_by: userId,
  });
  if (expErr) throw new Error(expErr.message);

  if (input.addToInventory) {
    const totalMarket = input.cards.reduce((s, c) => s + c.market, 0);
    for (const card of input.cards) {
      const proportion = totalMarket > 0 ? card.market / totalMarket : 1 / input.cards.length;
      const cost = parseFloat((input.totalCost * proportion).toFixed(2));
      const { error } = await supabase.from("items").insert({
        workspace_id: workspaceId,
        name: card.name,
        category: "single",
        owner: "shared",
        status: "inventory",
        condition: card.condition,
        market: card.market,
        cost,
        updated_by: userId,
      });
      if (error) throw new Error(error.message);
    }
  }

  revalidatePath("/protected/transactions");
  revalidatePath("/protected/expenses");
  revalidatePath("/protected/inventory");
}
