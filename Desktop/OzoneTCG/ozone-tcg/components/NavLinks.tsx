"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";

const links = [
  { href: "/protected/dashboard", label: "Dashboard" },
  { href: "/protected/inventory", label: "Inventory" },
  { href: "/protected/buy", label: "Buy" },
  { href: "/protected/sold", label: "Sold" },
  { href: "/protected/consigners", label: "Consigners" },
  { href: "/protected/expenses", label: "Expenses" },
  { href: "/protected/payout", label: "Payout" },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="hidden sm:flex items-center gap-2">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Button key={l.href} asChild size="sm" variant={active ? "secondary" : "ghost"}>
            <Link href={l.href}>{l.label}</Link>
          </Button>
        );
      })}
    </nav>
  );
}
