"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import {
  expensesByCategory, localDay, monthlyPnl, periodPnl, pnlFor,
  type CategoryTotal, type FinanceExpense, type FinanceTx, type MonthPnl, type PeriodPnl, type Pnl,
} from "./math";

const TX_COLS = "id,trade_group_id,transaction_type,date,sale_price,cost_basis,cash_paid,cash_difference,payment_method";
const EXPENSE_COLS = "expense_date,created_at,cost,category,deductible_percentage";
const MONTHS = 12;

export type PayPeriodPnl = PeriodPnl & {
  alex_paid: number | null;
  mila_paid: number | null;
  shared_sales: number | null;
  net_payout: number | null; // > 0 Alex pays Mila
  notes: string | null;
};

export type FinanceData = {
  timeZone: string;
  year: number;
  ytd: Pnl;
  months: MonthPnl[];        // oldest first
  current: PayPeriodPnl;     // unsettled, since the last pay period
  periods: PayPeriodPnl[];   // settled, newest first
  categories: CategoryTotal[]; // this year, largest first
};

// Day boundaries follow the business's timezone, not the server's UTC clock
function businessTimeZone() {
  return process.env.OZONE_TIMEZONE ?? "America/Los_Angeles";
}

export async function getFinanceData(): Promise<FinanceData> {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const timeZone = businessTimeZone();

  const today = localDay(new Date().toISOString(), timeZone);
  const year = Number(today.slice(0, 4));
  const endMonth = today.slice(0, 7);

  const { data: periodRows, error: pErr } = await supabase
    .from("pay_periods")
    .select("id,period_start,period_end,alex_paid,mila_paid,shared_sales,net_payout,notes")
    .eq("workspace_id", workspaceId)
    .order("period_end", { ascending: false });
  if (pErr) throw new Error(pErr.message);
  const settled = (periodRows ?? []) as Omit<PayPeriodPnl, keyof Pnl>[];

  // Fetch far enough back to cover the month view, the year and every pay period
  const monthStart = new Date(Date.UTC(year, Number(endMonth.slice(5, 7)) - MONTHS, 1)).toISOString();
  const earliest = [monthStart, `${year}-01-01T00:00:00Z`, ...settled.map((p) => p.period_start)].sort()[0];

  const [rows, expenses] = await Promise.all([
    fetchAll<FinanceTx>((from, to) =>
      supabase.from("card_transactions").select(TX_COLS)
        .eq("workspace_id", workspaceId).gte("date", earliest)
        .order("date", { ascending: true }).range(from, to)),
    fetchAll<FinanceExpense>((from, to) =>
      supabase.from("expenses").select(EXPENSE_COLS)
        .eq("workspace_id", workspaceId).gte("expense_date", earliest.slice(0, 10))
        .order("expense_date", { ascending: true }).range(from, to)),
  ]);

  const inYear = (day: string) => day.startsWith(`${year}-`);
  const yearRows = rows.filter((t) => inYear(localDay(t.date, timeZone)));
  const yearExpenses = expenses.filter((e) => inYear((e.expense_date ?? e.created_at ?? "").slice(0, 10)));

  const lastEnd = settled[0]?.period_end ?? null;
  const open = { id: "current", period_start: lastEnd ?? "1970-01-01T00:00:00Z", period_end: null };
  const [current, ...pnlPeriods] = periodPnl(rows, expenses, [open, ...settled]);

  return {
    timeZone,
    year,
    ytd: pnlFor(yearRows, yearExpenses),
    months: monthlyPnl(rows, expenses, endMonth, MONTHS, timeZone),
    current: { ...current, alex_paid: null, mila_paid: null, shared_sales: null, net_payout: null, notes: null },
    periods: pnlPeriods.map((p, i) => ({ ...settled[i], ...p })),
    categories: expensesByCategory(yearExpenses),
  };
}
