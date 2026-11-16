"use client";

import { MoneyDisplay, SectionHeader } from "@/components/ui";
import type { Item, Status, Psa10Entry } from "../types";
import { fmt, effectiveCost, setLine, btnOutline, pillWarning } from "../utils";

// ── Grading section ──
export default function GradingSection({
  gradingItems,
  gradingCost,
  psa10Data,
  fetchPsa10,
  onQuickStatus,
  openEdit,
  busy,
}: {
  gradingItems: Item[];
  gradingCost: number;
  psa10Data: Record<string, Psa10Entry>;
  fetchPsa10: (id: string, name: string, setName?: string | null) => void;
  onQuickStatus: (id: string, status: Status) => void;
  openEdit: (it: Item) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-2">
      <SectionHeader action={<span className="text-xs text-muted-foreground tabular-nums">Fee {fmt(gradingCost)}/card</span>}>
        Grading · {gradingItems.length}
      </SectionHeader>
      <div className="space-y-2">
        {gradingItems.map((it) => {
          const psa = psa10Data[it.id];
          const costBasis = effectiveCost(it) ?? it.market ?? 0;
          const psa10Val = psa?.medianPrice ?? null;
          const profit = psa10Val != null ? psa10Val - costBasis - gradingCost : null;
          const roi = profit != null && costBasis + gradingCost > 0 ? (profit / (costBasis + gradingCost)) * 100 : null;
          return (
            <div key={it.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start gap-3">
                <div className="w-14 shrink-0">
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image_url} alt="" loading="lazy" className="h-auto w-full rounded-lg object-cover" />
                  ) : (
                    <div className="flex aspect-[5/7] w-full items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">?</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{it.name}</div>
                  {setLine(it) && <div className="truncate text-xs text-muted-foreground">{setLine(it)}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    <span className={pillWarning}>Grading</span>
                    {costBasis > 0 && <span>Cost {fmt(costBasis)}</span>}
                    {it.market != null && it.market !== costBasis && <span>Raw {fmt(it.market)}</span>}
                    {psa?.loading && <span className="animate-pulse">Fetching PSA 10…</span>}
                    {psa?.fetched && psa10Val != null && <span className="font-medium text-foreground">PSA 10 {fmt(psa10Val)} ({psa.count} sales)</span>}
                    {psa?.fetched && psa10Val == null && <span>{psa.rateLimited ? "eBay rate limited" : "No PSA 10 data"}</span>}
                  </div>
                  {profit != null && (
                    <div className="mt-1 flex items-baseline gap-1 text-sm font-semibold">
                      <MoneyDisplay amount={profit} showSign />
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">potential{roi != null ? ` · ${roi >= 0 ? "+" : ""}${roi.toFixed(0)}% ROI` : ""}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className={`${btnOutline} flex-1`} onClick={() => onQuickStatus(it.id, "inventory")} disabled={busy}>Return to inventory</button>
                <button className={btnOutline} onClick={() => openEdit(it)}>Edit</button>
                {psa?.fetched && (
                  <button className={`${btnOutline} w-11 px-0`} onClick={() => fetchPsa10(it.id, it.name, it.set_name)} title="Refresh PSA 10 price">↻</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
