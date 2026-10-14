import Link from "next/link";
import { ArrowLeftRight, BadgeDollarSign, ScanLine, ShoppingBag } from "lucide-react";

// ── Quick actions ──

const ACTIONS = [
  { href: "/protected/pos?mode=buy", label: "Buy", Icon: ShoppingBag },
  { href: "/protected/pos?mode=sell", label: "Sell", Icon: BadgeDollarSign },
  { href: "/protected/pos?mode=trade", label: "Trade", Icon: ArrowLeftRight },
  { href: "/protected/scan", label: "Scan cert", Icon: ScanLine },
] as const;

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ACTIONS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex h-16 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent-primary-hover"
        >
          <Icon size={22} strokeWidth={2} aria-hidden />
          {label}
        </Link>
      ))}
    </div>
  );
}
