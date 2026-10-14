import Link from "next/link";
import { MoneyDisplay } from "@/components/ui";
import type { ActiveShowInfo } from "@/app/protected/shows/actions";

// ── Active show chip ──
// Running show: name + expected cash, tap goes to POS.
// No show: a quiet row pointing at the Shows page.

export default function ActiveShowChip({ show }: { show: ActiveShowInfo | null }) {
  if (!show) {
    return (
      <Link
        href="/protected/shows"
        className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 text-sm transition-colors duration-150 hover:bg-muted"
      >
        <span className="text-muted-foreground">No show running</span>
        <span className="font-medium text-primary">Shows →</span>
      </Link>
    );
  }

  return (
    <Link
      href="/protected/pos"
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-accent-primary-border bg-accent-primary-soft px-4 py-3 transition-colors duration-150 hover:border-accent-primary"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{show.name}</div>
          <div className="text-xs text-muted-foreground">Show running · open POS</div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Cash</div>
        <MoneyDisplay amount={show.expected_cash} tone="neutral" className="text-base font-semibold" />
      </div>
    </Link>
  );
}
