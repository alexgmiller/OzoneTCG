import Link from "next/link";
import { EmptyState, MoneyDisplay } from "@/components/ui";
import { fmtAgo, type DealMode, type RecentDeal } from "./activity";

// ── Recent activity ──
// Server component: relative times are computed here, so there is no
// timezone-dependent text to hydrate.

const MODE_LABEL: Record<DealMode, string> = { buy: "Buy", sell: "Sell", trade: "Trade" };
const MODE_CLASS: Record<DealMode, string> = {
  buy: "text-negative",
  sell: "text-positive",
  trade: "text-primary",
};

function dealTitle(d: RecentDeal) {
  if (d.cardCount === 1 && d.firstName) return d.firstName;
  return `${d.cardCount} cards`;
}

export default function RecentActivity({ deals }: { deals: RecentDeal[] }) {
  if (deals.length === 0) {
    return (
      <EmptyState
        title="No deals yet"
        hint="Buys, sells and trades from the POS show up here."
        cta={
          <Link
            href="/protected/pos"
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent-primary-hover"
          >
            Open POS
          </Link>
        }
      />
    );
  }

  const now = new Date();

  return (
    <div className="rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {deals.map((d) => (
          <li key={d.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs uppercase tracking-wider ${MODE_CLASS[d.mode]}`}>
                  {MODE_LABEL[d.mode]}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{fmtAgo(d.date, now)}</span>
              </div>
              <div className="truncate text-sm text-foreground">{dealTitle(d)}</div>
            </div>
            {d.mode === "trade" && d.amount === 0 ? (
              <span className="shrink-0 text-sm text-muted-foreground">Even</span>
            ) : (
              <MoneyDisplay amount={d.amount} showSign className="shrink-0 text-sm font-semibold" />
            )}
          </li>
        ))}
      </ul>
      <Link
        href="/protected/transactions"
        className="flex h-11 items-center justify-center border-t border-border text-sm font-medium text-primary transition-colors duration-150 hover:bg-muted"
      >
        View all
      </Link>
    </div>
  );
}
