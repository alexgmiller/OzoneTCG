import { cn } from "@/lib/utils";

// ── SectionHeader ──
// Uppercase mono label above lists, sections, panels. Not a page title.
export function SectionHeader({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-neutral">
        {children}
      </span>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
