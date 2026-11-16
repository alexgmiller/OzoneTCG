"use server";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { revalidatePath } from "next/cache";
import { cashDrawer, type FinanceTx } from "@/app/protected/finance/math";

export type ShowSession = {
  id: string;
  workspace_id: string;
  name: string;
  date: string;
  starting_cash: number | null;
  ending_cash: number | null;
  actual_cash: number | null;
  total_spent: number;
  total_revenue: number;
  total_trade_value: number;
  cards_bought: number;
  cards_sold: number;
  trades_count: number;
  passes_count: number;
  net_pl: number;
  status: "scheduled" | "active" | "completed";
  started_at: string;
  ended_at: string | null;
  // Optional columns — older rows may not have them
  location?: string | null;
  hours?: string | null;
  notes?: string | null;
  venue_address?: string | null;
};

export type ActiveShowInfo = { id: string; name: string; expected_cash: number };

function revalidateShows() {
  revalidatePath("/protected/pos");
  revalidatePath("/protected/shows");
  revalidatePath("/protected/calendar");
  revalidatePath("/protected/dashboard");
}

// ── Start / end ───────────────────────────────────────────────────────────────

// Starts a scheduled show when scheduledId is given, otherwise creates one for today.
// date is the phone's local day (the server clock is UTC).
export async function startShow(input: {
  scheduledId?: string | null;
  name: string;
  starting_cash: number | null;
  date?: string;
}): Promise<string> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: active } = await supabase
    .from("show_sessions").select("id")
    .eq("workspace_id", workspaceId).eq("status", "active")
    .limit(1).maybeSingle();
  if (active) throw new Error("A show is already running — end it first");

  const fields = {
    status: "active",
    started_at: new Date().toISOString(),
    starting_cash: input.starting_cash,
    date: input.date ?? new Date().toISOString().slice(0, 10),
  };
  const { data, error } = input.scheduledId
    ? await supabase.from("show_sessions").update(fields)
        .eq("id", input.scheduledId).eq("workspace_id", workspaceId)
        .select("id").single()
    : await supabase.from("show_sessions").insert({
        ...fields,
        workspace_id: workspaceId,
        name: input.name.trim(),
      }).select("id").single();

  if (error) throw new Error(error.message);
  revalidateShows();
  return data.id as string;
}

export async function endShowSession(id: string, actualCash?: number | null): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: s, error: fetchErr } = await supabase
    .from("show_sessions").select("starting_cash,total_spent,total_revenue")
    .eq("id", id).eq("workspace_id", workspaceId).single();
  if (fetchErr || !s) throw new Error(fetchErr?.message ?? "Show not found");

  const { error } = await supabase
    .from("show_sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      ending_cash: (s.starting_cash ?? 0) - (s.total_spent ?? 0) + (s.total_revenue ?? 0),
      actual_cash: actualCash ?? null,
      net_pl: (s.total_revenue ?? 0) - (s.total_spent ?? 0),
    })
    .eq("id", id).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidateShows();
}

// Transactions and expenses are kept and detached from the show
export async function deleteShowSession(id: string): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  await Promise.all([
    supabase.from("expenses").update({ show_session_id: null })
      .eq("show_session_id", id).eq("workspace_id", workspaceId),
    supabase.from("card_transactions").update({ show_session_id: null })
      .eq("show_session_id", id).eq("workspace_id", workspaceId),
  ]);
  const { error } = await supabase
    .from("show_sessions").delete()
    .eq("id", id).eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  revalidateShows();
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function getActiveShow(): Promise<ActiveShowInfo | null> {
  try {
    const supabase = await createClient();
    const workspaceId = await getWorkspaceId();
    const { data } = await supabase
      .from("show_sessions")
      .select("id,name,starting_cash")
      .eq("workspace_id", workspaceId).eq("status", "active")
      .limit(1).maybeSingle();
    if (!data) return null;
    // Only cash-method deals move the drawer; Venmo/Zelle sales don't
    const { data: rows } = await supabase
      .from("card_transactions")
      .select("id,trade_group_id,transaction_type,date,sale_price,cost_basis,cash_paid,cash_difference,payment_method")
      .eq("workspace_id", workspaceId).eq("show_session_id", data.id).limit(1000);
    return {
      id: data.id as string,
      name: data.name as string,
      expected_cash: (data.starting_cash ?? 0) + cashDrawer((rows ?? []) as FinanceTx[]),
    };
  } catch {
    return null;
  }
}

// Today's scheduled show, offered as the default when starting from POS
export async function getScheduledShowToday(): Promise<{ id: string; name: string } | null> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data } = await supabase
    .from("show_sessions").select("id,name")
    .eq("workspace_id", workspaceId).eq("status", "scheduled")
    .eq("date", new Date().toISOString().slice(0, 10))
    .limit(1).maybeSingle();
  return (data as { id: string; name: string } | null) ?? null;
}
