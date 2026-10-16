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

// ── Shared control classes (h-11 tap targets, token colors only) ──

export const BTN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium " +
  "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";

export const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-accent`;
export const BTN_SOFT =
  `${BTN} border border-accent-tint bg-accent-tint text-accent hover:bg-accent-tint`;
export const BTN_OUTLINE =
  `${BTN} border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground`;

export const TEXTAREA =
  "w-full rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground outline-none transition-colors duration-150 focus:border-accent " +
  "disabled:opacity-50";
