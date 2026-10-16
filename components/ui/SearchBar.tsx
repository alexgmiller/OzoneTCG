"use client";

import { Camera, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── SearchBar ──
// Rounded-full field with a trailing camera icon that opens the cert scanner.
type Props = {
  value: string;
  onChange: (v: string) => void;
  onScan?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

export function SearchBar({ value, onChange, onScan, placeholder = "Search", autoFocus, className }: Props) {
  return (
    <div className={cn("relative flex h-11 items-center rounded-full bg-surface-2", className)}>
      <Search size={18} className="pointer-events-none absolute left-3.5 text-muted-foreground" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={placeholder}
        className="h-full w-full bg-transparent pl-10 pr-20 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-1.5 flex items-center gap-0.5">
        {value && (
          <button type="button" onClick={() => onChange("")} aria-label="Clear" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        )}
        {onScan && (
          <button type="button" onClick={onScan} aria-label="Scan cert" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <Camera size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
