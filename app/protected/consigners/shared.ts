// ── Types ──

export type SoldItem = {
  id: string;
  name: string;
  sold_price: number | null;
  consigner_payout: number | null;
  sold_at: string | null;
  set_name: string | null;
  card_number: string | null;
};

export type PayoutRecord = {
  id: string;
  amount: number;
  payment_method: string | null;
  date: string;
  notes: string | null;
};

export type Consigner = {
  id: string;
  name: string;
  rate: number;
  phone: string | null;
  notes: string | null;
  token: string;
  created_at: string;
  active_count: number;
  active_market_value: number;
  sold_count: number;
  sold_revenue: number;
  pending_payout: number;
  total_paid_out: number;
  sales: SoldItem[];
  payouts: PayoutRecord[];
};

// ── Helpers ──

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function portalUrl(token: string) {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/consigner/${token}`;
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

// ── Shared label class (controls come from @/components/ui) ──

export const FIELD_LABEL = "block text-xs font-medium text-muted-foreground";
