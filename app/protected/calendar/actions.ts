"use server";

/**
 * Calendar server actions
 *
 * MIGRATION — run in Supabase SQL editor to support scheduled shows:
 *   ALTER TABLE show_sessions
 *     DROP CONSTRAINT IF EXISTS show_sessions_status_check;
 *   ALTER TABLE show_sessions
 *     ADD CONSTRAINT show_sessions_status_check
 *     CHECK (status IN ('scheduled', 'active', 'completed'));
 */

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { revalidatePath } from "next/cache";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DayActivity = {
  date: string; // YYYY-MM-DD
  buyCount: number;
  sellCount: number;
  tradeCount: number;
  expenseCount: number;
  shows: { id: string; name: string; status: string }[];
  cashIn: number;
  cashOut: number;
  netPL: number;
};

export type BuyEntry = {
  id: string;
  name: string;
  grade: string | null;
  condition: string;
  cost: number | null;
  market: number | null;
  owner: string;
  image_url: string | null;
  acquired_date: string | null;
  category: string;
};

export type SellEntry = {
  id: string;
  name: string;
  grade: string | null;
  condition: string;
  cost: number | null;
  sold_price: number | null;
  market: number | null;
  owner: string;
  image_url: string | null;
  sold_at: string | null;
  category: string;
  margin: number | null;
};

export type TradeEntry = {
  id: string;
  card_name: string | null;
  notes: string | null;
  scanned_at: string;
  deal_photo_url: string | null;
  show_session_id: string;
};

export type ExpenseEntry = {
  id: string;
  description: string;
  cost: number;
  paid_by: string;
  created_at: string;
  show_session_id: string | null;
};

export type ShowEntry = {
  id: string;
  name: string;
  date: string;
  status: string;
  net_pl: number;
  total_spent: number;
  total_revenue: number;
  cards_bought: number;
  cards_sold: number;
  trades_count: number;
  started_at: string | null;
  ended_at: string | null;
};

export type DayDetail = {
  date: string;
  buys: BuyEntry[];
  sells: SellEntry[];
  trades: TradeEntry[];
  expenses: ExpenseEntry[];
  shows: ShowEntry[];
};

// ── Month data ────────────────────────────────────────────────────────────────

export async function getCalendarMonthData(
  year: number,
  month: number
): Promise<DayActivity[]> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const rangeEnd = monthEnd + "T23:59:59";

  const [buysRes, sellsRes, expensesRes, showsRes, tradesRes] = await Promise.all([
    supabase
      .from("items")
      .select("acquired_date, cost")
      .eq("workspace_id", workspaceId)
      .not("acquired_date", "is", null)
      .gte("acquired_date", monthStart)
      .lte("acquired_date", rangeEnd),

    supabase
      .from("items")
      .select("sold_at, sold_price, cost")
      .eq("workspace_id", workspaceId)
      .eq("status", "sold")
      .not("sold_at", "is", null)
      .gte("sold_at", monthStart)
      .lte("sold_at", rangeEnd),

    supabase
      .from("expenses")
      .select("created_at, cost")
      .eq("workspace_id", workspaceId)
      .gte("created_at", monthStart)
      .lte("created_at", rangeEnd),

    supabase
      .from("show_sessions")
      .select("id, name, date, status")
      .eq("workspace_id", workspaceId)
      .gte("date", monthStart)
      .lte("date", monthEnd),

    // Trades via show_scans — filter through workspace session IDs
    supabase
      .from("show_scans")
      .select("scanned_at, show_sessions!inner(workspace_id)")
      .eq("action", "trade")
      .eq("show_sessions.workspace_id", workspaceId)
      .gte("scanned_at", monthStart)
      .lte("scanned_at", rangeEnd),
  ]);

  const dayMap = new Map<string, DayActivity>();

  function getDay(d: string): DayActivity {
    if (!dayMap.has(d)) {
      dayMap.set(d, {
        date: d,
        buyCount: 0, sellCount: 0, tradeCount: 0, expenseCount: 0,
        shows: [],
        cashIn: 0, cashOut: 0, netPL: 0,
      });
    }
    return dayMap.get(d)!;
  }

  for (const b of buysRes.data ?? []) {
    const d = b.acquired_date?.slice(0, 10);
    if (!d) continue;
    const day = getDay(d);
    day.buyCount++;
    day.cashOut += b.cost ?? 0;
  }

  for (const s of sellsRes.data ?? []) {
    const d = s.sold_at?.slice(0, 10);
    if (!d) continue;
    const day = getDay(d);
    day.sellCount++;
    day.cashIn += s.sold_price ?? 0;
  }

  for (const e of expensesRes.data ?? []) {
    const d = e.created_at?.slice(0, 10);
    if (!d) continue;
    const day = getDay(d);
    day.expenseCount++;
    day.cashOut += e.cost ?? 0;
  }

  for (const show of showsRes.data ?? []) {
    const d = show.date;
    if (!d) continue;
    getDay(d).shows.push({ id: show.id, name: show.name, status: show.status });
  }

  for (const t of tradesRes.data ?? []) {
    const d = (t as { scanned_at: string }).scanned_at?.slice(0, 10);
    if (!d) continue;
    getDay(d).tradeCount++;
  }

  for (const day of dayMap.values()) {
    day.netPL = day.cashIn - day.cashOut;
  }

  return Array.from(dayMap.values());
}

