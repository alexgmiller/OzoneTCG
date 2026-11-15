import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ── Badge ──
// Read-only status pill. Tone follows the color semantics in design-system §1.
// For a tappable pill use <Chip />.
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        accent: "border-accent-primary-border bg-accent-primary-soft text-accent-primary",
        positive: "border-positive-border bg-positive-soft text-positive",
        warning: "border-warning-border bg-warning-soft text-warning",
        negative: "border-negative-border bg-negative-soft text-negative",
      },
      // mono = uppercase mono label style (status pills like "Live", "Completed")
      mono: { true: "font-mono uppercase tracking-wide", false: "" },
    },
    defaultVariants: { tone: "neutral", mono: false },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, mono, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, mono }), className)} {...props} />;
}

export { Badge, badgeVariants };
