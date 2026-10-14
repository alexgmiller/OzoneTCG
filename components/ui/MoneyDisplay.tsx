import { cn } from "@/lib/utils";

export type MoneyTone = "auto" | "positive" | "negative" | "neutral";

// ── MoneyDisplay ──
// Canonical currency value: tabular nums, sign prefix, tone colour.
// tone="auto" (default): negative → rose, positive → emerald, zero → neutral.
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
    <span className={cn("font-mono tabular-nums", toneClass, className)}>
      {prefix}${body}
    </span>
  );
}
