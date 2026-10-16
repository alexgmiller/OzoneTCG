import { cn } from "@/lib/utils";

// ── CountStat ──
// A muted label over a big number, no card background (Raw | Graded | Sealed).
type Props = { label: string; value: number | string; className?: string };

export function CountStat({ label, value, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <span className="section-label">{label}</span>
      <span className="text-xl font-bold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// ── CountStatRow ──
export function CountStatRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-3", className)}>{children}</div>;
}
