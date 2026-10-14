"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Package, ArrowLeftRight,
  ScanLine, Users, Receipt, Wallet,
  MoreHorizontal, Settings, LogOut, Zap, CalendarDays, ShoppingCart,
} from "lucide-react";
import { Button } from "./ui/button";
import { useState, useEffect, useRef } from "react";

function isShowsActive(pathname: string) {
  return pathname === "/protected/shows" || pathname.startsWith("/protected/shows/");
}

// Desktop nav shows Calendar between Transactions and Shows
const primaryLinks = [
  { href: "/protected/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/protected/pos",          label: "POS",          icon: ShoppingCart },
  { href: "/protected/inventory",    label: "Inventory",    icon: Package },
  { href: "/protected/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/protected/calendar",     label: "Calendar",     icon: CalendarDays },
  { href: "/protected/shows",        label: "Shows",        icon: Zap },
];

// Mobile bottom tab bar uses first 4 items; the rest live in the More menu
const mobileTabLinks = [
  { href: "/protected/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/protected/pos",          label: "POS",          icon: ShoppingCart },
  { href: "/protected/inventory",    label: "Inventory",    icon: Package },
  { href: "/protected/shows",        label: "Shows",        icon: Zap },
];

const moreNavLinks = [
  { href: "/protected/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/protected/calendar",     label: "Calendar",     icon: CalendarDays },
  { href: "/protected/scan",        label: "Scan",       icon: ScanLine },
  { href: "/protected/consigners",  label: "Consigners", icon: Users },
  { href: "/protected/expenses",    label: "Expenses",   icon: Receipt },
  { href: "/protected/payout",      label: "Payout",     icon: Wallet },
  { href: "/protected/settings",    label: "Settings",   icon: Settings },
];

type DesktopNavProps = {
  hasActiveShow?: boolean;
};

/** Desktop-only nav — rendered inside the top header */
export function DesktopNavLinks({ hasActiveShow = false }: DesktopNavProps) {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-1">
      {primaryLinks.map((l) => {
        const active =
          l.href === "/protected/shows"
            ? isShowsActive(pathname)
            : pathname === l.href || pathname.startsWith(l.href + "/");
        const isShows = l.href === "/protected/shows";
        return (
          <Button key={l.href} asChild size="sm" variant={active ? "secondary" : "ghost"}>
            <Link href={l.href} className="relative">
              {l.label}
              {isShows && hasActiveShow && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

type MobileMoreProps = {
  hasActiveShow?: boolean;
};

/** Mobile-only bottom tab bar — must be rendered OUTSIDE any backdrop-filter ancestor */
export default function MobileBottomNav({
  hasActiveShow = false,
}: MobileMoreProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const allLinks = [...mobileTabLinks, ...moreNavLinks];

  // Prefetch all routes on mount
  useEffect(() => {
    allLinks.forEach((l) => router.prefetch(l.href));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const moreActive = moreNavLinks.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + "/")
  );

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50" ref={moreRef}>
      {/* More popup — sits above the tab bar */}
      {moreOpen && (
        <div className="absolute bottom-full left-0 right-0 bg-background/70 backdrop-blur-md border-t border-x border-primary/10 rounded-t-2xl shadow-lg pb-1">
          <div className="p-3 space-y-0.5">
            {/* Nav links */}
            {moreNavLinks.map((l) => {
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

            <div className="h-px bg-border mx-1 my-1" />

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-muted transition-colors"
            >
              <LogOut size={18} strokeWidth={1.5} />
              <span className="text-sm">Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab bar — 4 primary items + More */}
      <nav className="bg-background border-t border-t-border flex h-14 w-full">
        {mobileTabLinks.map((l) => {
          const active =
            l.href === "/protected/shows"
              ? isShowsActive(pathname)
              : pathname === l.href || pathname.startsWith(l.href + "/");
          const Icon = l.icon;
          const isShows = l.href === "/protected/shows";
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`relative flex-1 flex items-center justify-center transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon size={24} strokeWidth={active ? 2.5 : 1.5} />
              {isShows && hasActiveShow && (
                <span className="absolute top-2 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </Link>
          );
        })}

        <button
          onClick={() => setMoreOpen((o) => !o)}
          className={`flex-1 flex items-center justify-center transition-colors ${
            moreOpen || moreActive ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <MoreHorizontal size={24} strokeWidth={moreOpen || moreActive ? 2.5 : 1.5} />
        </button>
      </nav>
    </div>
  );
}
