"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

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
        className="opacity-40 hover:opacity-70 transition-opacity duration-150 ml-1"
        aria-label="More info"
      >
        <Info size={12} />
      </button>
      {open && (
        <div
          className="absolute left-5 top-0 z-[70] w-56 rounded-xl border border-white/10 bg-slate-900 p-3 shadow-lg"
          style={{ background: "rgba(15,23,42,0.97)" }}
        >
          <p className="text-xs leading-relaxed opacity-75">{content}</p>
        </div>
      )}
    </div>
  );
}
