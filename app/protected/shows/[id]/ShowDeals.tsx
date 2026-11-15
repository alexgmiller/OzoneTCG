import { Badge, MoneyDisplay } from "@/components/ui";
import type { Deal } from "@/app/protected/transactions/deals";
import { METHOD_LABELS } from "@/app/protected/pos/ledger";

const MODE: Record<Deal["mode"], { label: string; tone: "negative" | "positive" | "accent" }> = {
  buy: { label: "Buy", tone: "negative" },
  sell: { label: "Sell", tone: "positive" },
  trade: { label: "Trade", tone: "accent" },
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
            <Badge mono tone={MODE[d.mode].tone} className="mt-0.5 shrink-0">{MODE[d.mode].label}</Badge>
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
