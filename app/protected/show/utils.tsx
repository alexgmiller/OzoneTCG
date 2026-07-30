import React from "react";
import type { ShowScanEntry, InventorySearchResult } from "./actions";
import type { FeedEntry, GradeCompany, SortBy, PriceRange, TradeComingIn } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

export const BUY_PCTS = [70, 75, 80, 85, 90];

export const GRADE_COMPANIES_LIST: GradeCompany[] = ["PSA", "BGS", "CGC", "TAG"];
export const GRADE_OPTIONS: Record<GradeCompany, string[]> = {
  PSA:  ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"],
  BGS:  ["10 Black Label", "10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5"],
  CGC:  ["10 Perfect", "10 Pristine", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5"],
  TAG:  ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4"],
};
export const CONDITIONS_LIST = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"] as const;
export const COND_ABBREV: Record<string, string> = { "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", "Damaged": "DMG" };
export const PRODUCT_TYPES_LIST = ["Booster Box", "ETB", "Booster Bundle", "Tin", "Collection Box", "Booster Pack", "Case", "Other"] as const;

export const EXPENSE_CATEGORIES = [
  { value: "table", label: "Table fee" },
  { value: "travel", label: "Travel / gas" },
  { value: "hotel", label: "Hotel" },
  { value: "food", label: "Food" },
  { value: "supplies", label: "Supplies" },
  { value: "other", label: "Other" },
];
export const STORAGE_KEY = "ozone_active_show_session_id";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function money(v: number | null) {
  if (v == null) return "—";
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** Like money() but preserves the sign — negative shows as -$XX.XX */
export function moneyCash(v: number | null) {
  if (v == null) return "—";
  const abs = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-$${abs}` : `$${abs}`;
}
export function moneySign(v: number) {
  return (v >= 0 ? "+" : "−") + `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
export function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// ── FeedEntry mapping ─────────────────────────────────────────────────────────

export function scanToFeed(s: ShowScanEntry): FeedEntry {
  const kind =
    s.action === "bought" ? "buy"
    : s.action === "sold" ? "sell"
    : s.action === "trade" ? "trade"
    : s.action === "expense" ? "expense"
    : "pass";

  let amount: number | null = null;
  let label = s.card_name ?? "—";
  let sub: string | undefined;

  if (kind === "buy") {
    const cost =
      s.market_price != null && s.buy_percentage != null
        ? s.market_price * s.buy_percentage / 100
        : s.market_price;
    amount = cost != null ? -cost : null;
    sub = s.grade
      ? `${s.grade}${s.buy_percentage ? ` · ${s.buy_percentage}%` : ""}`
      : s.buy_percentage ? `${s.buy_percentage}%` : undefined;
  } else if (kind === "sell") {
    amount = s.market_price != null ? s.market_price : null;
  } else if (kind === "trade") {
    const m = s.notes?.match(/Cash (received|paid): \$([\d.]+)/);
    if (m) {
      const v = parseFloat(m[2]);
      amount = m[1] === "received" ? v : -v;
    }
    // Strip embedded undo data before displaying
    const displayNotes = s.notes?.replace(/\|\|__UNDO__.+$|^__UNDO__.+$/, "").trim();
    sub = displayNotes || undefined;
  } else if (kind === "expense") {
    amount = s.market_price != null ? -s.market_price : null;
  } else {
    sub = s.grade ?? undefined;
  }

  return { id: s.id, kind, time: s.scanned_at, label, sub, amount, photoUrl: s.deal_photo_url, batchId: s.batch_id };
}

// ── Inventory search scoring ──────────────────────────────────────────────────

/** Split query into normalised terms (strips punctuation, lowercases). */
export function queryTerms(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[',\-\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 0);
}

function scoreInventoryItem(item: InventorySearchResult, terms: string[]): number {
  if (!terms.length) return 1;
  const name  = item.name.toLowerCase();
  const set   = (item.set_name    ?? "").toLowerCase();
  const num   = (item.card_number ?? "").toLowerCase().replace(/^0+/, "");
  const grade = (item.grade       ?? "").toLowerCase();
  const cond  = (item.condition   ?? "").toLowerCase();
  let score = 0;
  for (const term of terms) {
    const numTerm = term.replace(/^0+/, "");
    if (name.includes(term))                               score += 3;
    if (set.includes(term))                                score += 2;
    if (numTerm && num === numTerm)                        score += 4; // exact card #
    else if (numTerm && /^\d/.test(numTerm) && num.startsWith(numTerm)) score += 3;
    if (grade.includes(term) || cond.includes(term))      score += 1;
  }
  return score;
}

export function filterInventory(
  items: InventorySearchResult[],
  query: string
): InventorySearchResult[] {
  const terms = queryTerms(query);
  if (!terms.length) return items;
  return items
    .map((item) => ({ item, score: scoreInventoryItem(item, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

export function applyInventoryFilters(
  items: InventorySearchResult[],
  sortBy: SortBy,
  priceRange: PriceRange
): InventorySearchResult[] {
  // Price filter — items with no market price pass through unconditionally
  let result = items;
  if (priceRange !== "all") {
    result = items.filter((i) => {
      const p = i.market;
      if (p == null) return true;
      if (priceRange === "under25")   return p < 25;
      if (priceRange === "25to100")   return p >= 25 && p <= 100;
      if (priceRange === "100to500")  return p > 100 && p <= 500;
      if (priceRange === "over500")   return p > 500;
      return true;
    });
  }

  // Sort ("recent" keeps original DB order)
  if (sortBy === "name") {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "price-high") {
    result = [...result].sort((a, b) => (b.market ?? -1) - (a.market ?? -1));
  } else if (sortBy === "price-low") {
    result = [...result].sort((a, b) => (a.market ?? Infinity) - (b.market ?? Infinity));
  }

  return result;
}

// ── Term highlighting ─────────────────────────────────────────────────────────

export function HighlightTerms({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      ranges.push([idx, idx + term.length]);
      idx = lower.indexOf(term, idx + 1);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (pos < s) parts.push(<span key={`t${pos}`}>{text.slice(pos, s)}</span>);
    parts.push(<span key={`h${s}`} style={{ color: "var(--accent-primary)", fontWeight: 600 }}>{text.slice(s, e)}</span>);
    pos = e;
  }
  if (pos < text.length) parts.push(<span key={`t${pos}`}>{text.slice(pos)}</span>);
  return <>{parts}</>;
}

// ── Trade tab helpers ─────────────────────────────────────────────────────────

export function blankTradeComingIn(): TradeComingIn {
  return { _id: crypto.randomUUID(), name: "", grade: "", marketPrice: "" };
}
