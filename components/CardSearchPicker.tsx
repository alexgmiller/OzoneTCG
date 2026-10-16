"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Modal, MoneyDisplay } from "@/components/ui";

export type CardSearchResult = {
  name: string;
  setName: string;
  cardNumber: string;
  imageUrl: string | null;
  market: number | null;
  cardId?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (card: CardSearchResult) => void;
  initialName?: string;
  initialSetName?: string;
  initialCardNumber?: string;
};

const fieldClass =
  "h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground";

// ── CardSearchPicker ──
// Modal card search (name / set / number / year) → picks a CardSearchResult.
export default function CardSearchPicker({
  open,
  onClose,
  onResult,
  initialName = "",
  initialSetName = "",
  initialCardNumber = "",
}: Props) {
  const [searchName, setSearchName] = useState(initialName);
  const [searchSet, setSearchSet] = useState(initialSetName);
  const [searchNumber, setSearchNumber] = useState(initialCardNumber);
  const [searchYear, setSearchYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearchName(initialName);
      setSearchSet(initialSetName);
      setSearchNumber(initialCardNumber);
      setSearchYear("");
      setResults([]);
      setSearched(false);
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    setResults([]);
    setSearched(false);
    setError(null);
    onClose();
  }

  async function search() {
    if (!searchName.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSearched(false);
    try {
      const res = await fetch("/api/search-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: searchName.trim(),
          setName: searchSet.trim() || undefined,
          cardNumber: searchNumber.trim() || undefined,
          year: searchYear.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Search failed");
      } else {
        setResults(json.cards ?? []);
        setSearched(true);
      }
    } catch {
      setError("Search failed — please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(card: CardSearchResult) {
    onResult(card);
    handleClose();
    // Background price fetch — if TCGdex has market data, fire a second onResult with it
    if (card.cardId && card.market == null) {
      fetch("/api/card-price", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.market != null) onResult({ ...card, market: data.market });
        })
        .catch(() => {});
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") search();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Find Card" className="flex max-h-full max-w-lg flex-col">
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
      >
        <X size={18} />
      </button>

      {/* Search form */}
      <div className="shrink-0 space-y-2 border-b border-border pb-3">
        <input
          className={fieldClass}
          placeholder="Card name *"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          onKeyDown={onEnter}
          autoFocus
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            className={fieldClass}
            placeholder="Set name"
            value={searchSet}
            onChange={(e) => setSearchSet(e.target.value)}
            onKeyDown={onEnter}
          />
          <input
            className={fieldClass}
            placeholder="Card #"
            value={searchNumber}
            onChange={(e) => setSearchNumber(e.target.value)}
            onKeyDown={onEnter}
          />
          <input
            className={fieldClass}
            placeholder="Year"
            inputMode="numeric"
            maxLength={4}
            value={searchYear}
            onChange={(e) => setSearchYear(e.target.value.replace(/\D/g, ""))}
            onKeyDown={onEnter}
          />
        </div>
        <button
          type="button"
          className="h-11 w-full rounded-lg bg-accent text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent disabled:opacity-40"
          onClick={search}
          disabled={loading || !searchName.trim()}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        {error && (
          <div className="rounded-lg border border-negative-border bg-negative-soft px-3 py-2 text-sm text-negative-strong dark:text-negative">
            {error}
          </div>
        )}

        {searched && results.length === 0 && !error && (
          <div className="space-y-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <div className="font-medium text-foreground">No cards found.</div>
            <div className="text-xs">
              Try a simpler name (e.g. &quot;Dark Blastoise&quot; rather than &quot;dark blastoise from team
              rocket&quot;), or leave the set and number fields empty for a broader search. Older or obscure
              sets may have limited coverage.
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {results.map((card, i) => (
              <button
                key={i}
                type="button"
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 text-left transition-colors duration-150 hover:border-accent-tint hover:bg-muted"
                onClick={() => handleSelect(card)}
              >
                {card.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="h-auto w-full rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex aspect-[5/7] w-full items-center justify-center rounded-lg bg-muted">
                    <span className="text-xs text-muted-foreground">No image</span>
                  </div>
                )}
                <div className="space-y-0.5">
                  <div className="line-clamp-2 text-xs font-semibold leading-tight text-foreground">{card.name}</div>
                  {card.setName && (
                    <div className="line-clamp-1 text-xs leading-tight text-muted-foreground">{card.setName}</div>
                  )}
                  <div className="flex items-center justify-between gap-1">
                    {card.cardNumber && (
                      <span className="font-mono text-xs text-muted-foreground">#{card.cardNumber}</span>
                    )}
                    {card.market != null && (
                      <MoneyDisplay amount={card.market} tone="neutral" className="text-xs font-medium text-foreground" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!searched && !loading && !error && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Enter a card name to search.
          </div>
        )}
      </div>
    </Modal>
  );
}