// ── Day detail ────────────────────────────────────────────────────────────────

export async function getDayDetail(dateStr: string): Promise<DayDetail> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const dayStart = dateStr + "T00:00:00";
  const dayEnd = dateStr + "T23:59:59";

  // Fetch workspace show session IDs for this day (for trade filtering)
  const { data: daySessions } = await supabase
    .from("show_sessions")
    .select("id")
    .eq("workspace_id", workspaceId);
  const allSessionIds = (daySessions ?? []).map((s) => s.id);

  const [buysRes, sellsRes, tradesRes, expensesRes, showsRes] = await Promise.all([
    supabase
      .from("items")
      .select("id, name, grade, condition, cost, market, owner, image_url, acquired_date, category")
      .eq("workspace_id", workspaceId)
      .not("acquired_date", "is", null)
      .gte("acquired_date", dayStart)
      .lte("acquired_date", dayEnd)
      .order("acquired_date"),

    supabase
      .from("items")
      .select("id, name, grade, condition, cost, sold_price, market, owner, image_url, sold_at, category")
      .eq("workspace_id", workspaceId)
      .eq("status", "sold")
      .not("sold_at", "is", null)
      .gte("sold_at", dayStart)
      .lte("sold_at", dayEnd)
      .order("sold_at"),

    allSessionIds.length > 0
      ? supabase
          .from("show_scans")
          .select("id, card_name, notes, scanned_at, deal_photo_url, show_session_id")
          .eq("action", "trade")
          .in("show_session_id", allSessionIds)
          .gte("scanned_at", dayStart)
          .lte("scanned_at", dayEnd)
          .order("scanned_at")
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from("expenses")
      .select("id, description, cost, paid_by, created_at, show_session_id")
      .eq("workspace_id", workspaceId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at"),

    supabase
      .from("show_sessions")
      .select("id, name, date, status, net_pl, total_spent, total_revenue, cards_bought, cards_sold, trades_count, started_at, ended_at")
      .eq("workspace_id", workspaceId)
      .eq("date", dateStr),
  ]);

  const sells: SellEntry[] = (sellsRes.data ?? []).map((s) => ({
    ...s,
    margin: s.sold_price != null && s.cost != null ? s.sold_price - s.cost : null,
  }));

  return {
    date: dateStr,
    buys: buysRes.data ?? [],
    sells,
    trades: tradesRes.data ?? [],
    expenses: expensesRes.data ?? [],
    shows: showsRes.data ?? [],
  };
}

// ── Schedule show ─────────────────────────────────────────────────────────────
//
// Optional columns — run once in Supabase SQL editor:
//   ALTER TABLE show_sessions ADD COLUMN IF NOT EXISTS location text;
//   ALTER TABLE show_sessions ADD COLUMN IF NOT EXISTS hours    text;
//   ALTER TABLE show_sessions ADD COLUMN IF NOT EXISTS notes    text;

export async function scheduleShow(data: {
  name: string;
  date: string;
  location?: string;
  hours?: string;
  startingCash?: number;
  notes?: string;
}): Promise<string> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const baseInsert: Record<string, unknown> = {
    workspace_id: workspaceId,
    name: data.name.trim(),
    date: data.date,
    status: "scheduled",
    ...(data.startingCash != null ? { starting_cash: data.startingCash } : {}),
  };

  const extras: Record<string, unknown> = {};
  if (data.location?.trim()) extras.location = data.location.trim();
  if (data.hours?.trim())    extras.hours    = data.hours.trim();
  if (data.notes?.trim())    extras.notes    = data.notes.trim();

  const hasExtras = Object.keys(extras).length > 0;

  // Try with optional columns; fall back gracefully if migration hasn't been run
  let result = await supabase
    .from("show_sessions")
    .insert(hasExtras ? { ...baseInsert, ...extras } : baseInsert)
    .select("id")
    .single();

  if (result.error?.code === "42703" && hasExtras) {
    // Column doesn't exist yet — retry without optional fields
    result = await supabase
      .from("show_sessions")
      .insert(baseInsert)
      .select("id")
      .single();
  }

  if (result.error) throw new Error(result.error.message);
  revalidatePath("/protected/calendar");
  revalidatePath("/protected/shows");
  return result.data.id as string;
}
