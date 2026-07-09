import { cn } from "@/lib/cn";

/**
 * EmptyState — ghost preview + starter CTA for empty lists.
 *
 * USE whenever a list, grid, or feed has no items.
 * DON'T just render "No items yet." — always include a `preview` or `cta`
 *   so the user understands what belongs here and how to create it.
 *
 * Pattern: title + one-line hint + (optional ghost preview) + (optional CTA).
 */
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
        "flex flex-col items-stretch rounded-xl border border-white/[0.06] bg-white/[0.02] p-5",
        className,
      )}
    >
      <div className="text-center">
        <div className="text-base font-semibold tracking-tight text-white">
          {title}
        </div>
        {hint ? (
          <div className="mt-1 text-sm text-neutral">{hint}</div>
        ) : null}
      </div>
      {preview ? (
        <div className="mt-4 opacity-55">{preview}</div>
      ) : null}
      {cta ? <div className="mt-4">{cta}</div> : null}
    </div>
  );
}
