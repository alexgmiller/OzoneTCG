"use server";

/**
 * Show Mode Server Actions
 *
 * REQUIRED MIGRATIONS — run in Supabase SQL editor before using Show Mode:
 *
 *   CREATE TABLE IF NOT EXISTS show_sessions (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     workspace_id uuid,
 *     name text NOT NULL,
 *     date date NOT NULL,
 *     starting_cash numeric,
 *     ending_cash numeric,
 *     actual_cash numeric,
 *     total_spent numeric DEFAULT 0,
 *     total_revenue numeric DEFAULT 0,
 *     total_trade_value numeric DEFAULT 0,
 *     cards_bought integer DEFAULT 0,
 *     cards_sold integer DEFAULT 0,
 *     trades_count integer DEFAULT 0,
 *     passes_count integer DEFAULT 0,
 *     net_pl numeric DEFAULT 0,
 *     status text DEFAULT 'active',
 *     started_at timestamptz DEFAULT now(),
 *     ended_at timestamptz
 *   );
 *
 *   CREATE TABLE IF NOT EXISTS show_scans (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     show_session_id uuid REFERENCES show_sessions(id) ON DELETE CASCADE,
 *     card_name text,
 *     grade text,
 *     market_price numeric,
 *     action text NOT NULL, -- 'bought','passed','sold','trade','expense'
 *     buy_percentage numeric,
 *     notes text,
 *     scanned_at timestamptz DEFAULT now()
 *   );
 *
 *   ALTER TABLE expenses ADD COLUMN IF NOT EXISTS show_session_id uuid REFERENCES show_sessions(id);
 *
 *   -- Added in polish pass (undo support):
 *   ALTER TABLE show_scans ADD COLUMN IF NOT EXISTS item_id uuid;
 */

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { revalidatePath } from "next/cache";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  status: "active" | "completed";
  started_at: string;
  ended_at: string | null;
};

export type ShowScanEntry = {
  id: string;
  show_session_id: string;
  card_name: string | null;
  grade: string | null;
  market_price: number | null;
  action: "bought" | "passed" | "sold" | "trade" | "expense";
  buy_percentage: number | null;
  notes: string | null;
  scanned_at: string;
};

export type InventorySearchResult = {
  id: string;
  name: string;
  category: string;
  condition: string;
  grade: string | null;
  market: number | null;
  cost: number | null;
  sticker_price: number | null;
  image_url: string | null;
  set_name: string | null;
  card_number: string | null;
};

// ── Session management ────────────────────────────────────────────────────────

export async function createShowSession(data: {
  name: string;
  date: string;
  starting_cash: number | null;
}): Promise<string> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: row, error } = await supabase
    .from("show_sessions")
    .insert({
      workspace_id: workspaceId,
      name: data.name.trim(),
      date: data.date,
      starting_cash: data.starting_cash,
      status: "active",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/protected/show");
  revalidatePath("/protected/shows");
  revalidatePath("/protected/dashboard");
  return row.id as string;
}

export async function getShowSession(id: string): Promise<ShowSession | null> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("show_sessions")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ShowSession | null;
}

export async function loadShowFeed(sessionId: string): Promise<ShowScanEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("show_scans")
    .select("*")
    .eq("show_session_id", sessionId)
    .order("scanned_at", { ascending: false })
    .limit(60);

  if (error) throw new Error(error.message);
  return (data ?? []) as ShowScanEntry[];
}

export async function endShowSession(
  id: string,
  actualCash?: number | null
): Promise<ShowSession> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data: session, error: fetchErr } = await supabase
    .from("show_sessions")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchErr || !session) throw new Error(fetchErr?.message ?? "Session not found");

  const endingCash =
    (session.starting_cash ?? 0) -
    (session.total_spent ?? 0) +
    (session.total_revenue ?? 0);

  const { data: updated, error: updateErr } = await supabase
    .from("show_sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      ending_cash: endingCash,
      actual_cash: actualCash ?? null,
      net_pl: (session.total_revenue ?? 0) - (session.total_spent ?? 0),
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();

  if (updateErr) throw new Error(updateErr.message);

  revalidatePath("/protected/show");
  revalidatePath("/protected/shows");
  revalidatePath("/protected/dashboard");

  return updated as ShowSession;
}

export async function getShowHistory(limit = 20): Promise<ShowSession[]> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("show_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as ShowSession[];
}

