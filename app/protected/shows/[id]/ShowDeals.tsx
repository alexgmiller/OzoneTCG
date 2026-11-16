import { MoneyDisplay } from "@/components/ui";
import type { Deal } from "@/app/protected/transactions/deals";
import { METHOD_LABELS } from "@/app/protected/pos/ledger";
import { pillCls } from "../shared";

const MODE: Record<Deal["mode"], { label: string; cls: string }> = {
  buy: { label: "Buy", cls: "border-negative-border bg-negative-soft text-negative" },
  sell: { label: "Sell", cls: "border-positive-border bg-positive-soft text-positive" },
  trade: { label: "Trade", cls: "border-accent-tint bg-accent-tint text-accent" },
};

function methodLabel(m: string | null) {
  if (!m) return null;
  return (METHOD_LABELS as Record<string, string>)[m] ?? m;
}

// Deals recorded at one show: type pill, cards, cash in/out
export default function ShowDeals({ deals }: { deals: Deal[] }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {deals.map((d) => {
        // Buy and trade amounts are cash we paid; sell is cash we received
        const signed = d.mode === "sell" ? d.amount : -d.amount;
        const meta = [d.counterparty, methodLabel(d.method)].filter(Boolean).join(" · ");
        return (
          <li key={d.id} className="flex items-start gap-3 p-3">
            <span className={`${pillCls} ${MODE[d.mode].cls} mt-0.5 shrink-0`}>{MODE[d.mode].label}</span>
            <div className="min-w-0 flex-1">
              {d.cards.map((c, i) => (
                <div key={i} className="truncate text-sm text-foreground">
                  {d.mode === "trade" && (
                    <span className="mr-1 font-mono text-xs uppercase text-muted-foreground">
                      {c.direction === "in" ? "in" : "out"}
                    </span>
                  )}
                  {c.name}
                </div>
              ))}
              {meta && <div className="mt-1 truncate text-xs text-muted-foreground">{meta}</div>}
            </div>
            <MoneyDisplay amount={signed} showSign className="shrink-0 text-sm font-semibold" />
          </li>
        );
      })}
    </ul>
  );
}
