"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { MoneyDisplay } from "@/components/ui";
import { cn } from "@/lib/utils";
import { METHOD_LABELS, type PaymentMethod } from "@/app/protected/pos/ledger";
import { cardSummary, fmtDealDate, signedAmount, type Deal, type DealSort } from "./deals";

// ── Ledger table (lg+) ──
// One row per deal: date, type pill, cards, method, who, show, signed amount.
// Date and Amount headers sort; clicking a row opens the same detail modal
// the phone list uses.

const MODE_LABEL: Record<Deal["mode"], string> = { buy: "Buy", sell: "Sell", trade: "Trade" };
const MODE_PILL: Record<Deal["mode"], string> = {
  buy: "bg-down-tint text-down",
  sell: "bg-up-tint text-up",
  trade: "bg-accent-tint text-accent",
};

type Props = {
  deals: Deal[];
  showName: Map<string, string>;
  sort: DealSort;
  onSort: (s: DealSort) => void;
  onOpen: (d: Deal) => void;
};

const dash = <span className="text-muted-foreground">—</span>;

export default function LedgerTable({ deals, showName, sort, onSort, onOpen }: Props) {
  const sortHeader = (key: DealSort["key"], label: string, className: string) => {
    const active = sort.key === key;
    return (
      <th className={cn("px-4 py-3 font-medium", className)}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
        <button type="button"
          onClick={() => onSort({ key, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
          className={cn("inline-flex items-center gap-1 transition-colors duration-150 hover:text-foreground", active && "text-foreground")}>
          {label}
          {active && (sort.dir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-border text-left text-sm text-muted-foreground">
            {sortHeader("date", "Date", "w-36")}
            <th className="w-24 px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Cards</th>
            <th className="w-28 px-4 py-3 font-medium">Method</th>
            <th className="w-40 px-4 py-3 font-medium">With</th>
            <th className="w-40 px-4 py-3 font-medium">Show</th>
            {sortHeader("amount", "Amount", "w-32 text-right")}
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} onClick={() => onOpen(d)}
              className="h-14 cursor-pointer border-b border-border text-sm transition-colors duration-150 last:border-b-0 hover:bg-surface-2">
              <td className="px-4 tabular-nums text-muted-foreground">{fmtDealDate(d.date)}</td>
              <td className="px-4">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", MODE_PILL[d.mode])}>{MODE_LABEL[d.mode]}</span>
              </td>
              <td className="px-4">
                {/* The button gives keyboard users the same way in as the row click */}
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(d); }}
                  className="block w-full truncate text-left font-medium text-foreground">
                  {cardSummary(d) || dash}
                </button>
              </td>
              <td className="truncate px-4 text-muted-foreground">
                {d.method ? METHOD_LABELS[d.method as PaymentMethod] ?? d.method : dash}
              </td>
              <td className="truncate px-4 text-foreground">{d.counterparty || dash}</td>
              <td className="truncate px-4 text-muted-foreground">{(d.showId && showName.get(d.showId)) || dash}</td>
              <td className="px-4 text-right">
                {d.mode === "trade" && d.amount === 0
                  ? <span className="text-muted-foreground">Even</span>
                  : <MoneyDisplay amount={signedAmount(d)} showSign className="font-semibold" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
