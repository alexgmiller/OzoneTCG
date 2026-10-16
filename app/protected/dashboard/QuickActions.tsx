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

export default function QuickActions() {
  return (
    <div className="grid grid-cols-4">
      {ACTIONS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="flex justify-center">
          <IconButton label={label} showLabel>
            <Icon size={20} strokeWidth={1.75} aria-hidden />
          </IconButton>
        </Link>
      ))}
    </div>
  );
}
