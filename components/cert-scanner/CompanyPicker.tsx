"use client";

import type { GradingCompany } from "@/app/api/cert-lookup/route";
import { Chip } from "@/components/ui";
import { COMPANIES } from "./shared";

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
        <Chip
          key={c}
          size="sm"
          selected={c === value}
          onClick={() => onChange(c)}
          className="flex-1"
        >
          {c}
        </Chip>
      ))}
    </div>
  );
}
