"use client";

import { useState, useEffect, useRef } from "react";

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
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!focused || value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/search-cards", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: value.trim() }),
        });
        const json = await res.json();
        const cards: AutocompleteCard[] = json.cards?.slice(0, 12) ?? [];
        setSuggestions(cards);
        setOpen(cards.length > 0);
      } catch {
        // silent
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, focused]);

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
    onSelect(card);
    // Background price fetch if not included
    if (card.cardId && card.market == null) {
      fetch("/api/card-price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId }),
      })
        .then((r) => r.json())
        .then((data) => { if (data.market != null) onSelect({ ...card, market: data.market }); })
        .catch(() => {});
    }
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
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          onKeyDown?.(e);
        }}
      />

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((card, i) => (
            <button
              key={i}
              // onMouseDown prevents input blur before click fires
              onMouseDown={(e) => { e.preventDefault(); handleSelect(card); }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/60 text-left border-b last:border-0 transition-colors"
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
                <span className="text-xs font-medium text-green-700 shrink-0">${card.market.toFixed(2)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
