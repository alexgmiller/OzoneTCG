"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { EmptyState, MoneyDisplay, SectionHeader, StatCard, useToast } from "@/components/ui";
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-4">
      <h1 className="text-xl font-bold tracking-tight text-foreground">Finance</h1>

      {/* ── Year to date ── */}
      <section className="space-y-2">
        <SectionHeader>{data.year} to date</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Revenue" money={data.ytd.revenue} />
          <StatCard label="Gross profit" value={<MoneyDisplay amount={data.ytd.grossProfit} showSign />} />
          <StatCard label="Expenses" money={data.ytd.expenses} />
          <StatCard label="Net" value={<MoneyDisplay amount={data.ytd.net} showSign />} tone={data.ytd.net >= 0 ? "positive" : "default"} />
        </div>
      </section>

      {/* ── P&L ── */}
      <section className="space-y-3">
        <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist">
          <button type="button" role="tab" aria-selected={view === "month"} className={tab(view === "month")} onClick={() => setView("month")}>By month</button>
          <button type="button" role="tab" aria-selected={view === "period"} className={tab(view === "period")} onClick={() => setView("period")}>By pay period</button>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {view === "month"
            ? months.map((m) => <PnlRow key={m.month} title={fmtMonth(m.month)} p={m} />)
            : periods.map((p) => (
                <PnlRow key={p.id} p={p}
                  title={p.period_end ? `${fmtDay(p.period_start)} – ${fmtDay(p.period_end)}` : `Since ${fmtDay(p.period_start)}`}
                  sub={periodSub(p)} />
              ))}
        </ul>
        {view === "period" && (
          <Link href="/protected/payout" className={`${btn} w-full`}>Settle up in Payout</Link>
        )}
      </section>

      {/* ── Expenses by category ── */}
      <section className="space-y-2">
        <SectionHeader action={<Link href="/protected/expenses/tax-report" className="text-xs text-accent-primary">Tax report →</Link>}>
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
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={btn} disabled={busy !== null} onClick={() => exportCsv("transactions", exportTransactionsCSV)}>
            <Download size={16} />{busy === "transactions" ? "Exporting…" : "Transactions CSV"}
          </button>
          <button type="button" className={btn} disabled={busy !== null} onClick={() => exportCsv("expenses", exportExpensesCSV)}>
            <Download size={16} />{busy === "expenses" ? "Exporting…" : "Expenses CSV"}
          </button>
        </div>
      </section>
    </div>
  );
}
