// Shared constants, date helpers and activity colors for the calendar UI.

export type ViewMode = "week" | "month";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Activity colors (semantic tokens) ─────────────────────────────────────────

export type ActivityKind = "buy" | "sell" | "trade" | "show" | "expense";

export const DOT_BG: Record<ActivityKind, string> = {
  buy: "bg-negative",
  sell: "bg-positive",
  trade: "bg-accent-primary",
  show: "bg-warning",
  expense: "bg-neutral",
};

export const KIND_TEXT: Record<ActivityKind, string> = {
  buy: "text-negative",
  sell: "text-positive",
  trade: "text-accent-primary",
  show: "text-warning",
  expense: "text-muted-foreground",
};

// ── Date helpers ──────────────────────────────────────────────────────────────

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
export function fmtLongDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
export function fmtShortDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString([], { month: "long", day: "numeric" });
}
export function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function getSundayOfWeek(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}
export function isFuture(dateStr: string, todayStr: string) {
  return dateStr > todayStr;
}
export function truncateName(name: string, maxLen: number) {
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}
export function pad2(n: number) {
  return String(n).padStart(2, "0");
}
