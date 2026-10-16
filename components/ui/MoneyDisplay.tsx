import { cn } from "@/lib/utils";

export type MoneyTone = "auto" | "positive" | "negative" | "neutral";

// ── MoneyDisplay ──
// Canonical currency value: tabular nums, sign prefix, tone colour. Prices
// are set in the UI face (Lexend); callers choose the weight. Space Mono is
// for small muted metadata only (design-system §3).
// tone="auto" (default): negative → down, positive → up, zero → neutral.
// Pass an explicit tone when the meaning differs (e.g. expected cash isn't "profit").
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
    <span className={cn("tabular-nums", toneClass, className)}>
      {prefix}${body}
    </span>
  );
}
