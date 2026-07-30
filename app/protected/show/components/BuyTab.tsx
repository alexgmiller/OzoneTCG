"use client";

import React from "react";
import { ScanLine, Camera, X as XIcon } from "lucide-react";
import CardAutocomplete, { type AutocompleteCard } from "@/components/CardAutocomplete";
import CertLookupWidget from "@/components/CertLookupWidget";
import type { GradeCompany, StagedBuy } from "../types";
import {
  BUY_PCTS,
  GRADE_COMPANIES_LIST,
  GRADE_OPTIONS,
  CONDITIONS_LIST,
  COND_ABBREV,
  PRODUCT_TYPES_LIST,
  money,
} from "../utils";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  batchQuery: string;
  setBatchQuery: React.Dispatch<React.SetStateAction<string>>;
  batchCard: AutocompleteCard | null;
  setBatchCard: React.Dispatch<React.SetStateAction<AutocompleteCard | null>>;
  batchMarket: string;
  setBatchMarket: React.Dispatch<React.SetStateAction<string>>;
  batchCategory: "single" | "slab" | "sealed";
  setBatchCategory: React.Dispatch<React.SetStateAction<"single" | "slab" | "sealed">>;
  batchCondition: string;
  setBatchCondition: React.Dispatch<React.SetStateAction<string>>;
  batchGradeCompany: GradeCompany;
  setBatchGradeCompany: React.Dispatch<React.SetStateAction<GradeCompany>>;
  batchGradeValue: string;
  setBatchGradeValue: React.Dispatch<React.SetStateAction<string>>;
  batchProductType: string;
  setBatchProductType: React.Dispatch<React.SetStateAction<string>>;
  batchQuantity: string;
  setBatchQuantity: React.Dispatch<React.SetStateAction<string>>;
  batchOwner: "shared" | "alex" | "mila";
  setBatchOwner: React.Dispatch<React.SetStateAction<"shared" | "alex" | "mila">>;
  batchPct: number;
  batchCustomPct: string;
  batchFlatAmount: string;
  batchQueue: StagedBuy[];
  setBatchQueue: React.Dispatch<React.SetStateAction<StagedBuy[]>>;
  recentCards: AutocompleteCard[];
  batchMarketLoading: boolean;
  buyCertOpen: boolean;
  setBuyCertOpen: React.Dispatch<React.SetStateAction<boolean>>;
  busy: boolean;
  onBatchCardSelect: (card: AutocompleteCard) => void;
  fetchBatchMarketPrice: (
    name: string,
    setName: string | null,
    cardNumber: string | null,
    condition: string,
    category: "single" | "slab" | "sealed",
    gradeCompany?: string,
    gradeValue?: string
  ) => void;
  onBatchMarketChange: (val: string) => void;
  onBatchPresetPctClick: (pct: number) => void;
  onBatchCustomPctChange: (val: string) => void;
  onBatchFlatChange: (val: string) => void;
  handleAddToBatch: () => void;
  handleFinalizeBatch: () => void;
  setScannerOpen: React.Dispatch<React.SetStateAction<"buy" | "trade-getting" | "trade-inventory" | "deal-add" | "deal-inventory" | null>>;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BuyTab({
  batchQuery,
  setBatchQuery,
  batchCard,
  setBatchCard,
  batchMarket,
  setBatchMarket,
  batchCategory,
  setBatchCategory,
  batchCondition,
  setBatchCondition,
  batchGradeCompany,
  setBatchGradeCompany,
  batchGradeValue,
  setBatchGradeValue,
  batchProductType,
  setBatchProductType,
  batchQuantity,
  setBatchQuantity,
  batchOwner,
  setBatchOwner,
  batchPct,
  batchCustomPct,
  batchFlatAmount,
  batchQueue,
  setBatchQueue,
  recentCards,
  batchMarketLoading,
  buyCertOpen,
  setBuyCertOpen,
  busy,
  onBatchCardSelect,
  fetchBatchMarketPrice,
  onBatchMarketChange,
  onBatchPresetPctClick,
  onBatchCustomPctChange,
  onBatchFlatChange,
  handleAddToBatch,
  handleFinalizeBatch,
  setScannerOpen,
}: Props) {
  const batchMarketNum = parseFloat(batchMarket) || 0;
  const flatAmt = parseFloat(batchFlatAmount) || 0;
  const effectivePct = batchPct > 0 ? batchPct : (parseFloat(batchCustomPct) || 0);
  const stageCost = flatAmt > 0 ? flatAmt
    : effectivePct > 0 && batchMarketNum > 0 ? parseFloat((batchMarketNum * effectivePct / 100).toFixed(2)) : 0;
  const batchTotal = batchQueue.reduce((s, i) => s + i.cost, 0);
  const gradeList = GRADE_OPTIONS[batchGradeCompany] ?? [];
  const canAdd = !!batchQuery.trim() && batchMarketNum > 0 && stageCost > 0;

  return (
    <div className="space-y-3">

      {/* ── Card entry section ── */}
      <div className="border rounded-xl p-3 space-y-3">

        {/* Category pills — prominent at top */}
        <div className="grid grid-cols-3 gap-1.5">
          {(["single", "slab", "sealed"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => { setBatchCategory(cat); if (cat !== "slab") setBuyCertOpen(false); }}
              className={`py-2 rounded-xl text-xs font-bold capitalize transition-colors ${
                batchCategory === cat ? "text-white" : "border opacity-40 hover:opacity-60"
              }`}
              style={batchCategory === cat ? { background: "var(--accent-primary)" } : undefined}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Card autocomplete search — or inline cert row (slab only) */}
        {batchCategory === "slab" && buyCertOpen ? (
          <CertLookupWidget
            inlineRow
            controlledCompany={batchGradeCompany}
            onClose={() => setBuyCertOpen(false)}
            onResult={(r) => {
              const grade = r.gradeLabel ? `${r.gradeLabel} ${r.grade}`.trim() : r.grade;
              setBatchQuery(r.name);
              setBatchCard({ name: r.name, setName: r.setName ?? "", cardNumber: r.cardNumber ?? "", imageUrl: null, market: r.market });
              setBatchGradeCompany(r.company as GradeCompany);
              setBatchGradeValue(grade);
              if (r.market != null) setBatchMarket(r.market.toFixed(2));
              setBuyCertOpen(false);
            }}
          />
        ) : (
          <div className="flex gap-2">
            <CardAutocomplete
              value={batchQuery}
              onChange={(v) => { setBatchQuery(v); if (!v) { setBatchCard(null); setBatchMarket(""); } }}
              onSelect={onBatchCardSelect}
              placeholder="Search card name…"
              className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background"
            />
            {/* Camera scan button */}
            {!batchCard && (
              <button
                type="button"
                onClick={() => setScannerOpen("buy")}
                className="flex items-center justify-center w-10 rounded-lg border border-border/60 opacity-60 hover:opacity-100 transition-opacity shrink-0"
                title="Scan card with camera"
              >
                <Camera size={16} />
              </button>
            )}
            {batchCategory === "slab" && !batchCard && (
              <button
                type="button"
                onClick={() => setBuyCertOpen(true)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition-colors font-medium shrink-0"
              >
                <ScanLine size={13} />
                Cert
              </button>
            )}
          </div>
        )}

        {/* "Scan another cert" link — shown when card already selected from cert */}
        {batchCategory === "slab" && batchCard && !buyCertOpen && (
          <button
            type="button"
            onClick={() => { setBatchCard(null); setBatchQuery(""); setBatchMarket(""); setBuyCertOpen(true); }}
            className="text-[10px] text-violet-400 opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1"
          >
            <ScanLine size={10} />
            Scan another cert
          </button>
        )}

        {/* Selected card preview row */}
        {batchCard && (
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
            {batchCard.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={batchCard.imageUrl} alt="" className="h-9 w-6 object-contain rounded shrink-0" />
            ) : (
              <div className="h-9 w-6 bg-muted rounded shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{batchCard.name}</div>
              <div className="text-[10px] opacity-50 truncate">
                {batchCard.setName}{batchCard.cardNumber && ` · #${batchCard.cardNumber}`}
              </div>
            </div>
            <button onClick={() => { setBatchCard(null); setBatchQuery(""); setBatchMarket(""); }} className="opacity-30 hover:opacity-60 p-1"><XIcon size={12} /></button>
          </div>
        )}

        {/* Recently used cards */}
        {!batchCard && !batchQuery && recentCards.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] opacity-30 uppercase tracking-wide font-semibold">Recent</div>
            {recentCards.map((rc, i) => (
              <button
                key={i}
                onMouseDown={(e) => { e.preventDefault(); onBatchCardSelect(rc); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60 text-left transition-colors"
              >
                {rc.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rc.imageUrl} alt="" className="h-8 w-5.5 object-contain rounded shrink-0" />
                ) : (
                  <div className="h-8 w-5.5 bg-muted rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{rc.name}</div>
                  <div className="text-[10px] opacity-40 truncate">{rc.setName}</div>
                </div>
                {rc.market != null && (
                  <span className="text-[10px] opacity-50 shrink-0">${rc.market.toFixed(0)}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Conditional fields by category */}
        {batchCategory === "single" && (
          <div className="grid grid-cols-5 gap-1">
            {CONDITIONS_LIST.map((cond) => (
              <button
                key={cond}
                onClick={() => {
                  setBatchCondition(cond);
                  if (batchCard) {
                    fetchBatchMarketPrice(batchCard.name, batchCard.setName || null, batchCard.cardNumber || null, cond, "single");
                  }
                }}
                className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  batchCondition === cond ? "text-white" : "border opacity-40 hover:opacity-60"
                }`}
                style={batchCondition === cond ? { background: "var(--accent-primary)" } : undefined}
              >
                {COND_ABBREV[cond]}
              </button>
            ))}
          </div>
        )}

        {batchCategory === "slab" && (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1">
              {GRADE_COMPANIES_LIST.map((co) => (
                <button
                  key={co}
                  onClick={() => {
                    setBatchGradeCompany(co);
                    setBatchGradeValue("");
                    // Grade value is reset — don't fetch until grade is chosen
                  }}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    batchGradeCompany === co ? "text-white" : "border opacity-40 hover:opacity-60"
                  }`}
                  style={batchGradeCompany === co ? { background: "var(--accent-primary)" } : undefined}
                >
                  {co}
                </button>
              ))}
            </div>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
              value={batchGradeValue}
              onChange={(e) => {
                const g = e.target.value;
                setBatchGradeValue(g);
                if (batchCard && g) {
                  fetchBatchMarketPrice(batchCard.name, batchCard.setName || null, batchCard.cardNumber || null, "Near Mint", "slab", batchGradeCompany, g);
                }
              }}
            >
              <option value="">— Grade —</option>
              {gradeList.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}

        {batchCategory === "sealed" && (
          <div className="grid grid-cols-2 gap-2">
            <select
              className="border rounded-lg px-2 py-2 text-sm bg-background"
              value={batchProductType}
              onChange={(e) => setBatchProductType(e.target.value)}
            >
              {PRODUCT_TYPES_LIST.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-40 shrink-0">Qty</span>
              <input
                type="number"
                inputMode="numeric"
                className="w-full border rounded-lg px-2 py-2 text-sm bg-background text-center"
                value={batchQuantity}
                min="1"
                onChange={(e) => setBatchQuantity(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Market price */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] opacity-40 uppercase tracking-wide">Market price</div>
            {batchMarketLoading && (
              <div className="flex items-center gap-1 text-[10px] opacity-50">
                <span className="inline-block w-2.5 h-2.5 rounded-full border border-current border-t-transparent animate-spin" />
                Fetching…
              </div>
            )}
          </div>
          <input
            type="number"
            inputMode="decimal"
            className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background font-mono"
            placeholder="$0.00"
            value={batchMarket}
            onChange={(e) => onBatchMarketChange(e.target.value)}
          />
        </div>
      </div>

      {/* ── Offer section ── */}
      <div className="border rounded-xl p-3 space-y-2.5">

        {/* Owner */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] opacity-40 uppercase tracking-wide">Owner</span>
          {(["shared", "alex", "mila"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setBatchOwner(o)}
              className={`text-xs px-2.5 py-1 rounded-full border capitalize transition-colors ${batchOwner === o ? "text-white" : "opacity-40"}`}
              style={batchOwner === o ? { background: "var(--accent-primary)", borderColor: "var(--accent-primary)" } : undefined}
            >
              {o}
            </button>
          ))}
        </div>

        {/* Percentage pills */}
        <div className="grid grid-cols-5 gap-1">
          {BUY_PCTS.map((p) => {
            const isSelected = batchPct === p;
            const dollarCost = batchMarketNum > 0 ? parseFloat((batchMarketNum * p / 100).toFixed(2)) : null;
            return (
              <button
                key={p}
                onClick={() => onBatchPresetPctClick(p)}
                className={`flex flex-col items-center py-2 rounded-xl border transition-colors ${
                  isSelected ? "text-white border-transparent" : "opacity-50 hover:opacity-75"
                }`}
                style={isSelected ? { background: "var(--accent-primary)" } : undefined}
              >
                <span className="text-xs font-bold">{p}%</span>
                <span className="text-[10px] opacity-70">{dollarCost != null ? money(dollarCost) : "—"}</span>
              </button>
            );
          })}
        </div>

        {/* Custom % and Flat $ — bidirectional */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] opacity-40 mb-1">Custom %</div>
            <input
              type="number"
              inputMode="decimal"
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-background ${batchPct === 0 && batchCustomPct ? "border-violet-500" : ""}`}
              placeholder="e.g. 67"
              value={batchCustomPct}
              onChange={(e) => onBatchCustomPctChange(e.target.value)}
            />
          </div>
          <div>
            <div className="text-[10px] opacity-40 mb-1">Flat $</div>
            <input
              type="number"
              inputMode="decimal"
              className={`w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono ${flatAmt > 0 && batchPct === 0 && !batchCustomPct ? "border-violet-500" : ""}`}
              placeholder="$0.00"
              value={batchFlatAmount}
              onChange={(e) => onBatchFlatChange(e.target.value)}
            />
          </div>
        </div>

        {/* Cost summary */}
        {stageCost > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs opacity-40">You pay:</span>
            <span className="font-bold text-rose-400">
              {money(stageCost)}
              {effectivePct > 0 && <span className="text-xs font-normal opacity-50 ml-1">@ {effectivePct}%</span>}
            </span>
          </div>
        )}

        <button
          onClick={handleAddToBatch}
          disabled={!canAdd}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{ background: "var(--accent-primary)" }}
        >
          + Add to batch
        </button>
      </div>

      {/* ── Batch list ── */}
      {batchQueue.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          {(() => {
            const batchMarketTotal = batchQueue.reduce((s, i) => s + (i.market ?? 0), 0);
            const batchMargin = batchMarketTotal > 0 ? batchMarketTotal - batchTotal : null;
            const batchAvgPct = batchMarketTotal > 0 ? (batchTotal / batchMarketTotal * 100) : 0;
            const summaryColor =
              batchAvgPct <= 0 ? "" :
              batchAvgPct <= 80 ? "text-emerald-400" :
              batchAvgPct <= 90 ? "text-amber-400" : "text-rose-400";
            return (
              <div className="px-3 py-2 border-b space-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">{batchQueue.length} card{batchQueue.length !== 1 ? "s" : ""}</div>
                  {batchAvgPct > 0 && (
                    <div className={`text-[10px] font-bold ${summaryColor}`}>{batchAvgPct.toFixed(1)}% avg</div>
                  )}
                </div>
                {batchMarketTotal > 0 && (
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="opacity-40">Market <span className="text-foreground font-medium opacity-70">{money(batchMarketTotal)}</span></span>
                    <span className="opacity-40">Paying <span className="text-rose-400 font-semibold">{money(batchTotal)}</span></span>
                    {batchMargin != null && (
                      <span className="opacity-40">Margin <span className={`font-semibold ${batchMargin >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {money(batchMargin)}{batchMarketTotal > 0 ? ` (${(batchMargin / batchMarketTotal * 100).toFixed(0)}%)` : ""}
                      </span></span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <div className="divide-y">
            {batchQueue.map((item) => (
              <div key={item._id} className="flex items-center gap-2 px-3 py-2">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt="" className="h-10 w-7 object-contain rounded shrink-0" />
                ) : (
                  <div className="h-10 w-7 rounded shrink-0 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <span className="text-[8px] uppercase opacity-30">{item.category.slice(0, 2)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{item.name}</div>
                  <div className="text-[10px] opacity-40">{item.grade || item.condition} · {item.buy_pct}% · {item.owner}</div>
                </div>
                <div className="text-right shrink-0">
                  {item.market != null && (
                    <div className="text-[10px] opacity-40 mb-0.5">mkt {money(item.market)}</div>
                  )}
                  <div className="text-sm font-semibold text-rose-400">{money(item.cost)}</div>
                </div>
                <button
                  onClick={() => setBatchQueue((q) => q.filter((x) => x._id !== item._id))}
                  className="opacity-30 hover:opacity-60 p-0.5 shrink-0"
                >
                  <XIcon size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="p-3 border-t">
            <button
              onClick={handleFinalizeBatch}
              disabled={busy}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "#22c55e" }}
            >
              {busy ? "Recording…" : `Record ${batchQueue.length} card${batchQueue.length !== 1 ? "s" : ""} · ${money(batchTotal)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
