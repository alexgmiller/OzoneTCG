"use client";

import { ArrowUpDown, CheckSquare, LayoutGrid, List, MoreHorizontal, Plus } from "lucide-react";
import { HeroValue, IconButton, SearchBar } from "@/components/ui";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SortKey } from "../types";
import type { ViewMode } from "../useViewMode";
import { SORT_OPTIONS, sortLabel } from "../inventoryView";

// ── Inventory header ──
// SearchBar row, then grid/list · sort · more. Below: the FMV of the current
// filter as a left-aligned HeroValue, and "Date ↓ · 42 items" on the right.
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
            <IconButton label="Sort"><ArrowUpDown size={20} strokeWidth={1.75} /></IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              {SORT_OPTIONS.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

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
        <span className="shrink-0 pb-1 text-sm tabular-nums text-muted-foreground">
          {sortLabel(sort)} · {count} item{count === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
