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
  scheduled: { label: "Scheduled", cls: "bg-surface-2 text-muted-foreground" },
  active: { label: "Live", cls: "bg-accent-tint text-accent" },
  completed: { label: "Completed", cls: "bg-surface-2 text-muted-foreground" },
};

// ── Classes ───────────────────────────────────────────────────────────────────

export const pillCls = "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium";

const btnBase =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm whitespace-nowrap " +
  "transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none";

export const btnPrimary = `${btnBase} bg-accent font-semibold text-bg`;
export const btnSecondary = `${btnBase} bg-surface-2 font-medium text-foreground hover:bg-surface`;
export const btnDanger = `${btnBase} bg-down-tint font-semibold text-down`;
export const btnGhostDanger = `${btnBase} w-full font-medium text-down hover:bg-down-tint`;

export const inputCls =
  "h-11 w-full min-w-0 rounded-xl bg-surface-2 px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40";

export const labelCls = "section-label mb-1 block";
