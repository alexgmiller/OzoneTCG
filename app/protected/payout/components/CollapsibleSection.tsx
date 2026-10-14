"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MoneyDisplay, type MoneyTone } from "@/components/ui";
import { cn } from "@/lib/utils";

// ── Collapsible ledger section ──
// The header row is the tap target (min-h-12); rows render underneath.

export function CollapsibleSection({
  title,
  count,
  subtotal,
  tone = "neutral",
  hint,
  children,
}: {
  title: string;
  count: number;
  subtotal: number;
  tone?: MoneyTone;
  hint?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors duration-150 hover:bg-muted"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronDown
            size={16}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-150",
              !open && "-rotate-90",
            )}
          />
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            ({count})
          </span>
        </span>
        <MoneyDisplay
          amount={subtotal}
          tone={tone}
          className={cn("shrink-0 text-sm font-semibold", tone === "neutral" && "text-foreground")}
        />
      </button>

      {open && hint && <p className="px-4 pb-3 text-xs text-muted-foreground">{hint}</p>}
      {open && children}
    </div>
  );
}

// ── Ledger row: label + sub on the left, amount (+ optional action) on the right ──

export function LedgerRow({
  label,
  sub,
  amount,
  tone = "neutral",
  action,
}: {
  label: string;
  sub: React.ReactNode;
  amount: number;
  tone?: MoneyTone;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      <MoneyDisplay
        amount={amount}
        tone={tone}
        className={cn("shrink-0 font-medium", tone === "neutral" && "text-foreground")}
      />
      {action}
    </div>
  );
}
