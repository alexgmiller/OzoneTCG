import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// ── PageHeader ──
// Top of every protected page: optional back link, title (+ badge beside it),
// optional meta line, optional actions on the right.
export function PageHeader({
  title,
  meta,
  badge,
  actions,
  back,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Status pill shown next to the title, outside the <h1> */
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cn("space-y-1", className)}>
      {back && (
        <Link
          href={back.href}
          className="-ml-1 inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <ChevronLeft size={16} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            {badge}
          </div>
          {meta != null && meta !== false && (
            <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{meta}</div>
          )}
        </div>
        {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
