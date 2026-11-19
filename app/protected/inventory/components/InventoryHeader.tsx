"use client";

import { ArrowDown, ArrowUp, CheckSquare, ChevronDown, LayoutGrid, List, MoreHorizontal, Plus } from "lucide-react";
import { HeroValue, IconButton, SearchBar } from "@/components/ui";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SortField, SortKey } from "../types";
import type { ViewMode } from "../useViewMode";
import { SORT_FIELDS, flipSort, parseSort, sortDirLabel, sortFieldOption, sortForField } from "../sort";

// ── Inventory header ──
// SearchBar row, then grid/list · more. Below: the FMV of the current filter
// as a left-aligned HeroValue, and on the right the sort — a field picker
// ("Date ▾") with a direction toggle beside it — then "· 42 items".
type Props = {
  search: string;
  setSearch: (v: string) => void;
  onScan: () => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  sort: SortKey;
  setSort: (k: SortKey) => void;
  onSelect: () => void;
  onAdd: () => void;
  total: number;
  count: number;
};

export function InventoryHeader({ search, setSearch, onScan, view, setView, sort, setSort, onSelect, onAdd, total, count }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SearchBar value={search} onChange={setSearch} onScan={onScan} placeholder="Search inventory" className="flex-1" />
        <IconButton label={view === "grid" ? "Switch to list" : "Switch to grid"} onClick={() => setView(view === "grid" ? "list" : "grid")}>
          {view === "grid" ? <List size={20} strokeWidth={1.75} /> : <LayoutGrid size={20} strokeWidth={1.75} />}
        </IconButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More"><MoreHorizontal size={20} strokeWidth={1.75} /></IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onSelect}><CheckSquare size={16} /> Select items</DropdownMenuItem>
            <DropdownMenuItem onSelect={onAdd}><Plus size={16} /> Add item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-end justify-between gap-3">
        <HeroValue amount={total} align="left" size="lg" />
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <SortControls sort={sort} setSort={setSort} />
          <span className="tabular-nums">· {count} item{count === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Sort: field picker + direction toggle ──
// Both are drawn 32px tall to sit on the HeroValue line; .tap-target gives
// them 44px tap zones.
function SortControls({ sort, setSort }: { sort: SortKey; setSort: (k: SortKey) => void }) {
  const { field, dir } = parseSort(sort);
  const option = sortFieldOption(field);
  const dirLabel = sortDirLabel(sort);
  const nextDirLabel = sortDirLabel(flipSort(sort));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Sort by ${option.label}`}
            className="tap-target relative inline-flex h-8 items-center gap-1 transition-colors duration-150 hover:text-foreground"
          >
            {option.short}
            <ChevronDown size={14} aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={field} onValueChange={(v) => setSort(sortForField(sort, v as SortField))}>
            {SORT_FIELDS.map((f) => (
              <DropdownMenuRadioItem key={f.field} value={f.field}>{f.label}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={() => setSort(flipSort(sort))}
        aria-label={`${dirLabel}. Switch to ${nextDirLabel}`}
        title={dirLabel}
        className="tap-target relative flex h-8 w-8 items-center justify-center rounded-full bg-surface text-foreground transition duration-150 ease-out hover:bg-surface-2 motion-safe:active:scale-press"
      >
        {dir === "desc" ? <ArrowDown size={16} aria-hidden /> : <ArrowUp size={16} aria-hidden />}
      </button>
    </>
  );
}
