import Link from "next/link";
import { MoneyDisplay, SectionHeader, StatCard } from "@/components/ui";
import type { DashboardTotals } from "./totals";

// ── Lifetime ──

export default function LifetimeSection({ totals }: { totals: DashboardTotals }) {
  const items = (count: number) => `${count} item${count === 1 ? "" : "s"}`;

  return (
    <section className="space-y-3">
      <SectionHeader>Lifetime</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Inventory value"
          money={totals.market.inventory}
          delta={`${items(totals.counts.inventory)} on hand`}
        />
        <StatCard
          label="Cost basis"
          money={totals.cost.inventory}
          delta="Paid for what you hold"
        />
        <StatCard
          label="Realized P&L"
          value={<MoneyDisplay amount={totals.pnl.realized} showSign />}
          delta={`${items(totals.counts.sold)} sold · after expenses`}
        />
        <StatCard
          label="Unrealized P&L"
          value={<MoneyDisplay amount={totals.pnl.unrealized} showSign />}
          delta="Market minus cost"
        />
      </div>
      <Link
        href="/protected/payout"
        className="flex h-12 w-full items-center justify-between rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted"
      >
        Partner split &amp; payout
        <span className="text-primary">→</span>
      </Link>
    </section>
  );
}
