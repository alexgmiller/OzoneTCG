import {
  Search, Layers, TrendingUp, ShoppingBag, UserCircle,
  Zap, CalendarDays, ArrowLeftRight, Receipt, PieChart, Users, Wallet, Settings,
  type LucideIcon,
} from "lucide-react";

// ── Navigation destinations ──
// Five tabs, icon-only, Home in the centre. Everything else lives under More.
export type NavItem = { href: string; label: string; icon: LucideIcon };

export const TABS: readonly NavItem[] = [
  { href: "/protected/search",    label: "Search",    icon: Search },
  { href: "/protected/inventory", label: "Inventory", icon: Layers },
  { href: "/protected/dashboard", label: "Home",      icon: TrendingUp },
  { href: "/protected/pos",       label: "POS",       icon: ShoppingBag },
  { href: "/protected/more",      label: "More",      icon: UserCircle },
];

// Grouped for the More screen. Shows first.
export const MORE_GROUPS: readonly { title: string; items: readonly NavItem[] }[] = [
  { title: "Shows", items: [
    { href: "/protected/shows",    label: "Shows",    icon: Zap },
    { href: "/protected/calendar", label: "Calendar", icon: CalendarDays },
  ]},
  { title: "Money", items: [
    { href: "/protected/transactions", label: "Transactions", icon: ArrowLeftRight },
    { href: "/protected/expenses",     label: "Expenses",     icon: Receipt },
    { href: "/protected/finance",      label: "Finance",      icon: PieChart },
  ]},
  { title: "People", items: [
    { href: "/protected/consigners", label: "Consigners", icon: Users },
    { href: "/protected/payout",     label: "Payout",     icon: Wallet },
  ]},
  { title: "App", items: [
    { href: "/protected/settings", label: "Settings", icon: Settings },
  ]},
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

// The More tab lights up for any destination inside it.
export function isMoreActive(pathname: string) {
  return MORE_GROUPS.some((g) => g.items.some((i) => isActive(pathname, i.href)));
}
