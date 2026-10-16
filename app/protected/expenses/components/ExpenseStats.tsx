"use client";

import { TriangleAlert } from "lucide-react";
import { MoneyDisplay, StatCard } from "@/components/ui";
import { estimateTaxSavings } from "@/lib/taxEstimate";
import type { ExpenseCategory } from "../actions";
import { CAT_TOKEN, IRS_MILEAGE_RATE, RECEIPT_IRS_THRESHOLD, plural } from "./expenseMeta";

export type ExpenseTotals = {
  gross: number;
  deductible: number;
  mileageTotal: number;
  missingReceiptCount: number;
};

function Savings({ amount }: { amount: number }) {
  return <MoneyDisplay amount={Math.round(estimateTaxSavings(amount))} tone="neutral" />;
}

// ── Stats: three StatCards + category strip + mileage + docs warning ──────────

export function ExpenseStats({
  totals,
  expenseCount,
  tripCount,
  categoryCounts,
  activeCategory,
  onPickCategory,
  yearMileage,
}: {
  totals: ExpenseTotals;
  expenseCount: number;
  tripCount: number;
  categoryCounts: { cat: ExpenseCategory; count: number }[];
  activeCategory: ExpenseCategory | "all";
  onPickCategory: (c: ExpenseCategory) => void;
  yearMileage: number;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="Total expenses"
          money={totals.gross}
          delta={plural(expenseCount, "expense")}
        />
        <StatCard
          label="Tax deductible"
          tone="positive"
          value={<MoneyDisplay amount={totals.deductible} tone="positive" />}
          delta={
            totals.deductible > 0
              ? <>~<Savings amount={totals.deductible} /> saved</>
              : plural(expenseCount, "expense")
          }
        />
        <StatCard
          label="Miles"
          value={totals.mileageTotal.toFixed(0)}
          delta={
            totals.mileageTotal > 0
              ? <>~<Savings amount={totals.mileageTotal * IRS_MILEAGE_RATE} /> deductible</>
              : plural(tripCount, "trip")
          }
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* ── Category breakdown strip (tap to filter) ── */}
      {categoryCounts.length > 1 && (
        <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-card">
          {categoryCounts.map(({ cat, count }, i) => {
            const tok = CAT_TOKEN[cat];
            return (
              <button
                key={cat}
                onClick={() => onPickCategory(cat)}
                className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-3 transition-colors duration-150 hover:bg-muted ${
                  i > 0 ? "border-l border-border" : ""
                } ${activeCategory === cat ? "bg-muted" : ""}`}
              >
                <span className={`font-mono text-sm font-bold tabular-nums ${tok.text}`}>{count}</span>
                <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{tok.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Annual mileage motivator ── */}
      {yearMileage > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-accent-tint bg-accent-tint px-4 py-2.5 text-xs">
          <span className="font-mono tabular-nums text-accent">
            {yearMileage.toFixed(0)} mi logged this year
          </span>
          <span className="text-muted-foreground">
            = ~<Savings amount={yearMileage * IRS_MILEAGE_RATE} /> saved
          </span>
        </div>
      )}

      {/* ── IRS receipt warning: only when 3+ items need attention ── */}
      {totals.missingReceiptCount >= 3 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning-border bg-warning-soft px-3 py-3 text-warning">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 text-sm leading-relaxed">
            <span className="font-semibold tabular-nums">{plural(totals.missingReceiptCount, "expense")}</span>
            {" "}over ${RECEIPT_IRS_THRESHOLD} need documentation — tap a row and add a photo, screenshot, or note.
          </span>
        </div>
      )}
    </div>
  );
}
