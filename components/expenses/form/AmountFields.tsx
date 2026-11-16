"use client";

import { MoneyDisplay } from "@/components/ui";
import { FIELD_CLASS, LABEL_CLASS, type FormState, type SetField } from "./shared";

// ── Amount + vendor + description (non-mileage) ───────────────────────────────

export function AmountFields({
  form,
  setField,
  deductibleAmt,
  estimatedSavings,
}: {
  form: FormState;
  setField: SetField;
  deductibleAmt: number;
  estimatedSavings: number;
}) {
  return (
    <>
      <div>
        <label className={LABEL_CLASS}>Amount</label>
        <input
          type="number"
          inputMode="decimal"
          className={`${FIELD_CLASS} font-mono tabular-nums`}
          placeholder="0.00"
          value={form.cost}
          onChange={(e) => setField("cost", e.target.value)}
          autoFocus
        />
      </div>

      {deductibleAmt > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 rounded-lg border border-positive-border bg-positive-soft px-3 py-2.5 text-xs">
          <span className="font-medium text-positive">
            <MoneyDisplay amount={deductibleAmt} tone="positive" /> tax deductible
          </span>
          <span className="text-muted-foreground">
            · ~<MoneyDisplay amount={estimatedSavings} tone="neutral" /> estimated savings
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Vendor</label>
          <input
            className={FIELD_CLASS}
            placeholder="Hilton, Shell…"
            value={form.vendor_name}
            onChange={(e) => setField("vendor_name", e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Description</label>
          <input
            className={FIELD_CLASS}
            placeholder="Optional notes"
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
          />
        </div>
      </div>
    </>
  );
}
