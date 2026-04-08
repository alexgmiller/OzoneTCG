"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ShoppingBag, Tag, Users, Receipt, Wallet, Camera, MoreHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const allLinks = [
  { href: "/protected/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/protected/inventory",  label: "Inventory",  icon: Package },
  { href: "/protected/buy",        label: "Buy",        icon: ShoppingBag },
  { href: "/protected/sold",       label: "Sold",       icon: Tag },
  { href: "/protected/photos",     label: "Deals",      icon: Camera },
  { href: "/protected/consigners", label: "Consigners", icon: Users },
  { href: "/protected/expenses",   label: "Expenses",   icon: Receipt },
  { href: "/protected/payout",     label: "Payout",     icon: Wallet },
];

const primaryLinks = allLinks.filter((l) =>
  ["/protected/inventory", "/protected/buy", "/protected/sold", "/protected/photos"].includes(l.href)
);
const moreLinks = allLinks.filter((l) => !primaryLinks.includes(l));

/** Desktop-only nav — rendered inside the top header */
export function DesktopNavLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-1">
      {allLinks.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Button key={l.href} asChild size="sm" variant={active ? "secondary" : "ghost"}>
            <Link href={l.href}>{l.label}</Link>
          </Button>
        );
      })}
    </nav>
  );
}

/** Mobile-only bottom tab bar — must be rendered OUTSIDE any backdrop-filter ancestor */
export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Prefetch all routes as soon as the nav mounts
  useEffect(() => {
    allLinks.forEach((l) => router.prefetch(l.href));
  }, [router]);

  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const moreActive = moreLinks.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + "/")
  );

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50" ref={moreRef}>
      {/* More popup — sits above the tab bar */}
      {moreOpen && (
        <div className="absolute bottom-full left-0 right-0 bg-background/70 backdrop-blur-md border-t border-x border-primary/10 rounded-t-2xl shadow-lg pb-1">
          <div className="grid grid-cols-2 gap-px p-3">
            {moreLinks.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.5 : 1.5} />
                  <span className="text-sm">{l.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav className="bg-background/60 backdrop-blur-md border-t border-t-primary/10 flex h-14 w-full">
        {primaryLinks.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium leading-none">{l.label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
            moreOpen || moreActive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <MoreHorizontal size={22} strokeWidth={moreOpen || moreActive ? 2.5 : 1.5} />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </nav>
    </div>
  );
}
