import { cn } from "@/lib/utils";

// ── EmptyState ──
// Title + hint + optional ghost preview + optional CTA. Never just "No items yet."
export function EmptyState({
  title,
  hint,
  preview,
  cta,
  className,
}: {
  title: string;
  hint?: string;
  preview?: React.ReactNode;
  cta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-stretch rounded-xl border border-border bg-card p-5",
        className,
      )}
    >
      <div className="text-center">
        <div className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </div>
        {hint ? (
          <div className="mt-1 text-sm text-muted-foreground">{hint}</div>
        ) : null}
      </div>
      {preview ? (
        <div className="mt-4 opacity-55">{preview}</div>
      ) : null}
      {cta ? <div className="mt-4">{cta}</div> : null}
    </div>
  );
}
