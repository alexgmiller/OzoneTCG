"use client";

import { ChevronDown } from "lucide-react";
import { Chip, ChipRow, SegmentedControl } from "@/components/ui";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Category, ConsignerOption } from "../types";
import type { Filters } from "../inventoryView";

export { defaultFilters, countActiveFilters } from "../inventoryView";
export type { Filters, StatusFilter } from "../inventoryView";

// ── Filter row ──
// In stock | Sold, then a scrolling chip rail: All, Slabs, Singles, Sealed,
// Consigned, and a consigner dropdown chip.
const STOCK = [{ value: "active", label: "In stock" }, { value: "sold", label: "Sold" }] as const;
const CATEGORIES: readonly { value: Category | "all"; label: string }[] = [
  { value: "all", label: "All" }, { value: "slab", label: "Slabs" }, { value: "single", label: "Singles" }, { value: "sealed", label: "Sealed" },
];

export function InventoryFilters({
  filters, setFilters, consigners,
}: {
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  consigners: ConsignerOption[];
}) {
  const pool = filters.status === "sold" ? "sold" : "active";
  const consignedChip = filters.consigner === "any";
  const pickedConsigner = consigners.find((c) => c.id === filters.consigner);

  return (
    <div className="space-y-3">
      <SegmentedControl
        value={pool}
        onChange={(v) => setFilters({ status: v })}
        options={STOCK}
        size="sm"
        aria-label="In stock or sold"
      />

      <ChipRow>
        {CATEGORIES.map((c) => (
          <Chip key={c.value} selected={filters.category === c.value && !consignedChip} onClick={() => setFilters({ category: c.value })}>
            {c.label}
          </Chip>
        ))}
        <Chip selected={consignedChip} onClick={() => setFilters({ consigner: consignedChip ? "all" : "any" })}>
          Consigned
        </Chip>

        {consigners.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Chip selected={!!pickedConsigner || filters.consigner === "none"} icon={<ChevronDown size={14} />}>
                {pickedConsigner?.name ?? (filters.consigner === "none" ? "Not consigned" : "Consigner")}
              </Chip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={pickedConsigner || filters.consigner === "none" ? filters.consigner : "all"}
                onValueChange={(v) => setFilters({ consigner: v })}
              >
                <DropdownMenuRadioItem value="all">Any owner</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="none">Not consigned</DropdownMenuRadioItem>
                {consigners.map((c) => (
                  <DropdownMenuRadioItem key={c.id} value={c.id}>{c.name}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </ChipRow>
    </div>
  );
}
