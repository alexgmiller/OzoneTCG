import { cn } from "@/lib/cn";

/**
 * SectionHeader — uppercase mono label used above lists, sections, panels.
 *
 * USE when you need a short categorical label that introduces a block of content.
 * DON'T use as a page title (use a real heading) or inside dense table cells.
 */
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
