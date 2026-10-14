"use client";

import { EmptyState } from "@/components/ui";
import type { ExpenseRow } from "../ExpensesServer";
import { ExpenseRowItem } from "./ExpenseRowItem";

export type ExpenseGroup = { key: string; label: string; items: ExpenseRow[] };

// ── Grouped expense list ──────────────────────────────────────────────────────

export function ExpenseList({
  groups,
  showGroupLabels,
  uploadingFor,
  hasActiveFilters,
  onLogFirst,
  onEdit,
  onDelete,
  onReceiptPick,
  onLightbox,
}: {
  groups: ExpenseGroup[];
  showGroupLabels: boolean;
  uploadingFor: string | null;
  hasActiveFilters: boolean;
  onLogFirst: () => void;
  onEdit: (e: ExpenseRow) => void;
  onDelete: (e: ExpenseRow) => void;
  onReceiptPick: (id: string) => void;
  onLightbox: (url: string) => void;
}) {
  const isEmpty = groups.every((g) => g.items.length === 0);

  if (isEmpty) {
    return (
      <EmptyState
        title="No expenses"
        hint={
          hasActiveFilters
            ? "Try adjusting the filters above."
            : "Track meals, mileage, hotel, and other show costs here."
        }
        cta={
          hasActiveFilters ? undefined : (
            <button
              onClick={onLogFirst}
              className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent-primary-hover"
            >
              Log first expense
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          {showGroupLabels && (
            <div className="px-1 pt-1 font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </div>
          )}
          {group.items.map((e) => (
            <ExpenseRowItem
              key={e.id}
              expense={e}
              uploading={uploadingFor === e.id}
              onEdit={() => onEdit(e)}
              onDelete={() => onDelete(e)}
              onReceiptPick={() => onReceiptPick(e.id)}
              onLightbox={onLightbox}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
