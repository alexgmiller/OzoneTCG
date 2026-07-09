import { cn } from "@/lib/cn";

export type MoneyTone = "auto" | "positive" | "negative" | "neutral";

/**
 * MoneyDisplay — canonical way to render a currency value.
 *
 * Handles:
 *  - Tabular nums (never skip this — columns jitter without it)
 *  - Sign prefix (–$240, +$185)
 *  - Tone color-coding (rose/emerald/neutral per design-system §1)
 *
 * USE for every money value in the app: stats, deal totals, P&L, receipts.
 * DON'T format money inline with `toFixed()` + string concat — always use this.
 *
 * `tone="auto"` (default): negative amounts → rose, positive → emerald, zero → neutral.
 * Pass an explicit tone when the semantic meaning differs (e.g. an "expected cash"
 * total that's positive but shouldn't be green).
 */
export function MoneyDisplay({
  amount,
  tone = "auto",
  showSign = false,
  className,
}: {
  amount: number;
  tone?: MoneyTone;
  showSign?: boolean;
  className?: string;
}) {
  const resolved: Exclude<MoneyTone, "auto"> =
    tone === "auto"
      ? amount > 0
        ? "positive"
        : amount < 0
          ? "negative"
          : "neutral"
      : tone;

  const toneClass =
    resolved === "positive"
      ? "text-positive"
      : resolved === "negative"
        ? "text-negative"
        : "text-neutral";

  const abs = Math.abs(amount);
  const body = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2);
  const prefix = showSign ? (amount < 0 ? "–" : "+") : amount < 0 ? "–" : "";

  return (
    <span className={cn("font-mono tabular-nums", toneClass, className)}>
      {prefix}${body}
    </span>
  );
}
