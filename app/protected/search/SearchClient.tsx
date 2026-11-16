"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History, X } from "lucide-react";
import { CardTile, Chip, ChipRow, EmptyState, MoneyDisplay, PageHeader, SearchBar, Skeleton, TabStrip } from "@/components/ui";
import type { Quote } from "@/lib/tcgplayerMatch";
import { priceQuotes, searchCatalog, stockCounts } from "./actions";
import { facets, pushRecent, setFacets, sortCards, SORTS, type CatalogCard, type CatalogLang, type SortKey } from "./catalog";
import SearchSuggest, { optionId, SUGGEST_LIMIT } from "./SearchSuggest";
import CardDetailSheet from "./CardDetailSheet";

// ── Search ──
// Typing shows a dropdown of the top matches (tap one to open it). Enter, or
// "See all results", shows the full grid for that query: count, set and
// rarity filters built from the results, sort (price too), and tiles with the
// art uncovered and the set, name, number, rarity, TCGplayer market price and
// your stock underneath. Prices load just after the cards (lib/tcgcsv.ts), so
// the grid never waits on them. Before any search, recent searches
// (this device) are one tap away. ?q= holds the submitted query so Back from
// Inventory or POS returns to the results; ?lang=ja keeps the Japanese tab.
// English cards come from TCGdex's catalog, Japanese ones from TCGplayer's
// (English names), so both search the same way.

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;
const RECENT_KEY = "ozone.search.recent";
const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const LANGS = [{ value: "en", label: "English" }, { value: "ja", label: "Japanese" }] as const;
const META: Record<CatalogLang, string> = {
  en: "Every English Pokémon card, with TCGplayer prices",
  ja: "Japanese cards from TCGplayer, by English name",
};
const searchHref = (query: string, lang: CatalogLang) => {
  const p = new URLSearchParams();
  if (query) p.set("q", query);
  if (lang === "ja") p.set("lang", "ja");
  const qs = p.toString();
  return qs ? `/protected/search?${qs}` : "/protected/search";
};
const SELECT = "h-11 min-w-0 rounded-xl bg-surface-2 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent";

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]; } catch { return []; }
}
function writeRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* per-device nicety */ }
}