// ── Session stats helper ──────────────────────────────────────────────────────

async function bumpSessionStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  delta: {
    total_spent?: number;
    total_revenue?: number;
    total_trade_value?: number;
    cards_bought?: number;
    cards_sold?: number;
    trades_count?: number;
    passes_count?: number;
  }
) {
  const { data: curr } = await supabase
    .from("show_sessions")
    .select(
      "total_spent,total_revenue,total_trade_value,cards_bought,cards_sold,trades_count,passes_count"
    )
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
      total_trade_value:
        (curr.total_trade_value ?? 0) + (delta.total_trade_value ?? 0),
      cards_bought: (curr.cards_bought ?? 0) + (delta.cards_bought ?? 0),
      cards_sold: (curr.cards_sold ?? 0) + (delta.cards_sold ?? 0),
      trades_count: (curr.trades_count ?? 0) + (delta.trades_count ?? 0),
      passes_count: (curr.passes_count ?? 0) + (delta.passes_count ?? 0),
      net_pl: newRevenue - newSpent,
    })
    .eq("id", sessionId);
}

// ── Show transactions ─────────────────────────────────────────────────────────

export async function recordShowBuy(input: {
  show_session_id: string;
  name: string;
  category: "single" | "slab" | "sealed";
  owner: "alex" | "mila" | "shared";
  condition: string;
  grade: string | null;
  cost: number;
  market: number | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  buy_percentage: number;
  notes: string | null;
}): Promise<{ scanId: string }> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const now = new Date().toISOString();

  // 1. Create inventory item
  const { data: item, error: itemErr } = await supabase.from("items").insert({
    workspace_id: workspaceId,
    name: input.name.trim(),
    category: input.category,
    owner: input.owner,
    status: "inventory",
    condition: input.condition,
    grade: input.grade,
    cost: input.cost,
    market: input.market,
    set_name: input.set_name,
    card_number: input.card_number,
    image_url: input.image_url,
    buy_percentage: input.buy_percentage,
    acquired_market_price: input.market,
    acquired_date: now,
    updated_by: auth.user.id,
    notes: input.notes,
  }).select("id").single();
  if (itemErr) throw new Error(itemErr.message);

  // 2. Record in show_scans (activity feed)
  const { data: scan, error: scanErr } = await supabase.from("show_scans").insert({
    show_session_id: input.show_session_id,
    card_name: input.name,
    grade: input.grade,
    market_price: input.market,
    action: "bought",
    buy_percentage: input.buy_percentage,
    item_id: item.id,
    notes: null,
    scanned_at: now,
  }).select("id").single();
  if (scanErr) throw new Error(scanErr.message);

  // 3. Update session stats
  await bumpSessionStats(supabase, input.show_session_id, {
    total_spent: input.cost,
    cards_bought: 1,
  });

  revalidatePath("/protected/inventory");
  return { scanId: scan.id };
}

export async function recordShowPass(input: {
  show_session_id: string;
  card_name: string;
  grade: string | null;
  market_price: number | null;
}): Promise<{ scanId: string }> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: scan, error: scanErr } = await supabase.from("show_scans").insert({
    show_session_id: input.show_session_id,
    card_name: input.card_name,
    grade: input.grade,
    market_price: input.market_price,
    action: "passed",
    scanned_at: now,
  }).select("id").single();
  if (scanErr) throw new Error(scanErr.message);

  await bumpSessionStats(supabase, input.show_session_id, { passes_count: 1 });
  return { scanId: scan.id };
}

export async function recordShowSell(input: {
  show_session_id: string;
  item_id: string;
  item_name: string;
  sell_price: number;
}): Promise<{ scanId: string }> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const now = new Date().toISOString();
  const saleId = crypto.randomUUID();

  // 1. Mark item as sold
  const { error: sellErr } = await supabase
    .from("items")
    .update({
      status: "sold",
      sale_id: saleId,
      sold_price: input.sell_price,
      sold_at: now,
      updated_by: auth.user.id,
    })
    .eq("id", input.item_id)
    .eq("workspace_id", workspaceId)
    .neq("status", "sold");

  if (sellErr) throw new Error(sellErr.message);

  // 2. Record in show_scans
  const { data: scan, error: scanErr } = await supabase.from("show_scans").insert({
    show_session_id: input.show_session_id,
    card_name: input.item_name,
    market_price: input.sell_price,
    action: "sold",
    item_id: input.item_id,
    scanned_at: now,
  }).select("id").single();
  if (scanErr) throw new Error(scanErr.message);

  // 3. Update session stats
  await bumpSessionStats(supabase, input.show_session_id, {
    total_revenue: input.sell_price,
    cards_sold: 1,
  });

  revalidatePath("/protected/inventory");
  revalidatePath("/protected/sold");
  revalidatePath("/protected/dashboard");
  return { scanId: scan.id };
}

