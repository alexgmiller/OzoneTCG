import { cn } from "@/lib/cn";
import { MoneyDisplay } from "./MoneyDisplay";

/**
 * StatCard — primary stat tile used in headers, deal summaries, dashboards.
 *
 * USE for a single named value that the user glances at (totals, counts, P&L).
 * DON'T use inside dense rows — use plain text + MoneyDisplay there.
 * DON'T stack >3 in a row — split into a second row or drop to a list.
 *
 * Wire `money` with a numeric amount to get tabular-nums + sign + color for free.
 * Wire `value` to render any other ReactNode (counts, time-to-next-show, etc).
 */
export function StatCard({
  label,
  value,
  money,
  delta,
  tone,
  className,
  onClick,
}: {
  label: string;
  value?: React.ReactNode;
  money?: number;
  delta?: React.ReactNode;
  tone?: "default" | "accent" | "warning" | "positive";
  className?: string;
  onClick?: () => void;
}) {
  const toneBg =
    tone === "accent"
      ? "bg-accent-primary-soft border-accent-primary-border"
      : tone === "warning"
        ? "bg-warning-soft border-warning-border"
        : tone === "positive"
          ? "bg-positive-soft border-positive-border"
          : "bg-white/[0.02] border-white/[0.06]";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col gap-1.5 rounded-xl border p-4 text-left",
        "transition-colors duration-150",
        onClick && "hover:bg-white/[0.04]",
        toneBg,
        className,
      )}
    >
      <span className="font-mono text-xs uppercase tracking-[0.12em] sm:tracking-[0.16em] text-neutral w-full">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums tracking-tight text-white">
        {money != null ? <MoneyDisplay amount={money} tone="neutral" /> : value}
      </span>
      <div className="min-h-4">
        {delta ? <span className="text-xs text-neutral">{delta}</span> : null}
      </div>
    </Wrapper>
  );
}
