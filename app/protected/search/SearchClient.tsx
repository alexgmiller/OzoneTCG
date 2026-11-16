"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CardTile, EmptyState, PageHeader, SearchBar, Skeleton } from "@/components/ui";
import { searchCatalog } from "./actions";
import type { CatalogCard } from "./catalog";
import CardDetailSheet from "./CardDetailSheet";

// ── Search ──
// Type a card name (plus set or number to narrow it); results come back as a
// grid of card art, best match first (cards with art ahead). Tapping a card
// opens its detail: market price, what you have in stock, and shortcuts.
// The query lives in ?q= so Back from Inventory or POS lands on the results.

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;
const GRID = "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7";

export default function SearchClient({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<CatalogCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<CatalogCard | null>(null);
  const latest = useRef(0);

  // Debounced search; a newer query wins over a slower older one
  useEffect(() => {
    const query = q.trim();
    const id = ++latest.current;
    if (query.length < MIN_CHARS) {
      setResults(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      router.replace(`/protected/search?q=${encodeURIComponent(query)}`, { scroll: false });
      try {
        const cards = await searchCatalog(query);
        if (id === latest.current) { setResults(cards); setFailed(false); }
      } catch {
        if (id === latest.current) { setResults(null); setFailed(true); }
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, router]);

  const query = q.trim();

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 py-4 lg:max-w-6xl">
      <PageHeader title="Search" meta="Every English Pokémon card, synced weekly" />

      <SearchBar
        value={q}
        onChange={setQ}
        onScan={() => router.push("/protected/scan")}
        placeholder="Card name, then set or number"
        autoFocus={!initialQuery}
        className="lg:max-w-2xl"
      />

      {query.length < MIN_CHARS ? (
        <EmptyState
          title="Search every card"
          hint="Try “charizard ex”, “umbreon 215” or “mew 151”. The camera icon opens the cert scanner."
          preview={
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[63/88] rounded-xl bg-surface-2" />
              ))}
            </div>
          }
        />
      ) : loading && !results ? (
        <div className={GRID} aria-busy>
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[63/88] rounded-2xl" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState title="Search didn't load" hint="Check your connection and try again." />
      ) : results && results.length === 0 ? (
        <EmptyState title="No cards match" hint="Try fewer words, or just the card name." />
      ) : results ? (
        <section className="space-y-3" aria-busy={loading}>
          <p className="text-xs tabular-nums text-muted-foreground">
            {results.length === 48 ? "Top 48 matches · add a set or number to narrow it" : `${results.length} ${results.length === 1 ? "card" : "cards"}`}
          </p>
          <div className={GRID}>
            {results.map((c) => (
              <CardTile
                key={c.id}
                name={c.name}
                setNumber={c.cardNumber ? `#${c.cardNumber}` : null}
                meta={c.setName}
                imageUrl={c.imageUrl}
                onClick={() => setOpen(c)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <CardDetailSheet card={open} onClose={() => setOpen(null)} />
    </div>
  );
}
