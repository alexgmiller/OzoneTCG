"use client";

import type { ExpenseCategory } from "@/app/protected/expenses/actions";
import { SectionHeader } from "@/components/ui";
import { ExpenseTooltip } from "../ExpenseTooltip";
import { CATEGORY_TOOLTIP, CHIP_ACTIVE, CHIP_CLASS, CHIP_IDLE, EXPENSE_CATEGORIES } from "./shared";

// ── Category picker ───────────────────────────────────────────────────────────

export function CategoryPicker({
  value,
  onChange,
}: {
  value: ExpenseCategory;
  onChange: (category: ExpenseCategory) => void;
}) {
  return (
    <div className="space-y-2">
      <SectionHeader>
        <span className="inline-flex items-center">
          Category
          <ExpenseTooltip content={CATEGORY_TOOLTIP} />
        </span>
      </SectionHeader>
      <div className="flex flex-wrap gap-2">
        {EXPENSE_CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            className={`${CHIP_CLASS} ${value === c.value ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
