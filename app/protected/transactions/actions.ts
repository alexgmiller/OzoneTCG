"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";

type PaidBy = "alex" | "mila" | "shared";

// ── Active show helpers ───────────────────────────────────────────────────────

async function getActiveShowId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("show_sessions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

async function bumpShowStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  delta: { total_spent?: number; total_revenue?: number; cards_bought?: number; cards_sold?: number }
) {
  const { data: curr } = await supabase
    .from("show_sessions")
    .select("total_spent,total_revenue,cards_bought,cards_sold")
    .eq("id", sessionId)
    .single();
  if (!curr) return;
  const newSpent = (curr.total_spent ?? 0) + (delta.total_spent ?? 0);
  const newRevenue = (curr.total_revenue ?? 0) + (delta.total_revenue ?? 0);
  await supabase
    .from("show_sessions")
    .update({
      total_spent: newSpent,
      total_revenue: newRevenue,
      cards_bought: (curr.cards_bought ?? 0) + (delta.cards_bought ?? 0),
      cards_sold: (curr.cards_sold ?? 0) + (delta.cards_sold ?? 0),
      net_pl: newRevenue - newSpent,
    })
    .eq("id", sessionId);
}

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
  category?: "single" | "slab" | "sealed";
  grade?: string | null;
  set_name?: string | null;
  card_number?: string | null;
};

