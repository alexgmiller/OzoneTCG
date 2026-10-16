import Link from "next/link";
import { MoneyDisplay } from "@/components/ui";
import type { ActiveShowInfo } from "@/app/protected/shows/actions";

// ── Active show chip ──
// "At Sac Card Show · $1,240 today" at the very top of Home. Tap opens POS.
// Nothing renders when no show is open; starting one lives in the POS header.

export default function ActiveShowChip({ show, revenue }: { show: ActiveShowInfo | null; revenue: number }) {
  if (!show) return null;

  return (
    <Link
      href="/protected/pos"
      className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent-tint px-4 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-2"
    >
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
      <span className="truncate">At {show.name}</span>
      <span aria-hidden>·</span>
      <span className="shrink-0 tabular-nums">
        <MoneyDisplay amount={revenue} tone="neutral" className="text-accent" /> today
      </span>
    </Link>
  );
}
