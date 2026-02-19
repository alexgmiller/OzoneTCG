"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { revalidatePath } from "next/cache";

export async function settlePeriod(notes?: string) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  // Get last settled period end
  const { data: lastRow } = await supabase
    .from("pay_periods")
    .select("period_end")
    .eq("workspace_id", workspaceId)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastEnd: string | null = lastRow?.period_end ?? null;

  // Build queries
  let expQuery = supabase
    .from("expenses")
    .select("cost,paid_by,created_at")
    .eq("workspace_id", workspaceId)
    .in("paid_by", ["alex", "mila"]);

  let itemCostQuery = supabase
    .from("items")
    .select("cost,owner,created_at")
    .eq("workspace_id", workspaceId)
    .in("owner", ["alex", "mila"])
    .not("cost", "is", null)
    .neq("status", "sold") // only unsold inventory; sold items are accounted for via shared sales
    .neq("solo_confirmed", true); // exclude items marked as personal (no buy-in)

  let salesQuery = supabase
    .from("items")
    .select("sold_price,sold_at")
    .eq("workspace_id", workspaceId)
    .eq("owner", "shared")
    .eq("status", "sold")
    .not("sold_price", "is", null);

  if (lastEnd) {
    expQuery = expQuery.gt("created_at", lastEnd);
    itemCostQuery = itemCostQuery.gt("created_at", lastEnd);
    salesQuery = salesQuery.gt("sold_at", lastEnd);
  }

  const [{ data: expData }, { data: itemData }, { data: salesData }] =
    await Promise.all([expQuery, itemCostQuery, salesQuery]);

  const expenses = expData ?? [];
  const items = itemData ?? [];
  const sales = salesData ?? [];

  const alexPaid =
    expenses.filter((e) => e.paid_by === "alex").reduce((s, e) => s + (e.cost ?? 0), 0) +
    items.filter((i) => i.owner === "alex").reduce((s, i) => s + (i.cost ?? 0), 0);

  const milaPaid =
    expenses.filter((e) => e.paid_by === "mila").reduce((s, e) => s + (e.cost ?? 0), 0) +
    items.filter((i) => i.owner === "mila").reduce((s, i) => s + (i.cost ?? 0), 0);

  const sharedSales = sales.reduce((s, i) => s + (i.sold_price ?? 0), 0);

  // net > 0 = Alex pays Mila; net < 0 = Mila pays Alex
  const netPayout = (0.5 * sharedSales + 0.5 * milaPaid) - 0.5 * alexPaid;

  // Determine period_start: earliest date in this set, or lastEnd, or now
  const allDates = [
    ...expenses.map((e) => e.created_at),
    ...items.map((i) => i.created_at),
    ...sales.map((s) => s.sold_at).filter(Boolean),
  ]
    .filter(Boolean)
    .sort() as string[];

  const periodStart = allDates[0] ?? lastEnd ?? new Date().toISOString();
  const periodEnd = new Date().toISOString();

  const { error } = await supabase.from("pay_periods").insert({
    workspace_id: workspaceId,
    period_start: periodStart,
    period_end: periodEnd,
    alex_paid: alexPaid,
    mila_paid: milaPaid,
    shared_sales: sharedSales,
    net_payout: netPayout,
    notes: notes ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/protected/payout");
}

export async function keepItemSolo(itemId: string) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { error } = await supabase
    .from("items")
    .update({ solo_confirmed: true })
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);

  if (error) throw new Error(error.message);

  revalidatePath("/protected/payout");
}

export async function makeItemShared(itemId: string) {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  // Fetch the item's current owner and cost before changing anything
  const { data: item, error: fetchError } = await supabase
    .from("items")
    .select("name,owner,cost,status")
    .eq("id", itemId)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !item) throw new Error(fetchError?.message ?? "Item not found");

  const originalOwner = item.owner as "alex" | "mila";

  // Move to shared
  const { error: updateError } = await supabase
    .from("items")
    .update({ owner: "shared" })
    .eq("id", itemId)
    .eq("workspace_id", workspaceId);

  if (updateError) throw new Error(updateError.message);

  // The item is sold, so its cost was filtered out of item-cost tracking.
  // Record it as an expense so the original owner gets credit for their investment
  // and the other person owes 50% of that cost in the payout.
  if (item.cost && item.cost > 0) {
    const { error: expError } = await supabase.from("expenses").insert({
      workspace_id: workspaceId,
      paid_by: originalOwner,
      description: `${item.name} — cost basis (moved to shared)`,
      cost: item.cost,
      updated_by: userId,
    });
    if (expError) throw new Error(expError.message);
  }

  revalidatePath("/protected/payout");
}
