import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { getActiveShow } from "@/app/protected/shows/actions";
import DashboardClient from "./DashboardClient";
import HomeClient from "./HomeClient";
import ActiveShowChip from "./ActiveShowChip";
import QuickActions from "./QuickActions";
import MostValuable from "./MostValuable";
import RecentActivity from "./RecentActivity";
import { groupRecentDeals, type TxRow } from "./activity";
import {
  inStockCounts, realizedProfitByDay, topValuable,
  type SellRow, type SnapshotPoint, type StockItem,
} from "./home";

// ── Queries ──

const TX_COLS = "id,trade_group_id,transaction_type,date,sale_price,cash_paid,cost_basis,cash_difference,payment_method";
const ITEM_COLS = "id,name,category,status,market,cost,set_name,card_number,grade,condition,image_url,consigner_id";
const RECENT_ROW_LIMIT = 400; // per-card rows; folded into the last 5 deals (bulk deals span many rows)

export default async function DashboardServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const [activeShow, itemsRes, recentRes, sellsRes, snapsRes] = await Promise.all([
    getActiveShow(),
    supabase.from("items").select(ITEM_COLS).eq("workspace_id", workspaceId),
    supabase
      .from("card_transactions")
      .select(`${TX_COLS},card:items!card_id(name,image_url)`)
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false })
      .limit(RECENT_ROW_LIMIT),
    supabase
      .from("card_transactions")
      .select("date,sale_price,cost_basis")
      .eq("workspace_id", workspaceId)
      .eq("transaction_type", "sell")
      .order("date", { ascending: true }),
    supabase
      .from("inventory_snapshots")
      .select("date,total_fmv,total_cost,item_count")
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: true }),
  ]);

  for (const res of [itemsRes, recentRes, sellsRes]) {
    if (res.error) throw new Error(res.error.message);
  }
  // The snapshots table arrives with migrations/20261016_inventory_snapshots.sql;
  // until it is applied the chart shows its empty state rather than erroring.
  const snapshots = (snapsRes.error ? [] : snapsRes.data ?? []) as SnapshotPoint[];

  // Revenue since the show opened — for a one-day show that is "today"
  const showRevenue = activeShow ? await showSellTotal(supabase, workspaceId, activeShow.id) : 0;

  const items = (itemsRes.data ?? []) as StockItem[];
  const inStockValue = items.reduce((s, it) => s + (it.status === "inventory" ? it.market ?? 0 : 0), 0);
  const counts = inStockCounts(items);
  const top = topValuable(items, 10);
  const profitPoints = realizedProfitByDay((sellsRes.data ?? []) as SellRow[]);
  const recentDeals = groupRecentDeals((recentRes.data ?? []) as unknown as TxRow[], 5);

  // ── Layout ──
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
      <h1 className="sr-only">Home</h1>
      <DashboardClient workspaceId={workspaceId} />

      <ActiveShowChip show={activeShow} revenue={showRevenue} />

      <HomeClient
        inStockValue={inStockValue}
        snapshots={snapshots}
        profitPoints={profitPoints}
        counts={counts}
      />

      <QuickActions />

      <section className="space-y-3">
        <h2 className="section-label">Most valuable</h2>
        <MostValuable items={top} />
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Recent</h2>
        <RecentActivity deals={recentDeals} />
      </section>
    </div>
  );
}

async function showSellTotal(
  supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string, showId: string,
): Promise<number> {
  const { data } = await supabase
    .from("card_transactions")
    .select("sale_price")
    .eq("workspace_id", workspaceId)
    .eq("show_session_id", showId)
    .eq("transaction_type", "sell");
  return (data ?? []).reduce((s, r) => s + (r.sale_price ?? 0), 0);
}
