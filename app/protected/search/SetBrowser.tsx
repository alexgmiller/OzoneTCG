"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { listSets } from "./actions";
import type { BrowseSet, CatalogLang } from "./catalog";

// ── Browse sets ──
// Search's home screen: TCGplayer's sets for the current language, newest
// release first (undated ones after). The newest few show at once; a filter
// narrows the whole list. Picking one opens its cards in the results grid.
const FIRST = 12;
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function releasedLabel(released: string | null): string | null {
  return released ? monthFmt.format(new Date(released)) : null;
}

export default function SetBrowser({ lang, onPick }: { lang: CatalogLang; onPick: (set: BrowseSet) => void }) {
  const [sets, setSets] = useState<BrowseSet[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    setSets(null);
    setFailed(false);
    listSets(lang)
      .then((s) => { if (live) setSets(s); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [lang]);

  const f = filter.trim().toLowerCase();
  const matching = useMemo(
    () => (sets ?? []).filter((s) => !f || s.name.toLowerCase().includes(f) || s.code?.toLowerCase() === f),
    [sets, f],
  );
  const shown = f || all ? matching : matching.slice(0, FIRST);

  if (failed) return null;

  return (
    <section className="space-y-2" aria-labelledby="browse-sets">
      <div className="flex items-center justify-between gap-3">
        <h2 id="browse-sets" className="section-label">Browse sets</h2>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter sets"
          aria-label="Filter sets"
          className="h-11 w-40 rounded-xl bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent sm:w-56"
        />
      </div>

      {sets === null ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sets match “{filter}”.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
            <li key={s.groupId}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="flex h-14 w-full items-center gap-3 rounded-xl bg-surface px-3 text-left transition-colors duration-150 hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{s.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[s.code, releasedLabel(s.released)].filter(Boolean).join(" · ") || "Promos and other"}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {sets && !f && !all && matching.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="h-11 w-full rounded-xl text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent-tint"
        >
          Show all {matching.length} sets
        </button>
      )}
    </section>
  );
}
