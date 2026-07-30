"use client";

import type { Item, Status, Psa10Entry } from "../types";
import { fmt, effectiveCost } from "../utils";

/* Grading section */
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
    <div className="border rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 border-b flex items-center gap-2">
        <span className="font-medium text-sm">Grading</span>
        <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 px-2 py-0.5 rounded-full font-medium">
          {gradingItems.length}
        </span>
        <span className="text-[11px] opacity-30 ml-auto">Grading fee: {fmt(gradingCost)}/card</span>
      </div>
      <div className="divide-y divide-border/50">
        {gradingItems.map((it) => {
          const psa = psa10Data[it.id];
          const costBasis = effectiveCost(it) ?? it.market ?? 0;
          const psa10Val = psa?.medianPrice ?? null;
          const profit = psa10Val != null ? psa10Val - costBasis - gradingCost : null;
          const roi = profit != null && (costBasis + gradingCost) > 0
            ? (profit / (costBasis + gradingCost)) * 100
            : null;
          return (
            <div key={it.id} className="flex items-center gap-3 px-3 py-2.5">
              {/* Thumbnail */}
              <div className="flex-shrink-0 w-[56px]">
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt={it.name} className="card-thumb object-cover" />
                ) : (
                  <div className="card-thumb-placeholder flex items-center justify-center">
                    <span className="text-[10px] opacity-30">?</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate leading-snug">{it.name}</div>
                {(it.set_name || it.card_number) && (
                  <div className="text-xs opacity-50 truncate">
                    {[it.set_name, it.card_number ? `#${it.card_number}` : ""].filter(Boolean).join(" · ")}
                  </div>
                )}

                {/* Price details */}
                <div className="mt-1 text-xs">
                  {/* Line 1: Raw · PSA 10 · Grading */}
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 opacity-60">
                    {costBasis > 0 && <span>Cost: {fmt(costBasis)}{it.cost_basis != null ? <span className="opacity-60"> (cb)</span> : null}</span>}
                    {it.market != null && it.market !== costBasis && <span>· Raw: {fmt(it.market)}</span>}
                    {psa?.loading && <span className="animate-pulse">· Fetching PSA 10…</span>}
                    {psa?.fetched && psa10Val != null && (
                      <span className="text-yellow-700 dark:text-yellow-400 font-medium">· PSA 10: {fmt(psa10Val)} ({psa.count} sales)</span>
                    )}
                    {psa?.fetched && psa10Val == null && (
                      <span>{psa.rateLimited ? "· eBay rate limited" : "· No PSA 10 data"}</span>
                    )}
                  </div>
                  {/* Line 2: Profit / ROI */}
                  {profit != null && (
                    <div className={`font-semibold mt-0.5 ${profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                      Potential profit: {profit >= 0 ? "+" : ""}{fmt(profit)}
                      {roi != null && <span className="font-normal opacity-70"> ({roi >= 0 ? "+" : ""}{roi.toFixed(0)}% ROI)</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {psa?.fetched && (
                  <button
                    className="text-[11px] opacity-30 hover:opacity-70 transition-opacity"
                    onClick={() => fetchPsa10(it.id, it.name, it.set_name)}
                    title="Refresh PSA 10 price"
                  >↺</button>
                )}
                <button
                  className="text-xs px-2.5 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors"
                  onClick={() => onQuickStatus(it.id, "inventory")}
                  disabled={busy}
                >
                  Return
                </button>
                <button
                  className="text-xs px-2.5 py-1.5 rounded-lg border font-medium hover:bg-muted transition-colors"
                  onClick={() => openEdit(it)}
                >
                  Edit
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
