"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History, X } from "lucide-react";
import { CardTile, Chip, ChipRow, EmptyState, PageHeader, SearchBar, Skeleton } from "@/components/ui";
import { searchCatalog, stockCounts } from "./actions";
import { pushRecent, setFacets, sortCards, SORTS, type CatalogCard, type SortKey } from "./catalog";
import SearchSuggest, { optionId, SUGGEST_LIMIT } from "./SearchSuggest";
import CardDetailSheet from "./CardDetailSheet";

// ── Search ──
// Typing shows a dropdown of the top matches (tap one to open it). Enter, or
// "See all results", shows the full grid for that query: count, a set filter
// built from the results, sort, and tiles with the art uncovered and the set,
// name, number and your stock underneath. Before any search, recent searches
// (this device) are one tap away. ?q= holds the submitted query so Back from
// Inventory or POS returns to the results.

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;
const RECENT_KEY = "ozone.search.recent";
const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const SELECT = "h-11 min-w-0 rounded-xl bg-surface-2 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent";

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]; } catch { return []; }
}
function writeRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* per-device nicety */ }
}

export default function SearchClient({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const listId = useId();

  // ── Query state ──
  const [q, setQ] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery.trim());
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);

  // ── Data ──
  // One request per query string, shared by the dropdown and the grid
  const cache = useRef(new Map<string, Promise<CatalogCard[]>>());
  const fetchCards = useCallback((query: string) => {
    let p = cache.current.get(query);
    if (!p) {
      p = searchCatalog(query);
      p.catch(() => cache.current.delete(query));
      cache.current.set(query, p);
    }
    return p;
  }, []);

  const [suggest, setSuggest] = useState<{ query: string; cards: CatalogCard[] | null }>({ query: "", cards: null });
  const [results, setResults] = useState<{ query: string; cards: CatalogCard[] | null; failed: boolean }>({ query: "", cards: null, failed: false });
  const [stock, setStock] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<SortKey>("best");
  const [setFilter, setSetFilter] = useState("");
  const [open, setOpen] = useState<CatalogCard | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { setRecent(readRecent()); }, []);

  // Dropdown: debounced while typing
  const typed = q.trim();
  const showSuggest = focused && typed.length >= MIN_CHARS && typed !== submitted;
  useEffect(() => {
    if (!showSuggest) return;
    setActive(-1);
    setSuggest((s) => (s.query === typed ? s : { query: typed, cards: null }));
    const timer = setTimeout(() => {
      fetchCards(typed)
        .then((cards) => setSuggest((s) => (s.query === typed ? { query: typed, cards } : s)))
        .catch(() => setSuggest((s) => (s.query === typed ? { query: typed, cards: [] } : s)));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, showSuggest, fetchCards]);

  // Grid: the submitted query
  useEffect(() => {
    if (submitted.length < MIN_CHARS) return;
    let live = true;
    setResults({ query: submitted, cards: null, failed: false });
    setSort("best");
    setSetFilter("");
    setStock({});
    fetchCards(submitted)
      .then((cards) => {
        if (!live) return;
        setResults({ query: submitted, cards, failed: false });
        stockCounts(cards).then((s) => { if (live) setStock(s); }).catch(() => {});
      })
      .catch(() => { if (live) setResults({ query: submitted, cards: null, failed: true }); });
    return () => { live = false; };
  }, [submitted, fetchCards]);

  function submit(query: string) {
    const t = query.trim();
    if (t.length < MIN_CHARS) return;
    setQ(t);
    setSubmitted(t);
    setFocused(false);
    router.replace(`/protected/search?q=${encodeURIComponent(t)}`, { scroll: false });
    const next = pushRecent(readRecent(), t);
    writeRecent(next);
    setRecent(next);
  }

  function clearAll() {
    setQ("");
    setSubmitted("");
    router.replace("/protected/search", { scroll: false });
  }

  const suggestions = suggest.cards?.slice(0, SUGGEST_LIMIT) ?? null;
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = suggestions?.length ?? 0;
    if (e.key === "ArrowDown" && showSuggest && n) { e.preventDefault(); setActive((i) => (i + 1) % n); }
    else if (e.key === "ArrowUp" && showSuggest && n) { e.preventDefault(); setActive((i) => (i <= 0 ? n - 1 : i - 1)); }
    else if (e.key === "Escape") { setFocused(false); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (showSuggest && active >= 0 && suggestions?.[active]) { setOpen(suggestions[active]); setFocused(false); }
      else submit(q);
    }
  }

  // ── Results view ──
  const cards = useMemo(() => results.cards ?? [], [results.cards]);
  const facets = useMemo(() => setFacets(cards), [cards]);
  const shown = useMemo(
    () => sortCards(setFilter ? cards.filter((c) => c.setName === setFilter) : cards, sort),
    [cards, setFilter, sort],
  );

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 py-4 lg:max-w-6xl">
      <PageHeader title="Search" meta="Every English Pokémon card, synced weekly" />

      {/* ── Search bar + dropdown ── */}
      <div className="relative lg:max-w-2xl">
        <SearchBar
          value={q}
          onChange={(v) => { setQ(v); setFocused(true); if (!v.trim()) clearAll(); }}
          onScan={() => router.push("/protected/scan")}
          placeholder="Card name, then set or number"
          autoFocus={!initialQuery}
          inputProps={{
            role: "combobox",
            "aria-expanded": showSuggest,
            "aria-controls": listId,
            "aria-autocomplete": "list",
            "aria-activedescendant": showSuggest && active >= 0 ? optionId(listId, active) : undefined,
            onKeyDown,
            onFocus: () => setFocused(true),
            onBlur: () => setFocused(false),
          }}
        />
        {showSuggest && (
          <SearchSuggest
            id={listId}
            query={typed}
            cards={suggestions}
            total={suggest.cards?.length ?? 0}
            active={active}
            onHover={setActive}
            onPick={(c) => { setOpen(c); setFocused(false); }}
            onShowAll={() => submit(q)}
          />
        )}
      </div>

      {submitted.length < MIN_CHARS ? (
        // ── Before searching: recent searches, then the hint ──
        <div className="space-y-4">
          {recent.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="section-label">Recent</h2>
                <button type="button" onClick={() => { writeRecent([]); setRecent([]); }}
                  className="h-11 px-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground">
                  Clear
                </button>
              </div>
              <ChipRow className="lg:mx-0 lg:flex-wrap lg:px-0">
                {recent.map((r) => (
                  <Chip key={r} onClick={() => submit(r)} icon={<History size={14} aria-hidden />}>{r}</Chip>
                ))}
              </ChipRow>
            </section>
          )}
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
        </div>
      ) : results.failed ? (
        <EmptyState title="Search didn't load" hint="Check your connection and try again." />
      ) : results.cards === null ? (
        <div className={GRID} aria-busy>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-surface">
              <Skeleton className="aspect-[63/88] rounded-none" />
              <div className="space-y-2 p-2.5">
                <Skeleton variant="text" className="w-2/3" />
                <Skeleton variant="text" className="w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState title={`No cards match “${submitted}”`} hint="Try fewer words, or just the card name." />
      ) : (
        <section className="space-y-3">
          {/* ── Results header: what, how many, filter + sort ── */}
          <div className="space-y-3 lg:flex lg:items-end lg:justify-between lg:gap-4 lg:space-y-0">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">“{submitted}”</h2>
              <p className="text-xs tabular-nums text-muted-foreground">
                {cards.length >= 48 ? "Top 48 matches · add a set or number to narrow it" : `${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
                {setFilter && ` · ${shown.length} in ${setFilter}`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0">
              <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)} aria-label="Filter by set" className={`${SELECT} lg:w-56`}>
                <option value="">All sets ({facets.length})</option>
                {facets.map((f) => <option key={f.name} value={f.name}>{f.name} ({f.count})</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort" className={`${SELECT} lg:w-40`}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {setFilter && (
            <button type="button" onClick={() => setSetFilter("")}
              className="inline-flex h-9 items-center gap-1 rounded-full bg-accent-tint px-3 text-sm font-medium text-accent">
              {setFilter} <X size={14} aria-hidden />
            </button>
          )}

          <div className={GRID}>
            {shown.map((c) => (
              <CardTile
                key={c.id}
                layout="panel"
                name={c.name}
                chip={c.setName}
                setNumber={c.cardNumber ? `#${c.cardNumber}` : null}
                imageUrl={c.imageUrl}
                onClick={() => setOpen(c)}
                footer={stock[c.id]
                  ? <span className="font-medium tabular-nums text-foreground">{stock[c.id]} in stock</span>
                  : <span>Not in stock</span>}
              />
            ))}
          </div>
        </section>
      )}

      <CardDetailSheet card={open} onClose={() => setOpen(null)} />
    </div>
  );
}
