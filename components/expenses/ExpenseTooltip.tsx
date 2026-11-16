"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

// ── Inline info tooltip (tap to toggle, tap outside to close) ─────────────────

export function ExpenseTooltip({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="-my-3 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground"
        aria-label="More info"
      >
        <Info size={14} />
      </button>
      {open && (
        <div className="absolute left-8 top-0 z-10 w-56 rounded-xl border border-border bg-card p-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{content}</p>
        </div>
      )}
    </div>
  );
}