export async function recordShowTrade(input: {
  show_session_id: string;
  // Cards leaving our inventory
  goingOut: { itemId: string; tradeValue: number; name: string; cost: number | null }[];
  // Cards arriving into inventory
  comingIn: { name: string; grade: string | null; marketPrice: number }[];
  // Positive = we received cash; negative = we paid cash
  cashDifference: number;
  notes: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");
  const now = new Date().toISOString();

  // 1. Mark going-out items as sold (traded out)
  if (input.goingOut.length > 0) {
    const ids = input.goingOut.map((g) => g.itemId);
    const { error: outErr } = await supabase
      .from("items")
      .update({ status: "sold", sold_at: now, updated_by: auth.user.id })
      .in("id", ids)
      .eq("workspace_id", workspaceId);
    if (outErr) throw new Error(outErr.message);
  }

  // 2. Add coming-in items to inventory with proportional cost basis
  const gaveTotal = input.goingOut.reduce((s, g) => s + g.tradeValue, 0);
  const gotTotal = input.comingIn.reduce((s, c) => s + c.marketPrice, 0);
  const totalOutCost = input.goingOut.reduce((s, g) => s + (g.cost ?? 0), 0);
  const cashOut = Math.max(0, -input.cashDifference);
  const cashIn = Math.max(0, input.cashDifference);
  const newTotalBasis = parseFloat((totalOutCost + cashOut - cashIn).toFixed(2));

  for (const c of input.comingIn) {
    const share = gotTotal > 0 ? c.marketPrice / gotTotal : 1 / input.comingIn.length;
    const basis = parseFloat((newTotalBasis * share).toFixed(2));
    const { error: inErr } = await supabase.from("items").insert({
      workspace_id: workspaceId,
      name: c.name.trim(),
      category: c.grade ? "slab" : "single",
      owner: "shared",
      status: "inventory",
      condition: "Near Mint",
      grade: c.grade || null,
      cost: basis,
      market: c.marketPrice,
      acquisition_type: "trade",
      acquired_market_price: c.marketPrice,
      acquired_date: now,
      updated_by: auth.user.id,
    });
    if (inErr) throw new Error(inErr.message);
  }

  // 3. Record in show_scans
  const gaveNames = input.goingOut.map((g) => g.name).join(", ") || "—";
  const gotNames = input.comingIn.map((c) => c.name).join(", ") || "—";
  const description = `${gaveNames} → ${gotNames}`;
  const cashNote =
    input.cashDifference !== 0
      ? ` · Cash ${input.cashDifference > 0 ? "received" : "paid"}: $${Math.abs(input.cashDifference).toFixed(2)}`
      : "";

  await supabase.from("show_scans").insert({
    show_session_id: input.show_session_id,
    card_name: description,
    market_price: gaveTotal + gotTotal,
    action: "trade",
    notes: ((input.notes ?? "") + cashNote) || null,
    scanned_at: now,
  });

  // 4. Update session stats
  await bumpSessionStats(supabase, input.show_session_id, {
    trades_count: 1,
    total_trade_value: gaveTotal + gotTotal,
    total_revenue: cashIn,
    total_spent: cashOut,
  });

  revalidatePath("/protected/inventory");
}

export async function addShowExpense(input: {
  show_session_id: string;
  description: string;
  cost: number;
  category: string;
  paid_by: "alex" | "mila";
}): Promise<{ scanId: string }> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const desc = `[Show] ${input.category}: ${input.description}`;

  // 1. Add to expenses table
  const { data: expense, error: expErr } = await supabase.from("expenses").insert({
    workspace_id: workspaceId,
    paid_by: input.paid_by,
    description: desc,
    cost: input.cost,
    updated_by: auth.user?.id ?? null,
    show_session_id: input.show_session_id,
  }).select("id").single();
  if (expErr) throw new Error(expErr.message);

  // 2. Record in show_scans (item_id = expense row id for undo)
  const { data: scan, error: scanErr } = await supabase.from("show_scans").insert({
    show_session_id: input.show_session_id,
    card_name: desc,
    market_price: input.cost,
    action: "expense",
    item_id: expense.id,
    scanned_at: now,
  }).select("id").single();
  if (scanErr) throw new Error(scanErr.message);

  // 3. Update session stats (expenses count toward cash out)
  await bumpSessionStats(supabase, input.show_session_id, {
    total_spent: input.cost,
  });

  revalidatePath("/protected/expenses");
  return { scanId: scan.id };
}

