import type { CertLookupResult, GradingCompany } from "@/app/api/cert-lookup/route";
import type { SlabSale, SoldPricingResult } from "@/lib/ebay";
import { MoneyDisplay } from "@/components/ui";

// ── Constants ──

export const OFFER_PRESETS = [70, 75, 80, 85, 90];
export const HISTORY_KEY = "ozone_cert_scan_history";
export const CAMERA_PREF_KEY = "ozone_cert_camera_pref";
export const MAX_HISTORY = 50;
export const COMPANIES: GradingCompany[] = ["PSA", "BGS", "CGC", "TAG"];

// Standard grade ladder (ascending). Used for adjacent-grade lookup.
export const GRADE_LADDER = [
  "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5",
  "5", "5.5", "6", "7", "7.5", "8", "8.5", "9", "9.5", "10",
];

// ── Types ──

export type ScanPhase = "idle" | "lookup" | "result" | "manual_details";
export type Owner = "alex" | "mila" | "shared";

export interface BatchItem extends CertLookupResult {
  id: string;
  offerPct: number;
  addedAt: string;
}

export interface HistoryEntry {
  id: string;
  certNumber: string;
  company: GradingCompany;
  grade: string;
  name: string;
  market: number | null;
  offerPct: number;
  scannedAt: string;
}

export type ActiveListingsState = { items: SlabSale[]; lowest: number | null; loading: boolean };
export type SoldState = { items: SlabSale[]; pricing: SoldPricingResult | null; loading: boolean; showAll: boolean };
export type GradeData = {
  market: number | null;
  q1: number | null;
  q3: number | null;
  compCount: number;
  listings: ActiveListingsState;
  sold: SoldState;
};

// ── Helpers ──

export function getAdjacentGrades(grade: string): string[] {
  const idx = GRADE_LADDER.indexOf(grade);
  if (idx === -1) return [grade];
  const above = GRADE_LADDER[idx + 1] ?? null;
  const below = GRADE_LADDER[idx - 1] ?? null;
  return [above, grade, below].filter(Boolean) as string[];
}

// Cache key for a company + grade combo: "PSA|10", "BGS|9.5", etc.
export function cacheKey(company: GradingCompany, grade: string): string {
  return `${company}|${grade}`;
}

// String formatter for toasts / labels. Use <MoneyOrDash /> in markup.
export function money(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function offerValue(market: number | null, pct: number): number | null {
  if (!market) return null;
  return Math.round(market * pct) / 100;
}

export function gradeString(r: Pick<CertLookupResult, "company" | "gradeLabel" | "grade">): string {
  return r.gradeLabel ? `${r.company} ${r.gradeLabel} ${r.grade}` : `${r.company} ${r.grade}`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Shared class strings ──

export const inputClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-accent";

const btnBase =
  "flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium " +
  "transition-colors duration-150 disabled:opacity-40";

export const btnPrimary =
  `${btnBase} bg-primary text-primary-foreground hover:bg-accent`;

export const btnOutline =
  `${btnBase} border border-border bg-card text-foreground hover:bg-muted`;

export const btnAccentOutline =
  `${btnBase} border border-accent-tint bg-accent-tint text-accent hover:border-accent`;

export function pillClass(selected: boolean, extra = ""): string {
  return `${extra} h-11 rounded-full px-3 text-xs font-semibold transition-colors duration-150 ${
    selected
      ? "bg-primary text-primary-foreground"
      : "border border-border bg-card text-muted-foreground hover:text-foreground"
  }`;
}

// ── MoneyOrDash ──

export function MoneyOrDash({
  amount,
  className,
  tone = "neutral",
}: {
  amount: number | null | undefined;
  className?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  if (amount == null || amount === 0) {
    return <span className={`text-muted-foreground ${className ?? ""}`}>—</span>;
  }
  return <MoneyDisplay amount={amount} tone={tone} className={className} />;
}
