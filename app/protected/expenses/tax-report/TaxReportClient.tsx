"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { MoneyDisplay, SectionHeader, StatCard } from "@/components/ui";
import type { ExpenseCategory } from "../actions";

// ── IRS Schedule C line mapping ───────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

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

const TH = "px-3 py-3 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-3";
const NUM = "text-right tabular-nums";

// ── Client ────────────────────────────────────────────────────────────────────

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
      rows.push([show.name, show.date, fmt(show.revenue), fmt(show.expenses), fmt(show.net)]);
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

  const totalCount = summary.categories.reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-6">
      {/* ── Header row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          Tax year
          <select
            value={year}
            onChange={handleYearChange}
            className="h-11 rounded-lg border border-border bg-background px-3 font-mono text-sm tabular-nums text-foreground"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <button
          onClick={exportCSV}
          disabled={exporting}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent disabled:opacity-40"
        >
          <Download size={16} />
          {exporting ? "Exporting…" : "Export Schedule C CSV"}
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Gross expenses" money={summary.grossTotal} />
        <StatCard
          label="Total deductible"
          tone="positive"
          value={<MoneyDisplay amount={summary.deductibleTotal} tone="positive" />}
        />
        <StatCard label="Total miles" value={`${summary.totalMiles.toFixed(1)} mi`} />
        <StatCard label="Receipts on file" value={String(summary.receiptCount)} />
      </div>

      {/* ── Category breakdown ── */}
      <section className="space-y-2">
        <SectionHeader>Schedule C breakdown</SectionHeader>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className={`${TH} text-left`}>Category</th>
                <th className={`${TH} hidden text-left sm:table-cell`}>IRS line</th>
                <th className={`${TH} text-right`}>Count</th>
                <th className={`${TH} text-right`}>Gross</th>
                <th className={`${TH} text-right`}>Deductible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.categories.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-muted-foreground">
                    No expenses for {year}
                  </td>
                </tr>
              )}
              {summary.categories.map((cat) => (
                <tr key={cat.category} className="transition-colors duration-150 hover:bg-muted">
                  <td className={`${TD} font-medium`}>{CATEGORY_LABELS[cat.category]}</td>
                  <td className={`${TD} hidden text-xs text-muted-foreground sm:table-cell`}>
                    {SCHEDULE_C_LINES[cat.category]}
                  </td>
                  <td className={`${TD} ${NUM}`}>{cat.count}</td>
                  <td className={`${TD} ${NUM}`}><MoneyDisplay amount={cat.gross} tone="neutral" /></td>
                  <td className={`${TD} ${NUM} font-medium`}><MoneyDisplay amount={cat.deductible} tone="positive" /></td>
                </tr>
              ))}
            </tbody>
            {summary.categories.length > 0 && (
              <tfoot className="bg-muted font-semibold">
                <tr>
                  <td className={TD} colSpan={2}>Total</td>
                  <td className={`${TD} ${NUM}`}>{totalCount}</td>
                  <td className={`${TD} ${NUM}`}><MoneyDisplay amount={summary.grossTotal} tone="neutral" /></td>
                  <td className={`${TD} ${NUM}`}><MoneyDisplay amount={summary.deductibleTotal} tone="positive" /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* ── Per-show profitability ── */}
      {summary.shows.length > 0 && (
        <section className="space-y-2">
          <SectionHeader>Per-show profitability</SectionHeader>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className={`${TH} text-left`}>Show</th>
                  <th className={`${TH} text-left`}>Date</th>
                  <th className={`${TH} text-right`}>Revenue</th>
                  <th className={`${TH} text-right`}>Expenses</th>
                  <th className={`${TH} text-right`}>Net P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.shows.map((show) => (
                  <tr key={show.id} className="transition-colors duration-150 hover:bg-muted">
                    <td className={`${TD} font-medium`}>{show.name}</td>
                    <td className={`${TD} text-muted-foreground`}>{show.date}</td>
                    <td className={`${TD} ${NUM}`}><MoneyDisplay amount={show.revenue} tone="neutral" /></td>
                    <td className={`${TD} ${NUM}`}><MoneyDisplay amount={show.expenses} tone="negative" /></td>
                    <td className={`${TD} ${NUM} font-semibold`}><MoneyDisplay amount={show.net} showSign /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Revenue from show_sessions totals. Show expenses include all expense rows linked to that show.
          </p>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Consult a tax professional. Mileage deductible amount uses the IRS standard mileage rate
        recorded at time of entry. Meals are 50% deductible per IRS rules for business travel.
      </p>
    </div>
  );
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function csvCell(s: string) {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
