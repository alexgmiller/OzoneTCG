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

// Rendered with <Badge mono tone={…}>
export const STATUS_PILL: Record<ShowStatus, { label: string; tone: "accent" | "warning" | "neutral" }> = {
  scheduled: { label: "Scheduled", tone: "accent" },
  active: { label: "Live", tone: "warning" },
  completed: { label: "Completed", tone: "neutral" },
};

// ── Classes ───────────────────────────────────────────────────────────────────

export const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";
