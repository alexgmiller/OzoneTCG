"use server";

// ── Calendar server actions ───────────────────────────────────────────────────
// show_sessions.status must allow 'scheduled' | 'active' | 'completed'.

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { revalidatePath } from "next/cache";
import { addExpense } from "@/app/protected/expenses/actions";
import { countTradesByDay, groupTrades, type TradeCountRow, type TradeDetailRow } from "./trades";

const TRADE_TYPES = ["trade_in", "trade_out"];

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

// One trade deal from card_transactions; card_name reads "out → in"
export type TradeEntry = {
  id: string;
  card_name: string | null;
  notes: string | null;
  scanned_at: string; // card_transactions.date
  deal_photo_url: string | null;
  show_session_id: string | null;
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

    // Trades: one per trade_group_id with a trade_in/trade_out row that day
    supabase
      .from("card_transactions")
      .select("id, trade_group_id, date")
      .eq("workspace_id", workspaceId)
      .in("transaction_type", TRADE_TYPES)
      .gte("date", monthStart)
      .lte("date", rangeEnd),
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

  const tradeCounts = countTradesByDay((tradesRes.data ?? []) as TradeCountRow[]);
  for (const [d, count] of tradeCounts) getDay(d).tradeCount += count;

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

    supabase
      .from("card_transactions")
      .select("id, trade_group_id, transaction_type, date, notes, show_session_id, card:items!card_id(name)")
      .eq("workspace_id", workspaceId)
      .in("transaction_type", TRADE_TYPES)
      .gte("date", dayStart)
      .lte("date", dayEnd)
      .order("date"),

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
    trades: groupTrades((tradesRes.data ?? []) as unknown as TradeDetailRow[]),
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
  boothFee?: number;
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
  const showId = result.data.id as string;

  // Booth fee is a shared expense tagged to the show
  if (data.boothFee && data.boothFee > 0) {
    await addExpense({
      description: `Booth fee — ${data.name.trim()}`,
      cost: data.boothFee,
      paid_by: "shared",
      category: "booth_fee",
      expense_date: data.date,
      vendor_name: data.location?.trim() || null,
      show_session_id: showId,
    });
  }

  revalidatePath("/protected/calendar");
  revalidatePath("/protected/shows");
  return showId;
}
