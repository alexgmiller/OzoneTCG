import * as React from "react";

import { cn } from "@/lib/utils";

// ── Form fields: Input, Textarea, Select ──
// One look for every text field. text-base on phones keeps iOS from zooming in
// on focus (it zooms below 16px); md+ drops to text-sm.
const FIELD =
  "w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base text-foreground " +
  "placeholder:text-muted-foreground transition-colors duration-150 focus:border-accent-primary " +
  "focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-11",
        FIELD,
        type === "number" && "tabular-nums",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn("py-3", FIELD, className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

// Native <select> so phones get their own picker.
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn("h-11", FIELD, className)} {...props} />
  ),
);
Select.displayName = "Select";

export { Input, Textarea, Select };
