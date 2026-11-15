import Link from "next/link";
import { ArrowLeftRight, BadgeDollarSign, ScanLine, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui";

// ── Quick actions ──
// One dominant action (Sell, the most frequent deal on a show floor), then the
// rest as smaller secondary tiles. When everything is primary, nothing is.

const SECONDARY = [
  { href: "/protected/pos?mode=buy", label: "Buy", Icon: ShoppingBag },
  { href: "/protected/pos?mode=trade", label: "Trade", Icon: ArrowLeftRight },
  { href: "/protected/scan", label: "Scan cert", Icon: ScanLine },
] as const;

export default function QuickActions() {
  return (
    <div className="space-y-3">
      <Button asChild size="lg" className="h-14 w-full rounded-xl">
        <Link href="/protected/pos?mode=sell">
          <BadgeDollarSign size={22} strokeWidth={2} aria-hidden />
          Sell
        </Link>
      </Button>
      <div className="grid grid-cols-3 gap-3">
        {SECONDARY.map(({ href, label, Icon }) => (
          <Button key={href} asChild variant="outline" className="h-16 flex-col gap-1 rounded-xl px-2">
            <Link href={href}>
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              {label}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}
