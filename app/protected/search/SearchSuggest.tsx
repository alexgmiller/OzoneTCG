"use client";

import { CornerDownLeft } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { CatalogCard } from "./catalog";

// ── Typing suggestions ──
// The dropdown under the search bar while typing: the top matches as compact
// rows (thumbnail, name, number, set), then "See all results". Picking a row
// opens that card; Enter with nothing highlighted shows the full results.
// Options keep focus in the input (mousedown is prevented) so the listbox
// works as a combobox: ↑ / ↓ move, Enter picks, Esc closes.
export const SUGGEST_LIMIT = 6;

type Props = {
  id: string;
  query: string;
  cards: CatalogCard[] | null;   // null while the first answer is loading
  total: number;
  active: number;                // highlighted option, -1 for none
  onHover: (i: number) => void;
  onPick: (card: CatalogCard) => void;
  onShowAll: () => void;
};

export const optionId = (id: string, i: number) => `${id}-opt-${i}`;

export default function SearchSuggest({ id, query, cards, total, active, onHover, onPick, onShowAll }: Props) {
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-border bg-surface">
      {cards === null ? (
        <div className="space-y-1 p-2" aria-busy>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex h-16 items-center gap-3 px-1">
              <Skeleton className="h-14 w-10 shrink-0 rounded-thumb" />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" className="w-1/2" />
                <Skeleton variant="text" className="w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">No cards match “{query}”. Try fewer words, or just the name.</p>
      ) : (
        <ul id={id} role="listbox" aria-label="Suggestions">
          {cards.map((c, i) => (
            <li
              key={c.id}
              id={optionId(id, i)}
              role="option"
              aria-selected={i === active}
              onMouseDown={keep}
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(c)}
              className={cn(
                "flex h-16 cursor-pointer items-center gap-3 border-b border-border px-3 transition-colors duration-150 last:border-b-0",
                i === active ? "bg-surface-2" : "hover:bg-surface-2",
              )}
            >
              <span className="h-14 w-10 shrink-0 overflow-hidden rounded-thumb bg-surface-2">
                {c.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{c.name}</span>
                  {c.cardNumber && <span className="shrink-0 font-mono text-xs text-muted-foreground">#{c.cardNumber}</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{c.setName}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {cards && cards.length > 0 && (
        <button
          type="button"
          onMouseDown={keep}
          onClick={onShowAll}
          className="flex h-11 w-full items-center justify-between border-t border-border px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-surface-2"
        >
          <span className="truncate">
            See all {total >= 48 ? "48+" : total} results for “{query}”
          </span>
          <CornerDownLeft size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        </button>
      )}
    </div>
  );
}
