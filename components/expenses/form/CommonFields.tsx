"use client";

import type { ShowSessionSummary } from "@/app/protected/expenses/ExpensesServer";
import { ExpenseTooltip } from "../ExpenseTooltip";
import {
  DEDUCTIBLE_TOOLTIP, FIELD_CLASS, LABEL_CLASS, fmtDate, validateDate,
  type FormState, type SetField,
} from "./shared";

// ── Date, payer, deductible %, payment method, linked show ────────────────────

export function CommonFields({
  form,
  setField,
  showSessions,
}: {
  form: FormState;
  setField: SetField;
  showSessions: ShowSessionSummary[];
}) {
  const dateError = validateDate(form.expense_date);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLASS}>Date</label>
          <input
            type="date"
            className={`${FIELD_CLASS} ${dateError ? "border-negative" : ""}`}
            value={form.expense_date}
            onChange={(e) => setField("expense_date", e.target.value)}
          />
          {dateError && <p className="mt-1 text-xs text-negative">{dateError}</p>}
        </div>
        <div>
          <label className={LABEL_CLASS}>Paid by</label>
          <select
            className={FIELD_CLASS}
            value={form.paid_by}
            onChange={(e) => setField("paid_by", e.target.value as FormState["paid_by"])}
          >
            <option value="shared">Shared</option>
            <option value="alex">Alex</option>
            <option value="mila">Mila</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1.5 flex items-center">
            <label className="text-xs text-muted-foreground">Tax deductible %</label>
            <ExpenseTooltip content={DEDUCTIBLE_TOOLTIP} />
          </div>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            className={`${FIELD_CLASS} font-mono tabular-nums`}
            value={form.deductible_percentage}
            onChange={(e) => setField("deductible_percentage", e.target.value)}
          />
          {form.category === "meals" && (
            <p className="mt-1 text-xs text-muted-foreground">50% per IRS rules for business meals</p>
          )}
        </div>
        <div>
          <label className={LABEL_CLASS}>Payment method</label>
          <input
            className={FIELD_CLASS}
            placeholder="Visa ••••4242"
            value={form.payment_method}
            onChange={(e) => setField("payment_method", e.target.value)}
          />
        </div>
      </div>

      {showSessions.length > 0 && (
        <div>
          <label className={LABEL_CLASS}>Linked show</label>
          <select
            className={FIELD_CLASS}
            value={form.show_session_id}
            onChange={(e) => setField("show_session_id", e.target.value)}
          >
            <option value="">None</option>
            {showSessions.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({fmtDate(s.date)})</option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