export default function SearchClient({ initialQuery, initialLang }: { initialQuery: string; initialLang: CatalogLang }) {
  const router = useRouter();
  const listId = useId();

  // ── Query state ──
  const [q, setQ] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery.trim());
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [lang, setLang] = useState<CatalogLang>(initialLang);

  // ── Data ──
  // One request per query and language, shared by the dropdown and the grid.
  // Switching language swaps fetchCards, which re-runs both effects below.
  const cache = useRef(new Map<string, Promise<CatalogCard[]>>());
  const fetchCards = useCallback((query: string) => {
    const key = `${lang}|${query}`;
    let p = cache.current.get(key);
    if (!p) {
      p = searchCatalog(query, lang);
      p.catch(() => cache.current.delete(key));
      cache.current.set(key, p);
    }
    return p;
  }, [lang]);

  const [suggest, setSuggest] = useState<{ query: string; cards: CatalogCard[] | null }>({ query: "", cards: null });
  const [results, setResults] = useState<{ query: string; cards: CatalogCard[] | null; failed: boolean }>({ query: "", cards: null, failed: false });
  const [stock, setStock] = useState<Record<string, number>>({});
  /** null while loading */
  const [quotes, setQuotes] = useState<Record<string, Quote> | null>(null);
  const [sort, setSort] = useState<SortKey>("best");
  const [setFilter, setSetFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
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
    setRarityFilter("");
    setStock({});
    setQuotes(null);
    fetchCards(submitted)
      .then((cards) => {
        if (!live) return;
        setResults({ query: submitted, cards, failed: false });
        stockCounts(cards).then((s) => { if (live) setStock(s); }).catch(() => {});
        priceQuotes(cards).then((q) => { if (live) setQuotes(q); }).catch(() => { if (live) setQuotes({}); });
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
    router.replace(searchHref(t, lang), { scroll: false });
    const next = pushRecent(readRecent(), t);
    writeRecent(next);
    setRecent(next);
  }

  function clearAll() {
    setQ("");
    setSubmitted("");
    router.replace(searchHref("", lang), { scroll: false });
  }

  function switchLang(next: CatalogLang) {
    if (next === lang) return;
    setLang(next);
    router.replace(searchHref(submitted, next), { scroll: false });
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
  const sets = useMemo(() => setFacets(cards), [cards]);
  const rarities = useMemo(() => facets(cards.map((c) => quotes?.[c.id]?.rarity)), [cards, quotes]);
  const shown = useMemo(
    () => sortCards(
      cards.filter((c) => (!setFilter || c.setName === setFilter) && (!rarityFilter || quotes?.[c.id]?.rarity === rarityFilter)),
      sort,
      (c) => quotes?.[c.id]?.market ?? null,
    ),
    [cards, quotes, setFilter, rarityFilter, sort],
  );
  const filtered = !!(setFilter || rarityFilter);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 py-4 lg:max-w-6xl">
      <PageHeader title="Search" meta={META[lang]} />

      <TabStrip value={lang} onChange={switchLang} tabs={LANGS} aria-label="Card language" className="lg:max-w-2xl" />

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
            hint={lang === "ja"
              ? "Japanese cards by their English name: try “charizard ex 151”, “umbreon vmax” or “pikachu promo”."
              : "Try “charizard ex”, “umbreon 215” or “mew 151”. The camera icon opens the cert scanner."}
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
                {filtered && ` · ${shown.length} shown`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0">
              <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)} aria-label="Filter by set" className={`${SELECT} lg:w-56`}>
                <option value="">All sets ({sets.length})</option>
                {sets.map((f) => <option key={f.name} value={f.name}>{f.name} ({f.count})</option>)}
              </select>
              <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)} aria-label="Filter by rarity"
                disabled={!rarities.length} className={`${SELECT} disabled:opacity-50 lg:w-48`}>
                <option value="">{quotes === null ? "Rarity…" : `All rarities (${rarities.length})`}</option>
                {rarities.map((f) => <option key={f.name} value={f.name}>{f.name} ({f.count})</option>)}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort" className={`${SELECT} col-span-2 lg:w-48`}>
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {filtered && (
            <div className="flex flex-wrap gap-2">
              {[{ value: setFilter, clear: () => setSetFilter("") }, { value: rarityFilter, clear: () => setRarityFilter("") }]
                .filter((f) => f.value)
                .map((f) => (
                  <button key={f.value} type="button" onClick={f.clear} aria-label={`Remove filter ${f.value}`}
                    className="inline-flex h-9 items-center gap-1 rounded-full bg-accent-tint px-3 text-sm font-medium text-accent">
                    {f.value} <X size={14} aria-hidden />
                  </button>
                ))}
            </div>
          )}

          {shown.length === 0 ? (
            <EmptyState title="No cards match these filters" hint="Remove a filter to see more." />
          ) : (
            <div className={GRID}>
              {shown.map((c) => {
                const quote = quotes?.[c.id];
                return (
                  <CardTile
                    key={c.id}
                    layout="panel"
                    name={c.name}
                    chip={c.setName}
                    setNumber={c.cardNumber ? `#${c.cardNumber}` : null}
                    detail={quote?.rarity}
                    imageUrl={c.imageUrl}
                    onClick={() => setOpen(c)}
                    footer={
                      <div className="flex min-h-5 items-center justify-between gap-2">
                        {quotes === null ? (
                          <Skeleton variant="text" className="w-12" />
                        ) : quote?.market != null ? (
                          <MoneyDisplay amount={quote.market} tone="neutral" className="text-sm font-semibold text-foreground" />
                        ) : (
                          <span>No price</span>
                        )}
                        {stock[c.id] ? <span className="font-medium tabular-nums text-foreground">{stock[c.id]} in stock</span> : null}
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      <CardDetailSheet card={open} onClose={() => setOpen(null)} />
    </div>
  );
}
