// Formatting helpers and class strings shared by the shows list and detail page

import type { ShowSession } from "./actions";

export type ShowStatus = ShowSession["status"];

// ── Dates ─────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

// Local calendar date as YYYY-MM-DD (matches the value of an <input type="date">)
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "Oct 13, 2026" or, with weekday, "Tue, Oct 13"
export function fmtDate(iso: string, withWeekday = false): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString(
    "en-US",
    withWeekday
      ? { weekday: "short", month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" },
  );
}

// ── Show fields ───────────────────────────────────────────────────────────────

// Older rows may lack the optional venue columns
export function showVenue(s: Pick<ShowSession, "location" | "venue_address">): string | null {
  return s.location?.trim() || s.venue_address?.trim() || null;
}

export const STATUS_PILL: Record<ShowStatus, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "border-accent-primary-border bg-accent-primary-soft text-accent-primary" },
  active: { label: "Live", cls: "border-warning-border bg-warning-soft text-warning-strong" },
  completed: { label: "Completed", cls: "border-border bg-muted text-muted-foreground" },
};

// ── Classes ───────────────────────────────────────────────────────────────────

export const pillCls =
  "inline-flex h-6 items-center rounded-full border px-2.5 font-mono text-xs uppercase tracking-wide";

const btnBase =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm whitespace-nowrap " +
  "transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none";

export const btnPrimary =
  `${btnBase} bg-primary font-semibold text-primary-foreground hover:bg-accent-primary-hover`;
export const btnSecondary =
  `${btnBase} border border-border bg-card font-medium text-foreground hover:bg-muted`;
export const btnDanger =
  `${btnBase} border border-negative-border bg-negative-soft font-semibold text-negative hover:bg-negative/20`;
export const btnGhostDanger =
  `${btnBase} w-full font-medium text-negative hover:bg-negative-soft`;

export const inputCls =
  "h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:border-accent-primary focus:outline-none disabled:opacity-40";

export const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";
