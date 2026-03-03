"use client";

import { useState, useEffect } from "react";

export type CardSearchResult = {
  name: string;
  setName: string;
  cardNumber: string;
  imageUrl: string | null;
  market: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (card: CardSearchResult) => void;
  initialName?: string;
  initialSetName?: string;
  initialCardNumber?: string;
};

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

  if (!open) return null;

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
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-background border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">Find Card</h2>
          <button onClick={handleClose} className="text-sm text-muted-foreground hover:text-foreground px-1">
            ✕
          </button>
        </div>

        {/* Search form */}
        <div className="px-4 py-3 border-b shrink-0 space-y-2">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
            placeholder="Card name *"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            autoFocus
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Set name"
              value={searchSet}
              onChange={(e) => setSearchSet(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Card #"
              value={searchNumber}
              onChange={(e) => setSearchNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm bg-background"
              placeholder="Year (e.g. 2016)"
              maxLength={4}
              value={searchYear}
              onChange={(e) => setSearchYear(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <button
            className="w-full px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium disabled:opacity-40"
            onClick={search}
            disabled={loading || !searchName.trim()}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 p-3">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {searched && results.length === 0 && !error && (
            <div className="text-sm text-center text-muted-foreground py-10 space-y-1 px-4">
              <div>No cards found.</div>
              <div className="text-xs opacity-70">
                Try a simpler name (e.g. "Dark Blastoise" not "dark blastoise from team rocket"), or leave the set and number fields empty for a broader search. Older or obscure sets may have limited coverage.
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {results.map((card, i) => (
                <button
                  key={i}
                  className="flex flex-col gap-1.5 border rounded-xl p-2 hover:border-foreground hover:bg-muted/40 transition-colors text-left"
                  onClick={() => handleSelect(card)}
                >
                  {card.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-full h-auto rounded-lg object-contain"
                    />
                  ) : (
                    <div className="w-full aspect-[5/7] rounded-lg bg-muted/30 flex items-center justify-center">
                      <span className="text-xs opacity-30">No image</span>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold leading-tight line-clamp-2">{card.name}</div>
                    {card.setName && (
                      <div className="text-xs text-muted-foreground leading-tight line-clamp-1">{card.setName}</div>
                    )}
                    <div className="flex items-center justify-between gap-1">
                      {card.cardNumber && (
                        <span className="text-xs text-muted-foreground">#{card.cardNumber}</span>
                      )}
                      {card.market != null && (
                        <span className="text-xs font-medium text-green-700">${card.market.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searched && !loading && !error && (
            <div className="text-sm text-center text-muted-foreground py-10">
              Enter a card name to search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
