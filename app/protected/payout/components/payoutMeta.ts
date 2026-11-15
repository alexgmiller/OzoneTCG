import type { MoneyTone } from "@/components/ui";

// ── Formatting ──

export function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

// ── Net payout direction ──
// net > 0 → Alex pays Mila (cash out from Alex's side, negative tone).
// net < 0 → Mila pays Alex. |net| under a cent → break even.

export type NetSide = "alex" | "mila" | "even";

export function netSide(net: number): NetSide {
  if (Math.abs(net) < 0.01) return "even";
  return net > 0 ? "alex" : "mila";
}

export const NET_TONE: Record<NetSide, MoneyTone> = {
  alex: "negative",
  mila: "positive",
  even: "neutral",
};

export function netLabel(side: NetSide, verb = "pays") {
  if (side === "even") return "Break even";
  return side === "alex" ? `Alex ${verb} Mila` : `Mila ${verb} Alex`;
}
