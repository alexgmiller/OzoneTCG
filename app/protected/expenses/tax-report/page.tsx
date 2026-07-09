import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import TaxReportClient, { type TaxSummary, type CategoryRow, type ShowRow } from "./TaxReportClient";
import type { ExpenseCategory } from "../actions";

type SearchParams = { year?: string };

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = yearParam ? parseInt(yearParam, 10) : currentYear;

  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  // Fetch all expenses in the selected year
  const { data: expenses, error } = await supabase
    .from("expenses")
    .select(
      "id,category,cost,deductible_percentage,mileage_miles,mileage_rate,receipt_url,show_session_id,expense_date"
    )
    .eq("workspace_id", workspaceId)
    .gte("expense_date", `${year}-01-01`)
    .lte("expense_date", `${year}-12-31`);

  if (error) throw new Error(error.message);

  // Get distinct years that have expenses (for the year selector)
  const { data: yearRows } = await supabase
    .from("expenses")
    .select("expense_date")
    .eq("workspace_id", workspaceId)
    .not("expense_date", "is", null);

  const yearSet = new Set<number>();
  yearSet.add(currentYear);
  for (const row of yearRows ?? []) {
    const y = new Date(row.expense_date).getFullYear();
    if (!isNaN(y)) yearSet.add(y);
  }
  const availableYears = Array.from(yearSet).sort((a, b) => b - a);

  // Fetch show sessions that have expenses in this year
  const showIds = [...new Set((expenses ?? []).map((e) => e.show_session_id).filter(Boolean))];
  const { data: sessions } = showIds.length
    ? await supabase
        .from("show_sessions")
        .select("id,name,date,total_revenue,total_spent")
        .in("id", showIds)
    : { data: [] };

  const sessionMap = new Map(
    (sessions ?? []).map((s) => [
      s.id,
      { name: s.name, date: s.date, revenue: s.total_revenue ?? 0, spent: s.total_spent ?? 0 },
    ])
  );

  // Build category summary
  const catMap = new Map<ExpenseCategory, CategoryRow>();
  let grossTotal = 0;
  let deductibleTotal = 0;
  let totalMiles = 0;
  let receiptCount = 0;

  for (const exp of expenses ?? []) {
    const cat = (exp.category ?? "other") as ExpenseCategory;
    const cost = exp.cost ?? 0;
    const pct = exp.deductible_percentage ?? 100;
    const deductible = cost * (pct / 100);

    grossTotal += cost;
    deductibleTotal += deductible;
    if (exp.receipt_url) receiptCount++;
    if (cat === "mileage" && exp.mileage_miles) {
      totalMiles += Number(exp.mileage_miles);
    }

    const existing = catMap.get(cat);
    if (existing) {
      existing.count++;
      existing.gross += cost;
      existing.deductible += deductible;
      existing.miles += cat === "mileage" ? (Number(exp.mileage_miles) ?? 0) : 0;
    } else {
      catMap.set(cat, {
        category: cat,
        count: 1,
        gross: cost,
        deductible,
        miles: cat === "mileage" ? (Number(exp.mileage_miles) ?? 0) : 0,
      });
    }
  }

  const categories: CategoryRow[] = Array.from(catMap.values()).sort(
    (a, b) => b.gross - a.gross
  );

  // Per-show P&L: revenue from session, expenses sum from expenses table
  const showExpenseMap = new Map<string, number>();
  for (const exp of expenses ?? []) {
    if (!exp.show_session_id) continue;
    showExpenseMap.set(
      exp.show_session_id,
      (showExpenseMap.get(exp.show_session_id) ?? 0) + (exp.cost ?? 0)
    );
  }

  const shows: ShowRow[] = [];
  for (const [id, session] of sessionMap) {
    const expTotal = showExpenseMap.get(id) ?? 0;
    shows.push({
      id,
      name: session.name,
      date: session.date,
      revenue: session.revenue,
      expenses: expTotal,
      net: session.revenue - expTotal,
    });
  }
  shows.sort((a, b) => b.date.localeCompare(a.date));

  const summary: TaxSummary = {
    grossTotal,
    deductibleTotal,
    totalMiles,
    receiptCount,
    categories,
    shows,
  };

  return (
    <div className="w-full p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Link
          href="/protected/expenses"
          className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          Expenses
        </Link>
        <span className="text-gray-400">/</span>
        <h1 className="text-xl font-semibold">Tax Report</h1>
      </div>
      <TaxReportClient year={year} availableYears={availableYears} summary={summary} />
    </div>
  );
}