// ── Inventory search / load ───────────────────────────────────────────────────

/** Load all active inventory items for client-side filtering (trade tab). */
export async function loadInventoryItems(): Promise<InventorySearchResult[]> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("items")
    .select(
      "id,name,category,condition,grade,market,cost,sticker_price,image_url,set_name,card_number"
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "inventory")
    .order("name")
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []) as InventorySearchResult[];
}

export async function searchInventoryItems(
  query: string
): Promise<InventorySearchResult[]> {
  if (!query.trim()) return [];
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("items")
    .select(
      "id,name,category,condition,grade,market,cost,sticker_price,image_url,set_name,card_number"
    )
    .eq("workspace_id", workspaceId)
    .neq("status", "sold")
    .neq("status", "grading")
    .ilike("name", `%${query.trim()}%`)
    .order("name")
    .limit(20);

  if (error) throw new Error(error.message);
  return (data ?? []) as InventorySearchResult[];
}

// ── Undo last show entry ──────────────────────────────────────────────────────

export async function undoShowEntry(scanId: string): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not logged in");

  const { data: scan, error: fetchErr } = await supabase
    .from("show_scans")
    .select("*")
    .eq("id", scanId)
    .single();
  if (fetchErr || !scan) throw new Error("Entry not found");

  const sessionId = scan.show_session_id as string;
  const itemId = scan.item_id as string | null;

  switch (scan.action as string) {
    case "bought":
      if (itemId) {
        await supabase.from("items").delete().eq("id", itemId).eq("workspace_id", workspaceId);
        const cost =
          scan.market_price != null && scan.buy_percentage != null
            ? (scan.market_price as number) * (scan.buy_percentage as number) / 100
            : (scan.market_price as number) ?? 0;
        await bumpSessionStats(supabase, sessionId, { total_spent: -cost, cards_bought: -1 });
      }
      break;
    case "sold":
      if (itemId) {
        await supabase
          .from("items")
          .update({ status: "inventory", sold_at: null, sold_price: null, sale_id: null, updated_by: auth.user.id })
          .eq("id", itemId)
          .eq("workspace_id", workspaceId);
        await bumpSessionStats(supabase, sessionId, {
          total_revenue: -((scan.market_price as number) ?? 0),
          cards_sold: -1,
        });
      }
      break;
    case "passed":
      await bumpSessionStats(supabase, sessionId, { passes_count: -1 });
      break;
    case "expense":
      if (itemId) {
        await supabase.from("expenses").delete().eq("id", itemId);
        await bumpSessionStats(supabase, sessionId, { total_spent: -((scan.market_price as number) ?? 0) });
      }
      break;
    // "trade" excluded — too complex to reverse automatically
  }

  await supabase.from("show_scans").delete().eq("id", scanId);

  revalidatePath("/protected/inventory");
  revalidatePath("/protected/show");
  revalidatePath("/protected/expenses");
}

// ── Active show helper (used by nav/layout) ───────────────────────────────────

export type ActiveShowInfo = {
  id: string;
  name: string;
  expected_cash: number;
};

export async function getActiveShow(): Promise<ActiveShowInfo | null> {
  try {
    const supabase = await createClient();
    const workspaceId = await getWorkspaceId();

    const { data } = await supabase
      .from("show_sessions")
      .select("id,name,starting_cash,total_revenue,total_spent")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!data) return null;

    const expectedCash =
      (data.starting_cash ?? 0) +
      (data.total_revenue ?? 0) -
      (data.total_spent ?? 0);

    return { id: data.id as string, name: data.name as string, expected_cash: expectedCash };
  } catch {
    return null;
  }
}
