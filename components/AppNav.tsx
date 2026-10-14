"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home, ShoppingCart, Package, Zap, MoreHorizontal,
  Receipt, Users, Wallet, ArrowLeftRight, CalendarDays, Settings, LogOut, X, PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "./theme-switcher";

// ── Destinations ──
type NavItem = { href: string; label: string; icon: typeof Home };

const PRIMARY: NavItem[] = [
  { href: "/protected/dashboard", label: "Home",      icon: Home },
  { href: "/protected/pos",       label: "POS",       icon: ShoppingCart },
  { href: "/protected/inventory", label: "Inventory", icon: Package },
  { href: "/protected/shows",     label: "Shows",     icon: Zap },
];

const MORE: NavItem[] = [
  { href: "/protected/finance",      label: "Finance",      icon: PieChart },
  { href: "/protected/expenses",     label: "Expenses",     icon: Receipt },
  { href: "/protected/consigners",   label: "Consigners",   icon: Users },
  { href: "/protected/payout",       label: "Payout",       icon: Wallet },
  { href: "/protected/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/protected/calendar",     label: "Calendar",     icon: CalendarDays },
  { href: "/protected/settings",     label: "Settings",     icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

type Props = { handle: string; hasActiveShow?: boolean };

// ── AppNav ──
// Mobile (< md): fixed bottom tab bar + "More" bottom sheet.
// Desktop (md+): fixed left sidebar with every destination and a user footer.
export default function AppNav({ handle, hasActiveShow = false }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    [...PRIMARY, ...MORE].forEach((l) => router.prefetch(l.href));
  }, [router]);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  async function logout() {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/auth/login");
  }

  const moreActive = MORE.some((l) => isActive(pathname, l.href));

  return (
    <>
      <Sidebar pathname={pathname} handle={handle} hasActiveShow={hasActiveShow} onLogout={logout} />

      {moreOpen && (
        <MoreSheet pathname={pathname} onClose={() => setMoreOpen(false)} onLogout={logout} />
      )}

      {/* ── Mobile tab bar ── */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-border bg-background"
      >
        {PRIMARY.map((l) => (
          <TabLink
            key={l.href}
            item={l}
            active={isActive(pathname, l.href)}
            dot={l.href === "/protected/shows" && hasActiveShow}
          />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-150",
            moreActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MoreHorizontal size={22} strokeWidth={moreActive ? 2.5 : 1.75} />
          <span className="text-xs leading-none">More</span>
        </button>
      </nav>
    </>
  );
}

// ── Tab link (mobile) ──
function TabLink({ item, active, dot }: { item: NavItem; active: boolean; dot: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-150",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon size={22} strokeWidth={active ? 2.5 : 1.75} />
      <span className="text-xs leading-none">{item.label}</span>
      {dot && <span className="absolute right-1/4 top-2 h-2 w-2 animate-pulse rounded-full bg-accent-primary" />}
    </Link>
  );
}

// ── Row link (sidebar + sheet) ──
function RowLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-150",
        active
          ? "bg-accent-primary-soft text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 1.75} />
      {item.label}
    </Link>
  );
}

function LogoutRow({ onLogout }: { onLogout: () => void }) {
  return (
    <button
      type="button"
      onClick={onLogout}
      className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
    >
      <LogOut size={18} strokeWidth={1.75} />
      Logout
    </button>
  );
}

// ── Sidebar (desktop) ──
function Sidebar({
  pathname, handle, hasActiveShow, onLogout,
}: { pathname: string; handle: string; hasActiveShow: boolean; onLogout: () => void }) {
  return (
    <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-56 flex-col border-r border-border bg-card">
      <Link href="/protected/dashboard" className="flex h-14 items-center px-4 text-base font-bold tracking-tight text-foreground">
        <span className="text-primary">Ozone</span>TCG
        {hasActiveShow && <span className="ml-2 h-2 w-2 animate-pulse rounded-full bg-accent-primary" aria-label="Show active" />}
      </Link>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {PRIMARY.map((l) => <RowLink key={l.href} item={l} active={isActive(pathname, l.href)} />)}
        <div className="my-2 h-px bg-border" />
        {MORE.map((l) => <RowLink key={l.href} item={l} active={isActive(pathname, l.href)} />)}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex h-11 items-center justify-between gap-2 px-3">
          <span className="truncate text-sm font-medium text-foreground">{handle}</span>
          <ThemeSwitcher />
        </div>
        <LogoutRow onLogout={onLogout} />
      </div>
    </aside>
  );
}

// ── More sheet (mobile) ──
function MoreSheet({
  pathname, onClose, onLogout,
}: { pathname: string; onClose: () => void; onLogout: () => void }) {
  return (
    <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-3 pb-5">
        <div className="flex h-11 items-center justify-between px-3">
          <span className="text-sm font-semibold text-foreground">More</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-3 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {MORE.map((l) => (
            <RowLink key={l.href} item={l} active={isActive(pathname, l.href)} onClick={onClose} />
          ))}
          <div className="my-1 h-px bg-border" />
          <LogoutRow onLogout={onLogout} />
        </div>
      </div>
    </div>
  );
}
