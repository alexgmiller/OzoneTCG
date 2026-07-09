"use client";

import { useState, useEffect, useRef } from "react";
import { searchCatalog, isCatalogReady } from "@/lib/clientCardCatalog";

export type AutocompleteCard = {
  name: string;
  setName: string;
  cardNumber: string;
  imageUrl: string | null;
  market: number | null;
  cardId?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (card: AutocompleteCard) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

export default function CardAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  onKeyDown,
}: Props) {
  const [suggestions, setSuggestions] = useState<AutocompleteCard[]>([]);
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const [focused, setFocused]         = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Server-response cache (stale-while-revalidate)
  const cacheRef     = useRef<Map<string, AutocompleteCard[]>>(new Map());

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setHighlightIdx(-1);

    if (!focused || value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const q = value.trim();

    // 1. Try local catalog first (synchronous, <10ms)
    if (isCatalogReady()) {
      if (process.env.NODE_ENV === "development") performance.mark("card-search-start");
      const local = searchCatalog(q, 10);
      if (local.length > 0) {
        setSuggestions(local);
        setOpen(true);
        setLoading(false);
        if (process.env.NODE_ENV === "development") {
          performance.mark("card-search-results");
          performance.measure("card-search (catalog)", "card-search-start", "card-search-results");
        }
        return;
      }
    }

    // 2. Check server-response cache (stale-while-revalidate)
    const cached = cacheRef.current.get(q);
    if (cached) {
      setSuggestions(cached);
      setOpen(cached.length > 0);
      // Still revalidate in background to freshen the cache
      void fetchFromServer(q, /* updateUI */ false);
      return;
    }

    // 3. No local results, no cache — show skeleton + fetch from server
    setLoading(true);
    if (process.env.NODE_ENV === "development") performance.mark("card-search-start");

    timerRef.current = setTimeout(() => void fetchFromServer(q, /* updateUI */ true), 100);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  async function fetchFromServer(q: string, updateUI: boolean) {
    try {
      const res  = await fetch("/api/search-cards", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ query: q }),
      });
      const json  = await res.json();
      const cards: AutocompleteCard[] = json.cards?.slice(0, 10) ?? [];
      cacheRef.current.set(q, cards);
      if (updateUI) {
        setSuggestions(cards);
        setOpen(cards.length > 0);
        if (process.env.NODE_ENV === "development") {
          performance.mark("card-search-results");
          performance.measure("card-search (server)", "card-search-start", "card-search-results");
          const m = performance.getEntriesByName("card-search (server)").at(-1);
          if (m) console.debug(`[perf] card-search (server): ${m.duration.toFixed(1)}ms`);
        }
      }
    } catch {
      // silent
    } finally {
      if (updateUI) setLoading(false);
    }
  }

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function handleSelect(card: AutocompleteCard) {
    setOpen(false);
    setSuggestions([]);
    setHighlightIdx(-1);
    onSelect(card);
    // Background price fetch if not included
    if (card.cardId && card.market == null) {
      fetch("/api/card-price", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ cardId: card.cardId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.market != null) onSelect({ ...card, market: data.market });
        })
        .catch(() => {});
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Enter" && highlightIdx >= 0) {
        e.preventDefault();
        handleSelect(suggestions[highlightIdx]);
        return;
      }
    }
    if (e.key === "Escape") {
      setOpen(false);
      setHighlightIdx(-1);
    }
    onKeyDown?.(e);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setOpen(false); }}
        onKeyDown={handleKeyDown}
      />

      {/* Skeleton loading rows */}
      {loading && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-xl shadow-xl overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 animate-pulse">
              <div className="h-10 w-7 bg-muted rounded shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-2.5 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {open && !loading && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-xl shadow-xl overflow-hidden max-h-96 overflow-y-auto">
          {suggestions.map((card, i) => (
            <button
              key={i}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(card); }}
              onMouseEnter={() => setHighlightIdx(i)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b last:border-0 transition-colors duration-150 ${
                i === highlightIdx ? "bg-muted/80" : "hover:bg-muted/60"
              }`}
            >
              {card.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt="" className="h-10 w-7 object-contain shrink-0 rounded" />
              ) : (
                <div className="h-10 w-7 bg-muted rounded shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{card.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {card.setName}
                  {card.cardNumber && ` · #${card.cardNumber}`}
                </div>
              </div>
              {card.market != null && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                  ${card.market.toFixed(2)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
