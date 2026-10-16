"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoneyDisplay } from "@/components/ui";
import type { ActiveShowInfo } from "@/app/protected/shows/actions";

// ── Active show banner ──
// Sits at the top of every page except Home and POS, which render the running
// show as their own chip. Tap goes to POS.

const HIDDEN_ON = ["/protected/dashboard", "/protected/pos"];

export default function ActiveShowBanner({ show }: { show: ActiveShowInfo | null }) {
  const pathname = usePathname();
  if (!show) return null;
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <Link
      href="/protected/pos"
      className="mx-4 mt-3 flex h-11 items-center justify-between gap-3 rounded-full bg-accent-tint px-4 text-sm font-medium text-accent transition-colors duration-150 hover:bg-surface-2"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
        <span className="truncate">{show.name}</span>
      </span>
      <span className="shrink-0">
        Cash <MoneyDisplay amount={show.expected_cash} tone="neutral" className="text-accent" />
      </span>
    </Link>
  );
}
