"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui";

export type ScheduleFields = {
  name: string; location: string; hours: string; startingCash: string; boothFee: string; notes: string;
};

const inputCls =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-primary focus:outline-none";

// ── Labelled field ────────────────────────────────────────────────────────────

function Field({ id, label, required, error, children }: {
  id?: string; label: string; required?: boolean; error?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}{" "}
        {required
          ? <span className="text-negative">*</span>
          : <span className="normal-case font-normal tracking-normal text-neutral">optional</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-negative">Required</p>}
    </div>
  );
}

// ── Schedule Show modal ───────────────────────────────────────────────────────

export function ScheduleShowModal({
  open, date, onDateChange, onClose, onSubmit, busy, err,
}: {
  open: boolean;
  date: string;
  onDateChange: (d: string) => void;
  onClose: () => void;
  onSubmit: (data: ScheduleFields) => void;
  busy: boolean;
  err: string;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [hours, setHours] = useState("");
  const [startingCash, setStartingCash] = useState("");
  const [boothFee, setBoothFee] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Reset field + validation state when the modal opens
  useEffect(() => {
    if (open) {
      setName(""); setLocation(""); setHours(""); setStartingCash(""); setBoothFee(""); setNotes("");
      setSubmitted(false);
    }
  }, [open]);

  const nameErr = submitted && !name.trim();
  const dateErr = submitted && !date;

  function handleSubmit() {
    setSubmitted(true);
    if (!name.trim() || !date) {
      document.getElementById(!name.trim() ? "ssm-name" : "ssm-date")?.focus();
      return;
    }
    onSubmit({ name, location, hours, startingCash, boothFee, notes });
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule Show">
      <div className="max-h-96 space-y-3 overflow-y-auto pb-1">
        <Field id="ssm-name" label="Show Name" required error={nameErr}>
          <input
            id="ssm-name"
            className={cn(inputCls, nameErr && "border-negative")}
            placeholder="e.g. Portland Card Show"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>

        <Field id="ssm-date" label="Date" required error={dateErr}>
          <input
            id="ssm-date"
            type="date"
            className={cn(inputCls, dateErr && "border-negative")}
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </Field>

        <Field id="ssm-venue" label="Venue">
          <input
            id="ssm-venue"
            className={inputCls}
            placeholder="e.g. Portland Convention Center"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>

        <Field id="ssm-hours" label="Hours">
          <input
            id="ssm-hours"
            className={inputCls}
            placeholder="e.g. 10am – 4pm"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </Field>

        <Field id="ssm-cash" label="Starting Cash">
          <input
            id="ssm-cash"
            type="number"
            inputMode="decimal"
            className={cn(inputCls, "tabular-nums")}
            placeholder="e.g. 500"
            min="0"
            step="0.01"
            value={startingCash}
            onChange={(e) => setStartingCash(e.target.value)}
          />
        </Field>

        {/* Booth fee is logged as a show expense */}
        <Field id="ssm-fee" label="Booth Fee">
          <input
            id="ssm-fee"
            type="number"
            inputMode="decimal"
            className={cn(inputCls, "tabular-nums")}
            placeholder="e.g. 150"
            min="0"
            step="0.01"
            value={boothFee}
            onChange={(e) => setBoothFee(e.target.value)}
          />
        </Field>

        <Field id="ssm-notes" label="Notes">
          <textarea
            id="ssm-notes"
            className={cn(inputCls, "h-auto min-h-20 resize-none py-2")}
            rows={2}
            placeholder="Any notes about this show…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {err && <p className="text-xs font-medium text-negative">{err}</p>}
      </div>

      {/* ── Footer ── */}
      <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="h-11 flex-1 rounded-lg border border-border text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-accent-primary-hover disabled:opacity-40"
        >
          {busy ? <><Loader2 size={14} className="animate-spin" />Scheduling…</> : "Schedule Show"}
        </button>
      </div>
    </Modal>
  );
}
