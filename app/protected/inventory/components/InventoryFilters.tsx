"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import type { Category, Status, SortKey, ConsignerOption, ConsignerFilter } from "../types";
import { fieldClass, btnOutline } from "../utils";

// "active" = inventory + grading (the default); sold rows only show when "sold" is picked
export type StatusFilter = Status | "active";

export type Filters = {
  search: string;
  category: Category | "all";
  status: StatusFilter;
  consigner: ConsignerFilter;
  sort: SortKey;
};

export const defaultFilters: Filters = { search: "", category: "all", status: "active", consigner: "all", sort: "date-desc" };

export function countActiveFilters(f: Filters): number {
  return (f.search.trim() ? 1 : 0) + (f.category !== "all" ? 1 : 0) + (f.status !== "active" ? 1 : 0) + (f.consigner !== "all" ? 1 : 0);
}

// ── Search + filter row ──
export function InventoryFilters({
  filters,
  setFilters,
  open,
  setOpen,
  consigners,
}: {
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  consigners: ConsignerOption[];
}) {
  const active = countActiveFilters(filters);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${fieldClass} pl-9 pr-10`}
            placeholder="Search inventory…"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
          />
          {filters.search && (
            <button className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground" onClick={() => setFilters({ search: "" })} aria-label="Clear search">
              <X size={16} />
            </button>
          )}
        </div>
        <button
          className={`${btnOutline} gap-2 ${open || active > 0 ? "border-accent-primary-border bg-accent-primary-soft text-accent-primary" : ""}`}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <SlidersHorizontal size={16} />
          <span className="hidden sm:inline">Filters</span>
          {active > 0 && <span className="rounded-full bg-accent-primary px-2 text-xs font-semibold text-primary-foreground tabular-nums">{active}</span>}
        </button>
      </div>

      {open && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-2">
            <select className={fieldClass} value={filters.category} onChange={(e) => setFilters({ category: e.target.value as Category | "all" })}>
              <option value="all">All types</option>
              <option value="single">Singles</option>
              <option value="slab">Slabs</option>
              <option value="sealed">Sealed</option>
            </select>
            <select className={fieldClass} value={filters.status} onChange={(e) => setFilters({ status: e.target.value as StatusFilter })}>
              <option value="active">Active</option>
              <option value="inventory">Inventory</option>
              <option value="grading">Grading</option>
              <option value="sold">Sold</option>
            </select>
            <select className={fieldClass} value={filters.consigner} onChange={(e) => setFilters({ consigner: e.target.value })}>
              <option value="all">Any owner</option>
              <option value="none">Not consigned</option>
              {consigners.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className={fieldClass} value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as SortKey })}>
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="name-asc">Name A→Z</option>
              <option value="name-desc">Name Z→A</option>
              <option value="market-desc">Value high→low</option>
              <option value="market-asc">Value low→high</option>
              <option value="cost-desc">Cost high→low</option>
              <option value="cost-asc">Cost low→high</option>
            </select>
          </div>
          {active > 0 && (
            <button className="mt-2 h-11 text-sm font-medium text-accent-primary" onClick={() => setFilters({ ...defaultFilters, sort: filters.sort })}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
