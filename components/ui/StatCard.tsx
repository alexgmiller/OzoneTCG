import { cn } from "@/lib/utils";
import { MoneyDisplay } from "./MoneyDisplay";

// ── StatCard ──
// Primary stat tile for headers, deal summaries, dashboards. Wire `money` for
// tabular-nums + sign for free; wire `value` for any other node.
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
          : "bg-card border-border";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      type={onClick ? "button" : undefined}
      className={cn(
        "group flex w-full flex-col gap-1.5 rounded-xl border p-4 text-left",
        "transition-colors duration-150",
        onClick && "hover:bg-muted",
        toneBg,
        className,
      )}
    >
      <span className="w-full font-mono text-xs uppercase tracking-[0.12em] text-neutral sm:tracking-[0.16em]">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {money != null ? <MoneyDisplay amount={money} tone="neutral" className="text-foreground" /> : value}
      </span>
      <div className="min-h-4">
        {delta ? <span className="text-xs text-neutral">{delta}</span> : null}
      </div>
    </Wrapper>
  );
}
