import Link from "next/link";
import { ArrowLeftRight, BadgeDollarSign, ScanLine, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui";

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
        <Button key={href} asChild size="lg" className="h-16 rounded-xl">
          <Link href={href}>
            <Icon size={22} strokeWidth={2} aria-hidden />
            {label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
