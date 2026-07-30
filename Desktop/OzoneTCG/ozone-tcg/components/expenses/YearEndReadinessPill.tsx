"use client";

import { useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { ExpenseRow } from "@/app/protected/expenses/ExpensesServer";

const RECEIPT_THRESHOLD = 75;

type Issue = {
  id: string;
  label: string;
  type: "receipt" | "mileage";
};

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
      <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border opacity-40"
        style={{ borderColor: "rgba(255,255,255,0.12)" }}
      >
        No {year} expenses yet
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border"
        style={{ borderColor: "rgba(52,211,153,0.30)", background: "rgba(52,211,153,0.08)", color: "#34d399" }}
      >
        <CheckCircle2 size={11} />
        Ready to file
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors duration-150 hover:opacity-90"
        style={{ borderColor: "rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.09)", color: "#fbbf24" }}
      >
        <TriangleAlert size={11} />
        {issues.length} item{issues.length !== 1 ? "s" : ""} need review
      </button>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`${year} Tax Readiness`}>
        <p className="text-xs opacity-50 mb-4">
          Fix these before filing to avoid IRS issues.
        </p>
        <ul className="space-y-2">
          {issues.map((issue) => (
            <li key={issue.id} className="flex items-start justify-between gap-3 text-xs">
              <span className="opacity-70 leading-relaxed">{issue.label}</span>
              <button
                onClick={() => { setModalOpen(false); onEditExpense(issue.id); }}
                className="shrink-0 px-2.5 py-1 rounded-lg border border-violet-500/40 text-violet-400 hover:bg-violet-500/10 transition-colors"
              >
                Fix
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[10px] opacity-30 mt-4 leading-relaxed">
          IRS requires documentation for expenses $75 or more.
        </p>
      </Modal>
    </>
  );
}
