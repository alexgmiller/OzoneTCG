"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import type { ExpenseCategory } from "../actions";

// IRS Schedule C line item mapping
const SCHEDULE_C_LINES: Record<ExpenseCategory, string> = {
  booth_fee: "Line 20b — Rent or lease (other business property)",
  meals: "Line 24b — Meals (50%)",
  lodging: "Line 28 — Other expenses: Lodging",
  mileage: "Line 9 — Car and truck expenses",
  supplies: "Line 22 — Supplies",
  shipping: "Line 28 — Other expenses: Shipping/postage",
  software: "Line 18 — Office expense",
  grading_fees: "Line 28 — Other expenses: Grading fees",
  other: "Line 28 — Other expenses",
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  booth_fee: "Booth / Table Fee",
  meals: "Meals",
  lodging: "Lodging",
  mileage: "Mileage",
  supplies: "Supplies",
  shipping: "Shipping",
  software: "Software",
  grading_fees: "Grading Fees",
  other: "Other",
};

export type CategoryRow = {
  category: ExpenseCategory;
  count: number;
  gross: number;
  deductible: number;
  miles: number;
};

export type ShowRow = {
  id: string;
  name: string;
  date: string;
  revenue: number;
  expenses: number;
  net: number;
};

export type TaxSummary = {
  grossTotal: number;
  deductibleTotal: number;
  totalMiles: number;
  receiptCount: number;
  categories: CategoryRow[];
  shows: ShowRow[];
};

type Props = {
  year: number;
  availableYears: number[];
  summary: TaxSummary;
};

export default function TaxReportClient({ year, availableYears, summary }: Props) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  function handleYearChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/protected/expenses/tax-report?year=${e.target.value}`);
  }

  function exportCSV() {
    setExporting(true);
    const rows: string[][] = [];

    rows.push([`OzoneTCG Tax Report — ${year}`, "", "", "", ""]);
    rows.push([`Generated`, new Date().toLocaleDateString(), "", "", ""]);
    rows.push([]);
    rows.push(["SUMMARY", "", "", "", ""]);
    rows.push(["Gross Expenses", fmt(summary.grossTotal), "", "", ""]);
    rows.push(["Total Deductible", fmt(summary.deductibleTotal), "", "", ""]);
    rows.push(["Total Miles", summary.totalMiles.toFixed(1), "", "", ""]);
    rows.push(["Receipts on File", String(summary.receiptCount), "", "", ""]);
    rows.push([]);
    rows.push(["SCHEDULE C BREAKDOWN", "", "", "", ""]);
    rows.push(["Category", "IRS Schedule C Line", "Count", "Gross", "Deductible"]);
    for (const cat of summary.categories) {
      rows.push([
        CATEGORY_LABELS[cat.category],
        SCHEDULE_C_LINES[cat.category],
        String(cat.count),
        fmt(cat.gross),
        fmt(cat.deductible),
      ]);
    }
    rows.push([]);
    rows.push(["PER-SHOW P&L", "", "", "", ""]);
    rows.push(["Show", "Date", "Revenue", "Expenses", "Net P&L"]);
    for (const show of summary.shows) {
      rows.push([
        show.name,
        show.date,
        fmt(show.revenue),
        fmt(show.expenses),
        fmt(show.net),
      ]);
    }

    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ozone-tax-report-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Tax Year</label>
          <select
            value={year}
            onChange={handleYearChange}
            className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button
          onClick={exportCSV}
          disabled={exporting}
          className="flex items-center gap-1.5 text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded disabled:opacity-60"
        >
          <Download className="w-4 h-4" />
          {exporting ? "Exporting…" : "Export Schedule C CSV"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Gross Expenses" value={fmt(summary.grossTotal)} />
        <SummaryCard label="Total Deductible" value={fmt(summary.deductibleTotal)} highlight />
        <SummaryCard label="Total Miles" value={`${summary.totalMiles.toFixed(1)} mi`} />
        <SummaryCard label="Receipts on File" value={String(summary.receiptCount)} />
      </div>

      {/* Category breakdown */}
      <section>
        <h2 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Schedule C Breakdown
        </h2>
        <div className="overflow-x-auto rounded border dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">IRS Line</th>
                <th className="text-right px-3 py-2">Count</th>
                <th className="text-right px-3 py-2">Gross</th>
                <th className="text-right px-3 py-2">Deductible</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {summary.categories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                    No expenses for {year}
                  </td>
                </tr>
              )}
              {summary.categories.map((cat) => (
                <tr key={cat.category} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 font-medium">{CATEGORY_LABELS[cat.category]}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs hidden sm:table-cell">
                    {SCHEDULE_C_LINES[cat.category]}
                  </td>
                  <td className="px-3 py-2 text-right">{cat.count}</td>
                  <td className="px-3 py-2 text-right">{fmt(cat.gross)}</td>
                  <td className="px-3 py-2 text-right font-medium text-green-700 dark:text-green-400">
                    {fmt(cat.deductible)}
                  </td>
                </tr>
              ))}
            </tbody>
            {summary.categories.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right">
                    {summary.categories.reduce((s, c) => s + c.count, 0)}
                  </td>
                  <td className="px-3 py-2 text-right">{fmt(summary.grossTotal)}</td>
                  <td className="px-3 py-2 text-right text-green-700 dark:text-green-400">
                    {fmt(summary.deductibleTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Per-show profitability */}
      {summary.shows.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Per-Show Profitability
          </h2>
          <div className="overflow-x-auto rounded border dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-3 py-2">Show</th>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-right px-3 py-2">Revenue</th>
                  <th className="text-right px-3 py-2">Expenses</th>
                  <th className="text-right px-3 py-2">Net P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {summary.shows.map((show) => (
                  <tr key={show.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2 font-medium">{show.name}</td>
                    <td className="px-3 py-2 text-gray-500">{show.date}</td>
                    <td className="px-3 py-2 text-right">{fmt(show.revenue)}</td>
                    <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">
                      {fmt(show.expenses)}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${show.net >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {show.net >= 0 ? "+" : ""}{fmt(show.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            Revenue from show_sessions totals. Show expenses include all expense rows linked to that show.
          </p>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Consult a tax professional. Mileage deductible amount uses the IRS standard mileage rate
        recorded at time of entry. Meals are 50% deductible per IRS rules for business travel.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border dark:border-gray-700 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-green-700 dark:text-green-400" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function csvCell(s: string) {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
