"use client";

import { useEffect, useRef } from "react";
import { Package, ScanLine, ShoppingCart } from "lucide-react";
import type { CertLookupResult } from "@/app/api/cert-lookup/route";
import { Badge, Button, Chip, Skeleton, StatCard } from "@/components/ui";
import type { CertLookup } from "./useCertLookup";
import { CompanyPicker } from "./CompanyPicker";
import { OfferCalc } from "./OfferCalc";
import { ActiveListings, RecentSales } from "./Listings";
import { GRADE_LADDER } from "./shared";

// ── ResultCard ──
// Everything shown after a successful lookup: card header, grade/company
// tabs, price tiles, offer calculator, comps, and the action buttons.

export function ResultCard({
  result,
  lookup,
  selectedPct,
  onSelectPct,
  actionLoading,
  onAddToInventory,
  onRecordBuy,
  onScanNext,
  onPass,
}: {
  result: CertLookupResult;
  lookup: CertLookup;
  selectedPct: number;
  onSelectPct: (pct: number) => void;
  actionLoading: boolean;
  onAddToInventory: () => void;
  onRecordBuy: () => void;
  onScanNext: () => void;
  onPass: () => void;
}) {
  const { display, selectedGrade, selectedViewCompany } = lookup;
  const gradeScrollRef = useRef<HTMLDivElement>(null);

  // Keep the selected grade pill in view
  useEffect(() => {
    if (!gradeScrollRef.current || !selectedGrade) return;
    const el = gradeScrollRef.current.querySelector(`[data-grade="${selectedGrade}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedGrade]);

  const meta = [
    result.setName,
    result.cardNumber ? `#${result.cardNumber}` : null,
    result.year,
    result.isJapanese ? "Japanese" : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <Button variant="secondary" size="lg" onClick={onPass} className="w-full">
        <ScanLine size={16} />
        New scan
      </Button>

      {/* ── Card header ── */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-lg font-semibold leading-snug">{result.name || "—"}</div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <Badge tone="accent" className="tabular-nums">
              {result.company} {result.gradeLabel ?? ""} {result.grade}
              {result.population != null && <> · Pop {result.population.toLocaleString()}</>}
            </Badge>
            {result.populationHigher === 0 && (
              <span className="text-xs font-semibold text-warning-strong">None graded higher</span>
            )}
            {result.populationHigher != null && result.populationHigher > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {result.populationHigher.toLocaleString()} graded higher
              </span>
            )}
            {result.population != null && selectedViewCompany !== result.company && (
              <span className="text-xs text-muted-foreground">{result.company} pop data</span>
            )}
          </div>
        </div>
        {meta && <div className="mt-0.5 text-sm text-muted-foreground">{meta}</div>}
        {result.variety && <div className="mt-0.5 text-xs italic text-muted-foreground">{result.variety}</div>}
        <div className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">#{result.certNumber}</div>
      </div>

      {/* ── Grade tabs (horizontal scroll) ── */}
      <div ref={gradeScrollRef} className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {[...GRADE_LADDER].reverse().map((g) => {
          const selected = g === selectedGrade;
          const fetching = !selected && lookup.isGradeFetching(g);
          return (
            <Chip
              key={g}
              size="sm"
              selected={selected}
              data-grade={g}
              onClick={() => lookup.selectGrade(g)}
              className="relative min-w-11 tabular-nums"
            >
              {g}
              {fetching && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent-secondary" />
              )}
            </Chip>
          );
        })}
      </div>

      {/* ── Company tabs ── */}
      <CompanyPicker value={selectedViewCompany} onChange={lookup.selectViewCompany} />

      {/* ── Price tiles ── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={`${display.marketLabel} · FMV`}
          tone={display.market != null && display.market >= 200 ? "warning" : "default"}
          money={display.marketLoading ? undefined : display.market ?? undefined}
          value={display.marketLoading ? <Skeleton className="h-7 w-24" /> : display.market == null ? "—" : undefined}
          delta={display.compCount > 0 ? `${display.compCount} comps` : "no data"}
        />
        <StatCard
          label="Lowest listed"
          money={display.listings.loading ? undefined : display.listings.lowest ?? undefined}
          value={display.listings.loading ? <Skeleton className="h-7 w-20" /> : display.listings.lowest == null ? "—" : undefined}
          delta={!display.listings.loading && display.listings.items.length > 0 ? `${display.listings.items.length} active` : undefined}
        />
      </div>

      <OfferCalc market={display.market} selectedPct={selectedPct} onSelectPct={onSelectPct} />
      <RecentSales sold={display.sold} onToggleShowAll={lookup.toggleSoldShowAll} />
      <ActiveListings listings={display.listings} />

      {/* ── Actions ── */}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" onClick={onAddToInventory} disabled={actionLoading}>
          <Package size={16} />
          Add to inventory
        </Button>
        <Button size="lg" onClick={onRecordBuy} disabled={actionLoading}>
          <ShoppingCart size={16} />
          Record buy
        </Button>
        <Button variant="secondary" size="lg" onClick={onScanNext} className="col-span-2">
          <ScanLine size={16} />
          Scan next
        </Button>
        <Button variant="ghost" onClick={onPass} className="col-span-2">
          Pass / dismiss
        </Button>
      </div>
    </div>
  );
}
