import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

// ── Button ──
// The only button. Every size is at least h-11: big tap targets on a show floor.
// Links that look like buttons: <Button asChild><Link href=…>…</Link></Button>.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary font-semibold text-primary-foreground hover:bg-accent-primary-hover",
        secondary:
          "border border-accent-primary-border bg-accent-primary-soft text-accent-primary hover:bg-accent-primary/20",
        outline: "border border-border bg-card text-foreground hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive:
          "border border-negative-border bg-negative-soft font-semibold text-negative hover:bg-negative/20",
        "destructive-ghost": "text-negative hover:bg-negative-soft",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-11 px-3",
        lg: "h-12 px-5 text-base",
        icon: "h-11 w-11 rounded-full",
      },
    },
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows an inline spinner and disables the button. Ignored with asChild. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, type, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {/* An icon button swaps its icon for the spinner; a labelled one keeps the label */}
        {loading && size === "icon" ? null : children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
