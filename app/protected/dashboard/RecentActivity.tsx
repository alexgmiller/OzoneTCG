import Link from "next/link";
import { EmptyState, MoneyDisplay } from "@/components/ui";
import { METHOD_LABELS, type PaymentMethod } from "@/app/protected/pos/ledger";
import { fmtAgo, type DealMode, type RecentDeal } from "./activity";

// ── Recent ──
// The last five transactions as compact rows: thumbnail, name, mode badge,
// amount, method. Server component: relative times are computed here, so
// there is no timezone-dependent text to hydrate.

const MODE_LABEL: Record<DealMode, string> = { buy: "Buy", sell: "Sell", trade: "Trade" };
const MODE_CLASS: Record<DealMode, string> = {
  buy: "bg-down-tint text-down",
  sell: "bg-up-tint text-up",
  trade: "bg-accent-tint text-accent",
};

function dealTitle(d: RecentDeal) {
  if (d.cardCount === 1 && d.firstName) return d.firstName;
  return `${d.cardCount} cards`;
}

function methodLabel(m: string | null) {
  return m && m in METHOD_LABELS ? METHOD_LABELS[m as PaymentMethod] : null;
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
            className="flex h-11 w-full items-center justify-center rounded-full bg-accent text-sm font-semibold text-bg transition-colors duration-150 hover:bg-accent-tint hover:text-accent"
          >
            Open POS
          </Link>
        }
      />
    );
  }

  const now = new Date();

  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      <ul>
        {deals.map((d) => {
          const method = methodLabel(d.method);
          return (
            <li key={d.id} className="flex h-16 items-center gap-3 border-b border-border px-3 last:border-b-0">
              <div className="h-12 w-9 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {d.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{dealTitle(d)}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${MODE_CLASS[d.mode]}`}>
                    {MODE_LABEL[d.mode]}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtAgo(d.date, now)}{method && <> · {method}</>}
                </div>
              </div>
              {d.mode === "trade" && d.amount === 0 ? (
                <span className="shrink-0 text-sm text-muted-foreground">Even</span>
              ) : (
                <MoneyDisplay amount={d.amount} showSign className="shrink-0 text-sm font-semibold" />
              )}
            </li>
          );
        })}
      </ul>
      <Link
        href="/protected/transactions"
        className="flex h-11 items-center justify-center border-t border-border text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-2"
      >
        View all
      </Link>
    </div>
  );
}
