import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import DashboardClient from "./DashboardClient";
import DashboardCharts, { type ChartItem } from "./DashboardCharts";
import { computeDashboardTotals } from "./totals";
import type { ItemRow, ExpenseRow, GradingRow } from "./totals";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function pnlColor(v: number) {
  if (v > 0) return "text-emerald-500 dark:text-emerald-400";
  if (v < 0) return "text-rose-500 dark:text-rose-400";
  return "opacity-70";
}

function whoOwesLine(net: number) {
  if (Math.abs(net) < 0.005) return "Settled up";
  if (net > 0) return `Mila owes Alex ${money(net)}`;
  return `Alex owes Mila ${money(Math.abs(net))}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function DashboardServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [
    { data: items, error: itemsErr },
    { data: expenses, error: expErr },
    { data: grading, error: gradErr },
    { data: chartItems, error: chartErr },
  ] = await Promise.all([
    supabase
      .from("items")
      .select(
        "category,owner,status,cost,market,sell_price,current_sale,sold_price,previous_sales,consigner_payout,name,sold_at"
      )
      .eq("workspace_id", workspaceId),
    supabase.from("expenses").select("paid_by,cost").eq("workspace_id", workspaceId),
    supabase.from("grading").select("cost").eq("workspace_id", workspaceId),
    supabase
      .from("items")
      .select("created_at,updated_at,status,cost,market,sold_price,previous_sales")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
  ]);

  if (itemsErr) throw new Error(itemsErr.message);
  if (expErr) throw new Error(expErr.message);
  if (gradErr) throw new Error(gradErr.message);
  if (chartErr) throw new Error(chartErr.message);

  const totals = computeDashboardTotals(
    (items ?? []) as ItemRow[],
    (expenses ?? []) as ExpenseRow[],
    (grading ?? []) as GradingRow[]
  );

  // Recent activity: last 8 sold items
  const recentSold = (items ?? [])
    .filter((it) => it.status === "sold" && it.sold_at)
    .sort((a, b) => ((b.sold_at ?? "") > (a.sold_at ?? "") ? 1 : -1))
    .slice(0, 8) as ItemRow[];

  const totalInventoryMarket = totals.market.active_total || 1; // avoid /0

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <div className="text-sm opacity-50">Workspace: {workspaceId}</div>
        </div>
      </div>

      {/* realtime hook */}
      <DashboardClient workspaceId={workspaceId} />

      {/* ── 5 Metric Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Active Market */}
        <div className="border border-violet-200 dark:border-violet-800/50 bg-violet-50/60 dark:bg-violet-900/15 rounded-xl p-3">
          <div className="text-xs font-medium text-violet-500 dark:text-violet-400 uppercase tracking-wide">
            Active Market
          </div>
          <div className="text-lg font-semibold mt-0.5">{money(totals.market.active_total)}</div>
          <div className="text-xs opacity-50 mt-1">{totals.counts.inventory} items</div>
        </div>

        {/* Cost Basis */}
        <div className="border border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-900/15 rounded-xl p-3">
          <div className="text-xs font-medium text-blue-500 dark:text-blue-400 uppercase tracking-wide">
            Cost Basis
          </div>
          <div className="text-lg font-semibold mt-0.5">{money(totals.cost.total_all)}</div>
          <div className="text-xs opacity-50 mt-1">
            Inv {money(totals.cost.inventory)} · Sold {money(totals.cost.sold)}
          </div>
        </div>

        {/* Realized P&L */}
        <div
          className={`border rounded-xl p-3 ${
            totals.pnl.realized >= 0
              ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-900/15"
              : "border-rose-200 dark:border-rose-800/50 bg-rose-50/60 dark:bg-rose-900/15"
          }`}
        >
          <div
            className={`text-xs font-medium uppercase tracking-wide ${
              totals.pnl.realized >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            Realized P&amp;L
          </div>
          <div className={`text-lg font-semibold mt-0.5 ${pnlColor(totals.pnl.realized)}`}>
            {totals.pnl.realized >= 0 ? "+" : ""}
            {money(totals.pnl.realized)}
          </div>
          <div className="text-xs opacity-50 mt-1">
            Rev {money(totals.sold.revenue)} · Cost {money(totals.cost.sold)}
          </div>
        </div>

        {/* Unrealized P&L */}
        <div
          className={`border rounded-xl p-3 ${
            totals.pnl.unrealized >= 0
              ? "border-teal-200 dark:border-teal-800/50 bg-teal-50/60 dark:bg-teal-900/15"
              : "border-rose-200 dark:border-rose-800/50 bg-rose-50/60 dark:bg-rose-900/15"
          }`}
        >
          <div className="text-xs font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wide">
            Unrealized P&amp;L
          </div>
          <div className={`text-lg font-semibold mt-0.5 ${pnlColor(totals.pnl.unrealized)}`}>
            {totals.pnl.unrealized >= 0 ? "+" : ""}
            {money(totals.pnl.unrealized)}
          </div>
          <div className="text-xs opacity-50 mt-1">
            Mkt {money(totals.market.inventory)} · Cost {money(totals.cost.inventory)}
          </div>
        </div>

        {/* Items */}
        <div className="border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-900/15 rounded-xl p-3">
          <div className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            Items
          </div>
          <div className="text-lg font-semibold mt-0.5">{totals.counts.total}</div>
          <div className="text-xs opacity-50 mt-1">
            Inv {totals.counts.inventory} · Sold {totals.counts.sold}
          </div>
        </div>
      </div>

      {/* ── Owners + Categories ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Owners with progress bars */}
        <div className="border rounded-xl p-3">
          <div className="text-sm font-medium mb-3">Owners</div>
          {(["shared", "alex", "mila"] as const).map((o, i) => {
            const b = totals.breakdowns.owners[o];
            const pct = totalInventoryMarket > 0 ? (b.market_active / totalInventoryMarket) * 100 : 0;
            const barColor = ["#8b5cf6", "#3b82f6", "#ec4899"][i];
            return (
              <div key={o} className="py-2.5 border-t first:border-t-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-sm font-medium capitalize">{o}</div>
                  <div className="text-right text-sm font-medium">{money(b.market_active)}</div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct.toFixed(1)}%`, background: barColor }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs opacity-50">{b.count} items · {pct.toFixed(0)}% of inventory</div>
                  <div className="text-xs opacity-50">Sold rev {money(b.revenue_sold)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Categories — hide empty */}
        <div className="border rounded-xl p-3">
          <div className="text-sm font-medium mb-3">Categories</div>
          {(["single", "slab", "sealed"] as const)
            .filter((c) => totals.breakdowns.categories[c].count > 0)
            .map((c) => {
              const b = totals.breakdowns.categories[c];
              return (
                <div key={c} className="flex items-center justify-between py-2.5 border-t first:border-t-0">
                  <div className="text-sm">
                    <div className="font-medium capitalize">{c}</div>
                    <div className="text-xs opacity-50">{b.count} items</div>
                  </div>
                  <div className="text-right text-sm">
                    <div>{money(b.market_active)}</div>
                    <div className="text-xs opacity-50">Cost {money(b.cost)}</div>
                  </div>
                </div>
              );
            })}
          {(["single", "slab", "sealed"] as const).every(
            (c) => totals.breakdowns.categories[c].count === 0
          ) && (
            <div className="text-sm opacity-40 py-4 text-center">No items yet</div>
          )}
        </div>
      </div>

      {/* ── Expenses / Who owes / Grading ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className={`border rounded-xl p-3 transition-opacity ${totals.expenses.total === 0 ? "opacity-40" : ""}`}>
          <div className="text-sm font-medium mb-1">Expenses</div>
          <div className="text-sm">{money(totals.expenses.total)}</div>
          <div className="text-xs opacity-60 mt-1">
            Alex {money(totals.expenses.by_paid_by.alex)} · Mila{" "}
            {money(totals.expenses.by_paid_by.mila)} · Shared{" "}
            {money(totals.expenses.by_paid_by.shared)}
          </div>
        </div>

        <div className="border rounded-xl p-3">
          <div className="text-sm font-medium mb-1">Who owes who</div>
          <div className="text-sm font-medium">{whoOwesLine(totals.owes.net)}</div>
          <div className="text-xs opacity-50 mt-1.5">50/50 split of personal-paid expenses</div>
        </div>

        <div className={`border rounded-xl p-3 transition-opacity ${totals.grading.total === 0 ? "opacity-40" : ""}`}>
          <div className="text-sm font-medium mb-1">Grading</div>
          <div className="text-sm">{money(totals.grading.total)}</div>
          <div className="text-xs opacity-50 mt-1">Total grading cost</div>
        </div>
      </div>

      {/* ── Charts ── */}
      <div>
        <div className="text-sm font-medium mb-3">Activity Charts</div>
        <DashboardCharts chartItems={(chartItems ?? []) as ChartItem[]} />
      </div>

      {/* ── Recent Activity ── */}
      {recentSold.length > 0 && (
        <div className="border rounded-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Recent Sales</div>
            <a
              href="/protected/transactions"
              className="text-xs opacity-50 hover:opacity-100 transition-opacity"
            >
              View all →
            </a>
          </div>
          <div className="space-y-0">
            {recentSold.map((it, i) => {
              const revenue =
                (typeof it.sold_price === "number" ? it.sold_price : 0) ||
                (typeof it.previous_sales === "number" ? it.previous_sales : 0);
              const cost = typeof it.cost === "number" ? it.cost : 0;
              const profit = revenue - cost;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 border-t first:border-t-0 gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{it.name ?? "—"}</div>
                    <div className="text-xs opacity-40">
                      {it.sold_at ? fmtDate(it.sold_at) : "—"} · {it.category}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium" style={{ fontFamily: "var(--font-space-mono, monospace)" }}>
                      {money(revenue)}
                    </div>
                    <div
                      className={`text-xs ${profit >= 0 ? "text-emerald-500" : "text-rose-500"}`}
                    >
                      {profit >= 0 ? "+" : ""}
                      {money(profit)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── P&L Statement ── */}
      <details className="border rounded-xl">
        <summary className="flex items-center justify-between p-3 cursor-pointer select-none list-none">
          <span className="text-sm font-medium">P&amp;L Statement</span>
          <span className="text-xs opacity-40">▸ expand</span>
        </summary>
        <div className="px-3 pb-3 space-y-1 text-sm border-t pt-3">
          <div className="flex justify-between">
            <span className="opacity-70">Sales Revenue</span>
            <span>{money(totals.sold.revenue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-70">− Cost of Sold Items</span>
            <span className="text-rose-500">−{money(totals.cost.sold)}</span>
          </div>
          <div className="flex justify-between font-medium border-t pt-1 mt-1">
            <span>Gross Profit</span>
            <span className={pnlColor(totals.sold.profit)}>{money(totals.sold.profit)}</span>
          </div>
          <div className="flex justify-between opacity-70 mt-1">
            <span>− Expenses</span>
            <span className="text-rose-500">−{money(totals.expenses.total)}</span>
          </div>
          <div className="flex justify-between opacity-70">
            <span>− Grading</span>
            <span className="text-rose-500">−{money(totals.grading.total)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-1 mt-1">
            <span>Net Realized P&amp;L</span>
            <span className={pnlColor(totals.pnl.realized)}>
              {totals.pnl.realized >= 0 ? "+" : ""}
              {money(totals.pnl.realized)}
            </span>
          </div>
          <div className="flex justify-between opacity-70 mt-2">
            <span>Unrealized Gain (inventory)</span>
            <span className={pnlColor(totals.pnl.unrealized)}>
              {totals.pnl.unrealized >= 0 ? "+" : ""}
              {money(totals.pnl.unrealized)}
            </span>
          </div>
          <div className="flex justify-between font-bold border-t pt-1 mt-1">
            <span>Total Position</span>
            <span className={pnlColor(totals.pnl.total)}>
              {totals.pnl.total >= 0 ? "+" : ""}
              {money(totals.pnl.total)}
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
