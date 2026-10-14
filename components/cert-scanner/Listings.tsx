"use client";

import { ExternalLink } from "lucide-react";
import { SectionHeader, Skeleton } from "@/components/ui";
import { MoneyOrDash, shortDate, type ActiveListingsState, type SoldState } from "./shared";

// ── ListingTypeBadge ──

function ListingTypeBadge({ types }: { types: string[] }) {
  const [label, cls] = types.includes("AUCTION")
    ? ["Auction", "bg-warning-soft text-warning-strong"]
    : types.includes("BEST_OFFER")
      ? ["Best offer", "bg-positive-soft text-positive-strong"]
      : ["Fixed", "bg-muted text-muted-foreground"];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function RowSkeletons() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
    </div>
  );
}

// ── RecentSales ──

export function RecentSales({
  sold,
  onToggleShowAll,
}: {
  sold: SoldState;
  onToggleShowAll: () => void;
}) {
  const visible = sold.showAll ? sold.items : sold.items.slice(0, 5);
  return (
    <div>
      <SectionHeader className="mb-2">Recent sales</SectionHeader>
      {sold.loading ? (
        <RowSkeletons />
      ) : sold.items.length === 0 ? (
        <div className="py-2 text-sm text-muted-foreground">No sold data found</div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visible.map((s, i) => (
            <div key={i} className="flex min-h-11 items-center gap-2 px-3 py-2">
              <ListingTypeBadge types={s.buyingOptions} />
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{shortDate(s.soldDate)}</span>
              <div className="flex-1" />
              <span className="text-sm font-semibold"><MoneyOrDash amount={s.price} /></span>
              {s.itemUrl && (
                <a
                  href={s.itemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open listing"
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
          {sold.items.length > 5 && (
            <button
              type="button"
              onClick={onToggleShowAll}
              className="h-11 w-full text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              {sold.showAll ? "Show less" : `${sold.items.length - 5} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── ActiveListings ── sorted low → high; the cheapest row is highlighted.

export function ActiveListings({ listings }: { listings: ActiveListingsState }) {
  return (
    <div>
      <SectionHeader className="mb-2">Active listings</SectionHeader>
      {listings.loading ? (
        <RowSkeletons />
      ) : listings.items.length === 0 ? (
        <div className="py-2 text-sm text-muted-foreground">No active listings found</div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {listings.items.slice(0, 5).map((l, i) => (
            <a
              key={i}
              href={l.itemUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex min-h-11 items-center gap-2 px-3 py-2 transition-colors duration-150 hover:bg-muted ${
                i === 0 ? "bg-positive-soft" : ""
              }`}
            >
              <ListingTypeBadge types={l.buyingOptions} />
              {l.bidCount != null && l.bidCount > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{l.bidCount} bids</span>
              )}
              <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{l.title}</div>
              <span className="shrink-0 text-sm font-semibold">
                <MoneyOrDash amount={l.price} tone={i === 0 ? "positive" : "neutral"} />
              </span>
              <ExternalLink size={14} className="shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
