"use client";

import type { GradingCompany } from "@/app/api/cert-lookup/route";
import { COMPANIES, pillClass } from "./shared";

// ── CompanyPicker ──
// Full-width row of grading-company pills (PSA / BGS / CGC / TAG).

export function CompanyPicker({
  value,
  onChange,
}: {
  value: GradingCompany;
  onChange: (c: GradingCompany) => void;
}) {
  return (
    <div className="flex gap-2">
      {COMPANIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={pillClass(c === value, "flex-1")}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
