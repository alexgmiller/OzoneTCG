import type { DayActivity } from "../actions";
import { DOT_BG, type ActivityKind } from "./helpers";

// ── Dot row ───────────────────────────────────────────────────────────────────

export function activityKinds(activity?: DayActivity): ActivityKind[] {
  if (!activity) return [];
  const kinds: ActivityKind[] = [];
  if (activity.buyCount > 0) kinds.push("buy");
  if (activity.sellCount > 0) kinds.push("sell");
  if (activity.tradeCount > 0) kinds.push("trade");
  if (activity.expenseCount > 0) kinds.push("expense");
  return kinds;
}

export function DotRow({ kinds }: { kinds: ActivityKind[] }) {
  if (kinds.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {kinds.map((k) => (
        <span key={k} className={`h-1.5 w-1.5 rounded-full ${DOT_BG[k]}`} />
      ))}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

const LEGEND: [string, ActivityKind][] = [
  ["Buy", "buy"],
  ["Sell", "sell"],
  ["Trade", "trade"],
  ["Show", "show"],
];

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {LEGEND.map(([label, kind]) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_BG[kind]}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
