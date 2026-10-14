"use client";

import { MoneyDisplay } from "@/components/ui";
import CertLookupWidget, { type CertWidgetResult } from "@/components/CertLookupWidget";
import type { Category, Condition } from "../types";
import { toNum, fieldClass } from "../utils";

export type TradeOwner = "alex" | "mila" | "shared";

export type ComingInEntry = {
  _id: string;
  name: string;
  setName: string;
  cardNumber: string;
  grade: string;
  category: Category;
  condition: Condition;
  owner: TradeOwner;
  marketPrice: string;
  tradePct: string;
};

export function blankComingIn(): ComingInEntry {
  return {
    _id: crypto.randomUUID(),
    name: "", setName: "", cardNumber: "", grade: "",
    category: "single", condition: "Near Mint", owner: "alex",
    marketPrice: "", tradePct: "80",
  };
}

export function entryCredit(c: ComingInEntry): number {
  const mp = toNum(c.marketPrice) ?? 0;
  const pct = toNum(c.tradePct) ?? 80;
  return (mp * pct) / 100;
}

const CONDITIONS: Condition[] = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
const SHORT: Record<Condition, string> = { "Near Mint": "NM", "Lightly Played": "LP", "Moderately Played": "MP", "Heavily Played": "HP", "Damaged": "DMG" };
const labelClass = "mb-1 block font-mono text-xs uppercase tracking-[0.18em] text-neutral";

// ── One incoming card in a trade ──
export function TradeComingInCard({
  card,
  index,
  removable,
  onChange,
  onRemove,
}: {
  card: ComingInEntry;
  index: number;
  removable: boolean;
  onChange: (patch: Partial<ComingInEntry>) => void;
  onRemove: () => void;
}) {
  const mp = toNum(card.marketPrice) ?? 0;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Card {index + 1}</span>
        <div className="flex items-center gap-2">
          <CertLookupWidget
            label="Scan cert"
            onResult={(r: CertWidgetResult) => {
              onChange({
                name: r.name,
                setName: r.setName ?? "",
                cardNumber: r.cardNumber ?? "",
                grade: r.gradeLabel ? `${r.company} ${r.gradeLabel} ${r.grade}` : r.grade ? `${r.company} ${r.grade}` : "",
                category: "slab",
                marketPrice: r.market != null ? String(r.market) : "",
              });
            }}
          />
          {removable && (
            <button className="h-11 px-2 text-xs font-medium text-negative" onClick={onRemove}>Remove</button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={`${fieldClass} col-span-2`} placeholder="Card name *" value={card.name} onChange={(e) => onChange({ name: e.target.value })} />
        <input className={fieldClass} placeholder="Set name" value={card.setName} onChange={(e) => onChange({ setName: e.target.value })} />
        <input className={fieldClass} placeholder="Card #" value={card.cardNumber} onChange={(e) => onChange({ cardNumber: e.target.value })} />
        <select className={fieldClass} value={card.category} onChange={(e) => onChange({ category: e.target.value as Category })}>
          <option value="single">Single</option>
          <option value="slab">Slab</option>
          <option value="sealed">Sealed</option>
        </select>
        {card.category === "slab" ? (
          <input className={fieldClass} placeholder="Grade (e.g. PSA 10)" value={card.grade} onChange={(e) => onChange({ grade: e.target.value })} />
        ) : (
          <select className={fieldClass} value={card.condition} onChange={(e) => onChange({ condition: e.target.value as Condition })}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{SHORT[c]}</option>)}
          </select>
        )}
        <select className={fieldClass} value={card.owner} onChange={(e) => onChange({ owner: e.target.value as TradeOwner })}>
          <option value="alex">Alex</option>
          <option value="mila">Mila</option>
          <option value="shared">Shared</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className={labelClass}>Market</span>
          <input className={`${fieldClass} tabular-nums`} placeholder="$0.00" inputMode="decimal" value={card.marketPrice} onChange={(e) => onChange({ marketPrice: e.target.value })} />
        </label>
        <label className="block">
          <span className={labelClass}>Trade %</span>
          <input className={`${fieldClass} tabular-nums`} placeholder="80" inputMode="decimal" value={card.tradePct} onChange={(e) => onChange({ tradePct: e.target.value })} />
        </label>
        <div>
          <span className={labelClass}>Credit</span>
          <div className="flex h-11 items-center text-sm font-bold">
            {mp > 0 ? <MoneyDisplay amount={entryCredit(card)} tone="neutral" /> : <span className="text-muted-foreground">—</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
