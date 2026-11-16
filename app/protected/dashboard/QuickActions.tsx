import Link from "next/link";
import { ArrowLeftRight, BadgeDollarSign, ScanLine, ShoppingBag } from "lucide-react";
import { IconButton } from "@/components/ui";

// ── Quick actions ──
// Four labelled IconButtons: Buy, Sell, Trade, Scan.

const ACTIONS = [
  { href: "/protected/pos?mode=buy",   label: "Buy",   Icon: ShoppingBag },
  { href: "/protected/pos?mode=sell",  label: "Sell",  Icon: BadgeDollarSign },
  { href: "/protected/pos?mode=trade", label: "Trade", Icon: ArrowLeftRight },
  { href: "/protected/scan",           label: "Scan",  Icon: ScanLine },
] as const;

// Phone: a row of round buttons. Desktop: a 2×2 grid of wide labelled tiles,
// which reads better beside the chart and gives a mouse a bigger target.
export default function QuickActions() {
  return (
    <>
      <div className="grid grid-cols-4 lg:hidden">
        {ACTIONS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex justify-center">
            <IconButton label={label} showLabel>
              <Icon size={20} strokeWidth={1.75} aria-hidden />
            </IconButton>
          </Link>
        ))}
      </div>
      <div className="hidden grid-cols-2 gap-3 lg:grid">
        {ACTIONS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex h-14 items-center gap-3 rounded-2xl bg-surface px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface-2"
          >
            <Icon size={20} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}
