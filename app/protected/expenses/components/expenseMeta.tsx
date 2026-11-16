import type { ReactNode } from "react";
import {
  Award, Car, Hotel, Mail, Monitor, MoreHorizontal, Package, Store, Utensils,
} from "lucide-react";
import type { ExpenseCategory } from "../actions";
import { EXPENSE_CATEGORIES } from "@/components/expenses/form/shared";

// ── Constants ─────────────────────────────────────────────────────────────────

export const RECEIPT_IRS_THRESHOLD = 75;
export const IRS_MILEAGE_RATE = 0.70;

export type FilterState = {
  category: ExpenseCategory | "all";
  show: string;
  paidBy: "all" | "alex" | "mila" | "shared";
  dateRange: "month" | "year" | "all";
  groupBy: "flat" | "category" | "show";
};

export const DEFAULT_FILTERS: FilterState = {
  category: "all",
  show: "all",
  paidBy: "all",
  dateRange: "year",
  groupBy: "flat",
};

// ── Categories ────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<ExpenseCategory, ReactNode> = {
  meals:        <Utensils size={16} />,
  mileage:      <Car size={16} />,
  lodging:      <Hotel size={16} />,
  booth_fee:    <Store size={16} />,
  supplies:     <Package size={16} />,
  shipping:     <Mail size={16} />,
  software:     <Monitor size={16} />,
  grading_fees: <Award size={16} />,
  other:        <MoreHorizontal size={16} />,
};

export const CATEGORIES = EXPENSE_CATEGORIES.map((c) => ({
  ...c,
  label: c.value === "mileage" ? "Gas / Mileage" : c.label,
  icon: CATEGORY_ICONS[c.value],
}));

export function catMeta(c: ExpenseCategory) {
  return CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[CATEGORIES.length - 1];
}

// Per-category visual tokens: amber=warning, teal=accent, emerald=positive, slate=neutral.
export const CAT_TOKEN: Record<ExpenseCategory, { border: string; pill: string; text: string; label: string }> = {
  meals:        { border: "border-l-warning",        pill: "border-warning-border bg-warning-soft text-warning",                         text: "text-warning",        label: "MEAL"   },
  mileage:      { border: "border-l-accent", pill: "border-accent-tint bg-accent-tint text-accent",    text: "text-accent", label: "MILE"   },
  lodging:      { border: "border-l-accent", pill: "border-accent-tint bg-accent-tint text-accent",    text: "text-accent", label: "HOTEL"  },
  booth_fee:    { border: "border-l-positive",       pill: "border-positive-border bg-positive-soft text-positive",                      text: "text-positive",       label: "BOOTH"  },
  supplies:     { border: "border-l-neutral",        pill: "border-border bg-muted text-muted-foreground",                               text: "text-neutral",        label: "SUPPLY" },
  shipping:     { border: "border-l-neutral",        pill: "border-border bg-muted text-muted-foreground",                               text: "text-neutral",        label: "SHIP"   },
  software:     { border: "border-l-accent", pill: "border-accent-tint bg-accent-tint text-accent",    text: "text-accent", label: "SW"     },
  grading_fees: { border: "border-l-warning",        pill: "border-warning-border bg-warning-soft text-warning",                         text: "text-warning",        label: "GRADE"  },
  other:        { border: "border-l-neutral",        pill: "border-border bg-muted text-muted-foreground",                               text: "text-neutral",        label: "OTHER"  },
};

// ── Formatting ────────────────────────────────────────────────────────────────

export function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

// ── Show pill (header LIVE indicator + active filter badge) ───────────────────

export function ShowPill({ name, live = false }: { name: string; live?: boolean }) {
  return (
    <div className="inline-flex h-8 items-center gap-1.5 rounded-full border border-warning-border bg-warning-soft px-3">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-warning ${live ? "animate-pulse" : ""}`} />
      <span className="max-w-36 truncate font-mono text-xs uppercase tracking-wide text-warning">{name}</span>
    </div>
  );
}
