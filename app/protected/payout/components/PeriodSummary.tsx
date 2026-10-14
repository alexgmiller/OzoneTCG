import { EmptyState, MoneyDisplay, SectionHeader, StatCard } from "@/components/ui";
import type { PayoutTotals } from "@/lib/payout";
import { NET_TONE, fmtDate, netLabel, netSide } from "./payoutMeta";

// ── Period summary: date range, stat tiles, net payout, 50/50 breakdown ──

export function PeriodSummary({
  periodStart,
  totals,
  sharedSaleTotal,
  consignerCutTotal,
  hasActivity,
}: {
  periodStart: string | null;
  totals: PayoutTotals;
  // Shared-owner sales only; totals.sharedSales also folds in the consigner cut.
  sharedSaleTotal: number;
  consignerCutTotal: number;
  hasActivity: boolean;
}) {
  const side = netSide(totals.netPayout);
  const netAbs = Math.abs(totals.netPayout);

  const breakdown = [
    { label: "Mila owes Alex", sub: "50% of Alex's spend", amount: 0.5 * totals.alexPaid },
    { label: "Alex owes Mila", sub: "50% of shared sales", amount: 0.5 * sharedSaleTotal },
    ...(consignerCutTotal > 0
      ? [{ label: "Alex owes Mila", sub: "50% of consigner cut", amount: 0.5 * consignerCutTotal }]
      : []),
    ...(totals.milaPaid > 0
      ? [{ label: "Alex owes Mila", sub: "50% of Mila's spend", amount: 0.5 * totals.milaPaid }]
      : []),
  ];

  return (
    <section className="space-y-3">
      <SectionHeader
        action={
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {periodStart ? fmtDate(periodStart) : "All time"} → {fmtDate(new Date().toISOString())}
          </span>
        }
      >
        Current period
      </SectionHeader>

      {!hasActivity ? (
        <EmptyState
          title="Nothing to settle"
          hint="Expenses, inventory buys and shared sales logged since the last settlement show up here."
        />
      ) : (
        <>
          {/* ── Stat tiles ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Alex paid" money={totals.alexPaid} delta="Expenses + inventory" />
            <StatCard label="Mila paid" money={totals.milaPaid} delta="Expenses + inventory" />
            <StatCard
              label="Shared sales"
              tone="positive"
              value={<MoneyDisplay amount={totals.sharedSales} tone="positive" />}
              delta={
                consignerCutTotal > 0 ? (
                  <>
                    incl. <MoneyDisplay amount={consignerCutTotal} tone="neutral" /> consigner cut
                  </>
                ) : (
                  "Split 50/50"
                )
              }
              className="col-span-2 sm:col-span-1"
            />
          </div>

          {/* ── Net result ── */}
          <StatCard
            label={netLabel(side)}
            value={<MoneyDisplay amount={netAbs} tone={NET_TONE[side]} />}
            delta="Net payout this period"
          />

          {/* ── Breakdown ── */}
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            <div className="px-4 py-3">
              <SectionHeader>Breakdown</SectionHeader>
            </div>
            {breakdown.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="text-foreground">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.sub}</div>
                </div>
                <MoneyDisplay amount={r.amount} tone="neutral" className="shrink-0 text-foreground" />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
