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

// ── Frequency map — module-level cache shared across all instances ─────────────

type FreqEntry = { count: number; lastUsed: string; name: string };
type FreqMap = Record<string, FreqEntry>;

let freqMap: FreqMap = {};
let freqFetchedAt = 0;
const FREQ_TTL_MS = 5 * 60 * 1000; // refresh every 5 minutes

async function loadFreqMap(): Promise<void> {
  if (Date.now() - freqFetchedAt < FREQ_TTL_MS) return;
  try {
    const res = await fetch("/api/card-search-freq", { method: "GET" });
    if (!res.ok) return;
    const json = await res.json();
    freqMap = (json.frequencies as FreqMap) ?? {};
    freqFetchedAt = Date.now();
  } catch {
    // Offline / server error — keep the last cached map
  }
}

function recordSelection(card: AutocompleteCard) {
  const cardIdentifier = card.cardId ?? card.name;
  // Optimistically update the local cache so sorting improves immediately
  const existing = freqMap[cardIdentifier];
  freqMap = {
    ...freqMap,
    [cardIdentifier]: {
      count: (existing?.count ?? 0) + 1,
      lastUsed: new Date().toISOString(),
      name: card.name,
    },
  };
  // Fire-and-forget to the server — don't block the UI
  fetch("/api/card-search-freq", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cardIdentifier, cardName: card.name }),
  }).catch(() => {});
}

function freqBoostScore(card: AutocompleteCard): number {
  const key = card.cardId ?? card.name;
  const entry = freqMap[key];
  if (!entry) return 0;
  const ageMs = Date.now() - new Date(entry.lastUsed).getTime();
  const recencyBonus = ageMs < 24 * 60 * 60 * 1000 ? 20 : ageMs < 7 * 24 * 60 * 60 * 1000 ? 10 : 0;
  return entry.count * 10 + recencyBonus;
}

function sortByFrequency(cards: AutocompleteCard[]): AutocompleteCard[] {
  const hasBoost = cards.some((c) => freqBoostScore(c) > 0);
  if (!hasBoost) return cards;
  return [...cards].sort((a, b) => freqBoostScore(b) - freqBoostScore(a));
}

// Kick off the initial fetch as soon as this module loads on the client
if (typeof window !== "undefined") {
  loadFreqMap();
}

// ── Component ─────────────────────────────────────────────────────────────────

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
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Simple client-side cache: query → raw (unsorted) results
  const cacheRef = useRef<Map<string, AutocompleteCard[]>>(new Map());
  // Set to true immediately after a selection; reset when the user types new chars
  const justSelectedRef = useRef(false);
  // Tracks the last-selected card so the background price fetch doesn't fire stale
  const lastSelectedRef = useRef<{ cardId: string; name: string } | null>(null);

  // Kick off a freq-map refresh on mount (respects TTL — no-ops if fresh)
  useEffect(() => { loadFreqMap(); }, []);

  // When the user types something different from the selected card's name,
  // clear lastSelectedRef so the background price fetch won't fire stale.
  useEffect(() => {
    if (lastSelectedRef.current && value !== lastSelectedRef.current.name) {
      lastSelectedRef.current = null;
    }
  }, [value]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    // Stay closed after a selection — don't reopen from the parent's state
    // update that sets the input to the selected card name.
    if (justSelectedRef.current) return;

    if (value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const q = value.trim();

    // Return cached result immediately (re-sort in case freq map updated)
    if (cacheRef.current.has(q)) {
      const sorted = sortByFrequency(cacheRef.current.get(q)!);
      setSuggestions(sorted);
      setOpen(sorted.length > 0);
      return;
    }

    setLoading(true);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/search-cards", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const json = await res.json();
        const raw: AutocompleteCard[] = json.cards?.slice(0, 8) ?? [];
        cacheRef.current.set(q, raw);
        const sorted = sortByFrequency(raw);
        setSuggestions(sorted);
        setOpen(sorted.length > 0);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value]);

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
    justSelectedRef.current = true;
    lastSelectedRef.current = { cardId: card.cardId ?? "", name: card.name };
    recordSelection(card);
    onSelect(card);
    // Background price fetch if market not included
    if (card.cardId && card.market == null) {
      const selectedCardId = card.cardId;
      fetch("/api/card-price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.market != null && lastSelectedRef.current?.cardId === selectedCardId) {
            onSelect({ ...card, market: data.market });
          }
        })
        .catch(() => {});
    }
  }

  function handleChange(newValue: string) {
    // User typed manually — allow dropdown to open again
    justSelectedRef.current = false;
    onChange(newValue);
  }

  function handleBlur() {
    // Delay so onMouseDown on dropdown items fires before we close
    blurTimerRef.current = setTimeout(() => setOpen(false), 150);
  }

  function handleFocus() {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    // Re-open cached results if the user refocuses (but not after a selection)
    if (!justSelectedRef.current && value.trim().length >= 2) {
      const cached = cacheRef.current.get(value.trim());
      if (cached?.length) {
        setSuggestions(sortByFrequency(cached));
        setOpen(true);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          onKeyDown?.(e);
        }}
      />

      {loading && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-xl shadow-xl px-3 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin shrink-0" />
          Searching…
        </div>
      )}

      {open && !loading && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-xl shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((card, i) => (
            <button
              key={i}
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
