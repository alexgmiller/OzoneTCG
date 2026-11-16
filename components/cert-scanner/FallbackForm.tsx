"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import type { FallbackFields } from "./useCertLookup";
import { btnOutline, btnPrimary, inputClass } from "./shared";

// ── FallbackForm ──
// Shown when the cert lookup fails: enter card details by hand to get pricing.

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
        autoFocus={autoFocus}
      />
    </label>
  );
}

export function FallbackForm({
  error,
  onSubmit,
  onCancel,
}: {
  error?: string | null;
  onSubmit: (f: FallbackFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FallbackFields>({ name: "", grade: "", setName: "", cardNumber: "", market: "" });
  const set = (k: keyof FallbackFields) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const canSubmit = f.name.trim() !== "" && f.grade.trim() !== "";

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning-strong" />
        <div>
          <div className="text-sm font-medium">Cert lookup failed</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {error ?? "Enter card details to get pricing."}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field className="col-span-2" label="Card name *" value={f.name} onChange={set("name")} placeholder="e.g. Charizard" autoFocus />
        <Field label="Grade *" value={f.grade} onChange={set("grade")} placeholder="e.g. 10" />
        <Field label="Card # (optional)" value={f.cardNumber} onChange={set("cardNumber")} placeholder="e.g. 4/102" />
        <Field label="Set (optional)" value={f.setName} onChange={set("setName")} placeholder="e.g. Base Set" />
        <Field label="Override market $" type="number" value={f.market} onChange={set("market")} placeholder="optional" />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => onSubmit(f)} disabled={!canSubmit} className={`${btnPrimary} flex-1`}>
          Get pricing
        </button>
        <button type="button" onClick={onCancel} className={btnOutline}>
          Cancel
        </button>
      </div>
    </div>
  );
}
