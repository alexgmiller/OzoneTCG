"use client";

import { MoneyDisplay, SectionHeader } from "@/components/ui";
import type { ConsignerSaleEntry, SharedSaleEntry, SoloSaleEntry } from "../PayoutServer";
import { CollapsibleSection, LedgerRow } from "./CollapsibleSection";
import { BTN_OUTLINE, BTN_SOFT, fmtDate } from "./payoutMeta";

// ── Sales: shared revenue, our consigner cut, and solo sales awaiting a decision ──

function SoloSalesSection({
  items,
  pendingShared,
  pendingSolo,
  onMakeShared,
  onKeepSolo,
}: {
  items: SoloSaleEntry[];
  pendingShared: Set<string>;
  pendingSolo: Set<string>;
  onMakeShared: (id: string) => void;
  onKeepSolo: (id: string) => void;
}) {
  return (
    <CollapsibleSection
      title="Solo sales"
      count={items.length}
      subtotal={items.reduce((s, i) => s + i.sold_price, 0)}
      hint="Sold as personal inventory. Include a sale to split its revenue 50/50, or keep it solo to leave it out."
    >
      {items.map((s) => {
        const adding = pendingShared.has(s.id);
        const keeping = pendingSolo.has(s.id);
        const busy = adding || keeping;
        const profit = s.cost != null ? s.sold_price - s.cost : null;
        return (
          <div key={s.id} className="space-y-3 border-t border-border px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="capitalize">{s.owner}</span> · sold {fmtDate(s.sold_at)}
                  {profit != null && (
                    <>
                      {" "}· <MoneyDisplay amount={profit} showSign /> profit
                    </>
                  )}
                </div>
              </div>
              <MoneyDisplay
                amount={s.sold_price}
                tone="neutral"
                className="shrink-0 font-semibold text-foreground"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onMakeShared(s.id)}
                className={`${BTN_SOFT} flex-1`}
              >
                {adding ? "Adding…" : "Include in shared"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onKeepSolo(s.id)}
                className={`${BTN_OUTLINE} flex-1`}
              >
                {keeping ? "Saving…" : "Keep solo"}
              </button>
            </div>
          </div>
        );
      })}
    </CollapsibleSection>
  );
}

export function SalesLists({
  sharedSales,
  consignerSales,
  soloSales,
  sharedSaleTotal,
  consignerCutTotal,
  pendingShared,
  pendingSolo,
  onMakeShared,
  onKeepSolo,
}: {
  sharedSales: SharedSaleEntry[];
  consignerSales: ConsignerSaleEntry[];
  soloSales: SoloSaleEntry[];
  sharedSaleTotal: number;
  consignerCutTotal: number;
  pendingShared: Set<string>;
  pendingSolo: Set<string>;
  onMakeShared: (id: string) => void;
  onKeepSolo: (id: string) => void;
}) {
  if (sharedSales.length + consignerSales.length + soloSales.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeader>Sales</SectionHeader>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {sharedSales.length > 0 && (
          <CollapsibleSection
            title="Shared sales"
            count={sharedSales.length}
            subtotal={sharedSaleTotal}
            tone="positive"
          >
            {sharedSales.map((s) => (
              <LedgerRow
                key={s.id}
                label={s.name}
                sub={`Sold ${fmtDate(s.sold_at)}`}
                amount={s.sold_price}
                tone="positive"
              />
            ))}
          </CollapsibleSection>
        )}

        {consignerSales.length > 0 && (
          <CollapsibleSection
            title="Consigner sales · our cut"
            count={consignerSales.length}
            subtotal={consignerCutTotal}
            tone="positive"
          >
            {consignerSales.map((s) => (
              <LedgerRow
                key={s.id}
                label={s.name}
                sub={
                  <>
                    Sold {fmtDate(s.sold_at)} · <MoneyDisplay amount={s.sold_price} tone="neutral" />{" "}
                    sale
                  </>
                }
                amount={s.sold_price - s.consigner_payout}
                tone="positive"
              />
            ))}
          </CollapsibleSection>
        )}

        {soloSales.length > 0 && (
          <SoloSalesSection
            items={soloSales}
            pendingShared={pendingShared}
            pendingSolo={pendingSolo}
            onMakeShared={onMakeShared}
            onKeepSolo={onKeepSolo}
          />
        )}
      </div>
    </section>
  );
}
