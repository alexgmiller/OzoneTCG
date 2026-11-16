"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { EmptyState, MoneyDisplay, PageHeader, SectionHeader, StatCard, useToast } from "@/components/ui";
import { exportExpensesCSV, exportTransactionsCSV } from "@/app/protected/settings/actions";
import type { FinanceData, PayPeriodPnl } from "./actions";
import type { MonthPnl } from "./math";

const tab = (on: boolean) =>
  `h-11 flex-1 rounded-lg text-sm font-semibold transition-colors duration-150 ${on ? "bg-background text-foreground" : "text-muted-foreground"}`;
const btn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted disabled:opacity-40";

const fmtMonth = (ym: string) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const label = (c: string) => c.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase());

function downloadCSV(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Rows ──
function PnlRow({ title, sub, p }: { title: string; sub?: string; p: MonthPnl | PayPeriodPnl }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{title}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className="text-right">
          <MoneyDisplay amount={p.net} showSign className="block text-sm font-semibold" />
          <span className="text-xs text-muted-foreground tabular-nums">rev <MoneyDisplay amount={p.revenue} tone="neutral" /></span>
        </div>
      </button>
      {open && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 pb-3 text-xs text-muted-foreground">
          <dt>Cost of goods</dt><dd className="text-right"><MoneyDisplay amount={-p.cogs} /></dd>
          <dt>Expenses</dt><dd className="text-right"><MoneyDisplay amount={-p.expenses} /></dd>
          <dt>Spent on cards</dt><dd className="text-right"><MoneyDisplay amount={p.buysSpent + p.tradeCashOut} tone="neutral" /></dd>
          <dt>Deals</dt><dd className="text-right tabular-nums">{p.deals} · {p.cardsSold} sold · {p.cardsBought} bought</dd>
        </dl>
      )}
    </li>
  );
}

// ── P&L table (lg+) ── every column visible, no expand step
type PnlLine = { key: string; title: string; sub?: string; p: MonthPnl | PayPeriodPnl };

function PnlTable({ lines }: { lines: PnlLine[] }) {
  const num = "px-4 text-right tabular-nums";
  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left text-sm text-muted-foreground">
            <th className="px-4 py-3 font-medium">Period</th>
            <th className="px-4 py-3 text-right font-medium">Revenue</th>
            <th className="px-4 py-3 text-right font-medium">Cost of goods</th>
            <th className="px-4 py-3 text-right font-medium">Expenses</th>
            <th className="px-4 py-3 text-right font-medium">Net</th>
            <th className="px-4 py-3 text-right font-medium">Sold · bought</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ key, title, sub, p }) => (
            <tr key={key} className="h-14 border-b border-border text-sm last:border-b-0">
              <td className="px-4">
                <div className="font-medium text-foreground">{title}</div>
                {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
              </td>
              <td className={num}><MoneyDisplay amount={p.revenue} tone="neutral" className="text-foreground" /></td>
              <td className={num}><MoneyDisplay amount={-p.cogs} /></td>
              <td className={num}><MoneyDisplay amount={-p.expenses} /></td>
              <td className={num}><MoneyDisplay amount={p.net} showSign className="font-semibold" /></td>
              <td className={`${num} text-muted-foreground`}>{p.cardsSold} · {p.cardsBought}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function periodSub(p: PayPeriodPnl) {
  if (p.net_payout == null) return "Not settled yet";
  if (Math.abs(p.net_payout) < 0.005) return "Settled · even";
  return `Settled · ${p.net_payout > 0 ? "Alex → Mila" : "Mila → Alex"} $${Math.abs(p.net_payout).toFixed(2)}`;
}

export default function FinanceClient({ data }: { data: FinanceData }) {
  const toast = useToast();
  const [view, setView] = useState<"month" | "period">("month");
  const [busy, setBusy] = useState<string | null>(null);

  async function exportCsv(kind: "transactions" | "expenses", run: () => Promise<string>) {
    setBusy(kind);
    try {
      downloadCSV(await run(), `${kind}-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`${label(kind)} exported`);
    } catch {
      toast.error("Export failed — try again");
    } finally {
      setBusy(null);
    }
  }

  const months = [...data.months].reverse(); // newest first on screen
  const periods = [data.current, ...data.periods];
  const periodTitle = (p: PayPeriodPnl) =>
    p.period_end ? `${fmtDay(p.period_start)} – ${fmtDay(p.period_end)}` : `Since ${fmtDay(p.period_start)}`;
  const lines: PnlLine[] = view === "month"
    ? months.map((m) => ({ key: m.month, title: fmtMonth(m.month), p: m }))
    : periods.map((p) => ({ key: p.id, title: periodTitle(p), sub: periodSub(p), p }));

  // Desktop (lg+): YTD stats in one row; P&L table on the left two thirds,
  // expenses by category and exports in the right column
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-4 lg:max-w-6xl">
      <PageHeader title="Finance" />

      {/* ── Year to date ── */}
      <section className="space-y-2">
        <SectionHeader>{data.year} to date</SectionHeader>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Revenue" money={data.ytd.revenue} />
          <StatCard label="Gross profit" value={<MoneyDisplay amount={data.ytd.grossProfit} showSign />} />
          <StatCard label="Expenses" money={data.ytd.expenses} />
          <StatCard label="Net" value={<MoneyDisplay amount={data.ytd.net} showSign />} tone={data.ytd.net >= 0 ? "positive" : "default"} />
        </div>
      </section>

      <div className="space-y-5 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
        {/* ── P&L ── */}
        <section className="space-y-3 lg:col-span-2">
          <div className="flex gap-1 rounded-xl bg-muted p-1 lg:max-w-sm" role="tablist">
            <button type="button" role="tab" aria-selected={view === "month"} className={tab(view === "month")} onClick={() => setView("month")}>By month</button>
            <button type="button" role="tab" aria-selected={view === "period"} className={tab(view === "period")} onClick={() => setView("period")}>By pay period</button>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card lg:hidden">
            {lines.map((l) => <PnlRow key={l.key} title={l.title} sub={l.sub} p={l.p} />)}
          </ul>
          <div className="hidden lg:block">
            <PnlTable lines={lines} />
          </div>
          {view === "period" && (
            <Link href="/protected/payout" className={`${btn} w-full lg:w-auto`}>Settle up in Payout</Link>
          )}
        </section>

        <div className="space-y-5">
          {/* ── Expenses by category ── */}
          <section className="space-y-2">
            <SectionHeader action={<Link href="/protected/expenses/tax-report" className="text-xs text-accent">Tax report →</Link>}>
              {data.year} expenses by category
            </SectionHeader>
            {data.categories.length === 0 ? (
              <EmptyState title="No expenses this year" hint="Expenses you log will be grouped here." />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {data.categories.map((c) => (
                  <li key={c.category} className="flex min-h-12 items-center gap-3 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground">{label(c.category)}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {c.count} · deductible <MoneyDisplay amount={c.deductible} tone="neutral" />
                      </div>
                    </div>
                    <MoneyDisplay amount={c.total} tone="neutral" className="text-sm font-semibold text-foreground" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Exports ── */}
          <section className="space-y-2">
            <SectionHeader>Export</SectionHeader>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <button type="button" className={btn} disabled={busy !== null} onClick={() => exportCsv("transactions", exportTransactionsCSV)}>
                <Download size={16} />{busy === "transactions" ? "Exporting…" : "Transactions CSV"}
              </button>
              <button type="button" className={btn} disabled={busy !== null} onClick={() => exportCsv("expenses", exportExpensesCSV)}>
                <Download size={16} />{busy === "expenses" ? "Exporting…" : "Expenses CSV"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
