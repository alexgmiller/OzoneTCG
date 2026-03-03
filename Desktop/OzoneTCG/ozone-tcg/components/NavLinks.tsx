"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ShoppingBag, Tag, Users, Receipt, Wallet } from "lucide-react";
import { Button } from "./ui/button";

const links = [
  { href: "/protected/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/protected/inventory", label: "Inventory", icon: Package },
  { href: "/protected/buy", label: "Buy", icon: ShoppingBag },
  { href: "/protected/sold", label: "Sold", icon: Tag },
  { href: "/protected/consigners", label: "Consigners", icon: Users },
  { href: "/protected/expenses", label: "Expenses", icon: Receipt },
  { href: "/protected/payout", label: "Payout", icon: Wallet },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop nav — horizontal links in the header */}
      <nav className="hidden md:flex items-center gap-1">
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Button key={l.href} asChild size="sm" variant={active ? "secondary" : "ghost"}>
              <Link href={l.href}>{l.label}</Link>
            </Button>
          );
        })}
      </nav>

      {/* Mobile — fixed bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full z-50 bg-background border-t flex h-14">
        {links.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
              <span className="text-[9px] font-medium leading-none truncate w-full text-center px-0.5">
                {l.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