export async function recordQuickBuy(input: {
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

  const desc = `Buy: ${input.cards.length} card${input.cards.length !== 1 ? "s" : ""}`;
  const showId = await getActiveShowId(supabase, workspaceId);

  const { data: expenseRow, error: expErr } = await supabase
    .from("expenses")
    .insert({
      workspace_id: workspaceId,
      description: desc,
      cost: parseFloat(input.totalCost.toFixed(2)),
      paid_by: input.paidBy,
      payment_type: input.paymentType,
      show_session_id: showId ?? undefined,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (expErr) throw new Error(expErr.message);

  if (input.addToInventory) {
    const totalMarket = input.cards.reduce((s, c) => s + c.market, 0);
    for (const card of input.cards) {
      const proportion = totalMarket > 0 ? card.market / totalMarket : 1 / input.cards.length;
      const cost = parseFloat((input.totalCost * proportion).toFixed(2));
      const { error } = await supabase.from("items").insert({
        workspace_id: workspaceId,
        name: card.name,
        category: card.category ?? "single",
        owner: "shared",
        status: "inventory",
        condition: card.condition,
        grade: card.grade ?? null,
        set_name: card.set_name ?? null,
        card_number: card.card_number ?? null,
        market: card.market,
        cost,
        acquisition_type: "buy",
        buy_expense_id: expenseRow?.id ?? null,
        updated_by: userId,
      });
      if (error) throw new Error(error.message);
    }
  }

  if (showId) {
    await bumpShowStats(supabase, showId, {
      total_spent: input.totalCost,
      cards_bought: input.cards.length,
    });
  }

  revalidatePath("/protected/transactions");
  revalidatePath("/protected/expenses");
  revalidatePath("/protected/inventory");
  if (showId) revalidatePath("/protected/show");
}

export async function deleteBuyExpense({ expenseId }: { expenseId: string }): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  // Delete items that were created by this expense (if still in inventory)
  await supabase
    .from("items")
    .delete()
    .eq("buy_expense_id", expenseId)
    .eq("workspace_id", workspaceId)
    .eq("status", "inventory");

  // Delete the expense itself
  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/protected/transactions");
  revalidatePath("/protected/expenses");
  revalidatePath("/protected/inventory");
  revalidatePath("/protected/dashboard");
}

export async function revertTrade({ tradeGroupId }: { tradeGroupId: string }): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  // Fetch all card_transactions for this trade group
  const { data: txs, error: txErr } = await supabase
    .from("card_transactions")
    .select("id, card_id, transaction_type")
    .eq("trade_group_id", tradeGroupId)
    .eq("workspace_id", workspaceId);

  if (txErr) throw new Error(txErr.message);
  if (!txs?.length) throw new Error("Trade not found");

  const tradeOutIds = txs.filter((t) => t.transaction_type === "trade_out").map((t) => t.card_id).filter(Boolean) as string[];
  const tradeInIds  = txs.filter((t) => t.transaction_type === "trade_in").map((t) => t.card_id).filter(Boolean) as string[];

  // Restore items that went out (set back to inventory)
  if (tradeOutIds.length) {
    const { error } = await supabase
      .from("items")
      .update({ status: "inventory", sale_id: null, sold_price: null, sold_at: null, updated_by: auth.user.id })
      .in("id", tradeOutIds)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
  }

  // Delete items that came in (only if still in inventory, not further sold/traded)
  if (tradeInIds.length) {
    await supabase
      .from("items")
      .delete()
      .in("id", tradeInIds)
      .eq("workspace_id", workspaceId)
      .eq("status", "inventory");
  }

  // Delete the card_transactions
  await supabase
    .from("card_transactions")
    .delete()
    .eq("trade_group_id", tradeGroupId)
    .eq("workspace_id", workspaceId);

  // Delete any trade-cash expense created for this trade (matched by trade_group description)
  await supabase
    .from("expenses")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("payment_type", "trade_cash")
    .like("description", "Trade cash:%");

  revalidatePath("/protected/transactions");
  revalidatePath("/protected/inventory");
  revalidatePath("/protected/expenses");
  revalidatePath("/protected/dashboard");
}

export async function recordQuickSell(input: {
  itemIds: string[];
  totalPrice: number;
  notes?: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const { data: items, error: fetchErr } = await supabase
    .from("items")
    .select("id, market")
    .in("id", input.itemIds)
    .eq("workspace_id", workspaceId)
    .neq("status", "sold");

  if (fetchErr) throw new Error(fetchErr.message);
  if (!items?.length) throw new Error("No sellable items found");

  const totalMarket = items.reduce((s, it) => s + (typeof it.market === "number" ? it.market : 0), 0);
  const saleId = crypto.randomUUID();
  const soldAt = new Date().toISOString();

  for (const item of items) {
    const m = typeof item.market === "number" ? item.market : 0;
    const proportion = totalMarket > 0 ? m / totalMarket : 1 / items.length;
    const soldPrice = parseFloat((input.totalPrice * proportion).toFixed(2));
    const { error } = await supabase
      .from("items")
      .update({ status: "sold", sale_id: saleId, sold_price: soldPrice, sold_at: soldAt, updated_by: auth.user!.id })
      .eq("id", item.id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
  }

  const showId = await getActiveShowId(supabase, workspaceId);
  if (showId) {
    await bumpShowStats(supabase, showId, {
      total_revenue: input.totalPrice,
      cards_sold: items.length,
    });
  }

  revalidatePath("/protected/transactions");
  revalidatePath("/protected/inventory");
  revalidatePath("/protected/dashboard");
  if (showId) revalidatePath("/protected/show");
}

// ── Cert-based buy: records expense + adds slab to inventory ─────────────────

export type CertBuyItem = {
  certNumber: string;
  company: "PSA" | "BGS" | "CGC" | "TAG";
  grade: string;
  gradeLabel?: string | null;
  name: string;
  setName?: string | null;
  cardNumber?: string | null;
  market: number | null;
  cost: number;
  owner: "alex" | "mila" | "shared";
};

export async function recordCertBuy(input: {
  cards: CertBuyItem[];
  totalCost: number;
  paidBy: PaidBy;
  paymentType: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");
  const userId = auth.user.id;

  const showId = await getActiveShowId(supabase, workspaceId);

  const { data: expenseRow, error: expErr } = await supabase
    .from("expenses")
    .insert({
      workspace_id: workspaceId,
      description: `Cert buy: ${input.cards.length} slab${input.cards.length !== 1 ? "s" : ""}`,
      cost: parseFloat(input.totalCost.toFixed(2)),
      paid_by: input.paidBy,
      payment_type: input.paymentType,
      show_session_id: showId ?? undefined,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (expErr) throw new Error(expErr.message);

  // Add each card to inventory
  for (const card of input.cards) {
    const { error } = await supabase.from("items").insert({
      workspace_id: workspaceId,
      name: card.name,
      category: "slab",
      owner: card.owner,
      status: "inventory",
      condition: "Near Mint",
      grade: card.gradeLabel ? `${card.company} ${card.gradeLabel} ${card.grade}` : `${card.company} ${card.grade}`,
      set_name: card.setName ?? null,
      card_number: card.cardNumber ?? null,
      cert_number: card.certNumber,
      market: card.market,
      cost: parseFloat(card.cost.toFixed(2)),
      buy_percentage: card.market ? parseFloat(((card.cost / card.market) * 100).toFixed(1)) : null,
      acquisition_type: "buy",
      buy_expense_id: expenseRow?.id ?? null,
      updated_by: userId,
    });
    if (error) throw new Error(error.message);
  }

  if (showId) {
    await bumpShowStats(supabase, showId, {
      total_spent: input.totalCost,
      cards_bought: input.cards.length,
    });
  }

  revalidatePath("/protected/transactions");
  revalidatePath("/protected/inventory");
  revalidatePath("/protected/dashboard");
  if (showId) revalidatePath("/protected/show");
}
