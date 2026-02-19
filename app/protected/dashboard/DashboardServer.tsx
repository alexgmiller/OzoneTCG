import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import DashboardClient from "./DashboardClient";
import DashboardCharts, { type ChartItem } from "./DashboardCharts";
import { computeDashboardTotals } from "./totals";
import type { ItemRow, ExpenseRow, GradingRow } from "./totals";

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function whoOwesLine(net: number) {
  if (Math.abs(net) < 0.005) return "Settled up — no one owes anything.";
  if (net > 0) return `Mila owes Alex ${money(net)}`;
  return `Alex owes Mila ${money(Math.abs(net))}`;
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
      .select("category,owner,status,cost,market,sell_price,current_sale,sold_price,previous_sales")
      .eq("workspace_id", workspaceId),
    supabase
      .from("expenses")
      .select("paid_by,cost")
      .eq("workspace_id", workspaceId),
    supabase
      .from("grading")
      .select("cost")
      .eq("workspace_id", workspaceId),
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

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <div className="text-sm opacity-70">Workspace: {workspaceId}</div>
        </div>
      </div>

      {/* realtime hook (keeps dashboard fresh when other user edits) */}
      <DashboardClient workspaceId={workspaceId} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="border rounded-xl p-3">
          <div className="text-xs opacity-70">Active Market (Inv+Listed)</div>
          <div className="text-lg font-semibold">{money(totals.market.active_total)}</div>
          <div className="text-xs opacity-60 mt-1">
            Inv {money(totals.market.inventory)} • Listed {money(totals.market.listed)}
          </div>
        </div>

        <div className="border rounded-xl p-3">
          <div className="text-xs opacity-70">Cost Basis (All)</div>
          <div className="text-lg font-semibold">{money(totals.cost.total_all)}</div>
          <div className="text-xs opacity-60 mt-1">
            Inv {money(totals.cost.inventory)} • Listed {money(totals.cost.listed)} • Sold {money(totals.cost.sold)}
          </div>
        </div>

        <div className="border rounded-xl p-3">
          <div className="text-xs opacity-70">Sold Revenue</div>
          <div className="text-lg font-semibold">{money(totals.sold.revenue)}</div>
          <div className="text-xs opacity-60 mt-1">
            Sold Profit (rev - cost): {money(totals.sold.profit)}
          </div>
        </div>

        <div className="border rounded-xl p-3">
          <div className="text-xs opacity-70">Items</div>
          <div className="text-lg font-semibold">{totals.counts.total}</div>
          <div className="text-xs opacity-60 mt-1">
            Inv {totals.counts.inventory} • Listed {totals.counts.listed} • Sold {totals.counts.sold}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Owners</div>

          {(["shared", "alex", "mila"] as const).map((o) => {
            const b = totals.breakdowns.owners[o];
            return (
              <div key={o} className="flex items-center justify-between py-2 border-t first:border-t-0">
                <div className="text-sm">
                  <div className="font-medium capitalize">{o}</div>
                  <div className="text-xs opacity-70">{b.count} items</div>
                </div>
                <div className="text-right text-sm">
                  <div>Active Market: {money(b.market_active)}</div>
                  <div className="text-xs opacity-70">
                    Cost: {money(b.cost)} • Sold rev: {money(b.revenue_sold)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Categories</div>

          {(["single", "slab", "sealed"] as const).map((c) => {
            const b = totals.breakdowns.categories[c];
            return (
              <div key={c} className="flex items-center justify-between py-2 border-t first:border-t-0">
                <div className="text-sm">
                  <div className="font-medium capitalize">{c}</div>
                  <div className="text-xs opacity-70">{b.count} items</div>
                </div>
                <div className="text-right text-sm">
                  <div>Active Market: {money(b.market_active)}</div>
                  <div className="text-xs opacity-70">Cost: {money(b.cost)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expenses / Who owes who / Grading */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Expenses</div>
          <div className="text-sm">Total: {money(totals.expenses.total)}</div>
          <div className="text-xs opacity-70 mt-1">
            Alex {money(totals.expenses.by_paid_by.alex)} • Mila {money(totals.expenses.by_paid_by.mila)} • Shared{" "}
            {money(totals.expenses.by_paid_by.shared)}
          </div>
        </div>

        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Who owes who</div>
          <div className="text-sm">{whoOwesLine(totals.owes.net)}</div>
          <div className="text-xs opacity-70 mt-2">
            Mila → Alex: {money(totals.owes.mila_owes_alex)} • Alex → Mila: {money(totals.owes.alex_owes_mila)}
          </div>
          <div className="text-xs opacity-60 mt-1">50/50 split of personal-paid expenses (shared excluded).</div>
        </div>

        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Grading</div>
          <div className="text-sm">Total grading cost: {money(totals.grading.total)}</div>
        </div>
      </div>

      {/* Charts */}
      <div>
        <div className="font-medium mb-3">Activity Charts</div>
        <DashboardCharts chartItems={(chartItems ?? []) as ChartItem[]} />
      </div>
    </div>
  );
}
