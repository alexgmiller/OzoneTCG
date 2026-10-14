"use client";

import { useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui";
import type { ExpenseRow } from "@/app/protected/expenses/ExpensesServer";

const RECEIPT_THRESHOLD = 75;
const PILL = "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm";

type Issue = {
  id: string;
  label: string;
  type: "receipt" | "mileage";
};

// ── Issue detection ───────────────────────────────────────────────────────────

function getYearIssues(expenses: ExpenseRow[], year: number): Issue[] {
  const prefix = String(year);
  const issues: Issue[] = [];
  for (const e of expenses) {
    if (!e.expense_date.startsWith(prefix)) continue;
    if (e.category !== "mileage" && !e.receipt_url && !e.documentation_notes && e.cost >= RECEIPT_THRESHOLD) {
      issues.push({
        id: e.id,
        label: `${e.vendor_name || e.description || "Expense"} (${moneyFmt(e.cost)}) — no documentation`,
        type: "receipt",
      });
    }
    if (e.category === "mileage" && !e.mileage_miles) {
      issues.push({
        id: e.id,
        label: `Mileage expense on ${e.expense_date} — miles not recorded`,
        type: "mileage",
      });
    }
  }
  return issues;
}

function moneyFmt(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// ── Pill ──────────────────────────────────────────────────────────────────────

export function YearEndReadinessPill({
  expenses,
  year = new Date().getFullYear(),
  onEditExpense,
}: {
  expenses: ExpenseRow[];
  year?: number;
  onEditExpense: (id: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const yearExpenses = expenses.filter((e) => e.expense_date.startsWith(String(year)));
  const issues = getYearIssues(expenses, year);

  if (yearExpenses.length === 0) {
    return (
      <div className={`${PILL} border-border text-muted-foreground`}>
        No {year} expenses yet
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className={`${PILL} border-positive-border bg-positive-soft text-positive`}>
        <CheckCircle2 size={14} />
        Ready to file
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={`${PILL} border-warning-border bg-warning-soft text-warning transition-opacity duration-150 hover:opacity-90`}
      >
        <TriangleAlert size={14} />
        <span className="tabular-nums">{issues.length}</span> item{issues.length !== 1 ? "s" : ""} need review
      </button>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`${year} Tax Readiness`}>
        <p className="mb-4 text-sm text-muted-foreground">
          Fix these before filing to avoid IRS issues.
        </p>
        <ul className="space-y-2">
          {issues.map((issue) => (
            <li key={issue.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="leading-relaxed text-muted-foreground">{issue.label}</span>
              <button
                onClick={() => { setModalOpen(false); onEditExpense(issue.id); }}
                className="inline-flex h-11 shrink-0 items-center rounded-lg border border-accent-primary-border px-4 text-sm text-accent-primary transition-colors duration-150 hover:bg-accent-primary-soft"
              >
                Fix
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          IRS requires documentation for expenses $75 or more.
        </p>
      </Modal>
    </>
  );
}
