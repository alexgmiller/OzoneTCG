"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

type Condition = "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played" | "Damaged";
type PaidBy = "alex" | "mila" | "shared";

export type CustomerCard = {
  id: string;
  name: string;
  condition: Condition;
  market: number;
};

export async function finalizeBuy(input: {
  sellerName: string;
  cards: CustomerCard[];
  totalCost: number;
  paidBy: PaidBy;
  paymentType: string | null;
  addToInventory: boolean;
}) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

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

  // Optionally add cards to inventory, cost split proportionally by market value
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

  revalidatePath("/protected/expenses");
  revalidatePath("/protected/inventory");
}

export async function finalizeTrade(input: {
  customerCards: CustomerCard[];
  myItemIds: string[];
  tradePct: number;
  cashBalance: number; // positive = customer owes us, negative = we owe customer
  paidBy: PaidBy;
  addToInventory: boolean;
}) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  // Mark my traded items as sold at their trade value
  if (input.myItemIds.length > 0) {
    const { data: myItems } = await supabase
      .from("items")
      .select("id,market")
      .in("id", input.myItemIds)
      .eq("workspace_id", workspaceId);

    const saleId = crypto.randomUUID();
    const soldAt = new Date().toISOString();

    for (const item of myItems ?? []) {
      const tradeValue = parseFloat((item.market ?? 0).toFixed(2));
      const { error } = await supabase
        .from("items")
        .update({
          status: "sold",
          sale_id: saleId,
          sold_price: tradeValue,
          sold_at: soldAt,
          updated_by: userId,
        })
        .eq("id", item.id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
    }
  }

  // Add customer's cards to our inventory
  if (input.addToInventory) {
    for (const card of input.customerCards) {
      const cost = parseFloat((card.market * (input.tradePct / 100)).toFixed(2));
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

  // If we owe the customer cash, record as expense
  if (input.cashBalance < -0.005) {
    const { error } = await supabase.from("expenses").insert({
      workspace_id: workspaceId,
      description: `Trade: cash paid to customer`,
      cost: parseFloat(Math.abs(input.cashBalance).toFixed(2)),
      paid_by: input.paidBy,
      payment_type: "cash",
      updated_by: userId,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/protected/inventory");
  revalidatePath("/protected/sold");
  revalidatePath("/protected/expenses");
}
