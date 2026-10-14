import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { getActiveShow } from "@/app/protected/shows/actions";
import { SectionHeader } from "@/components/ui";
import DashboardClient from "./DashboardClient";
import ActiveShowChip from "./ActiveShowChip";
import TodayStats from "./TodayStats";
import QuickActions from "./QuickActions";
import RecentActivity from "./RecentActivity";
import LifetimeSection from "./LifetimeSection";
import { computeDashboardTotals, type ItemRow, type ExpenseRow, type GradingRow } from "./totals";
import { groupRecentDeals, type TxRow } from "./activity";

// ── Queries ──

const TX_COLS = "id,trade_group_id,transaction_type,date,sale_price,cash_paid,cost_basis,cash_difference";
const TODAY_WINDOW_MS = 48 * 60 * 60 * 1000; // covers "today" in any browser timezone
const RECENT_ROW_LIMIT = 100; // per-card rows; folded into the last 5 deals

export default async function DashboardServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();
  const since = new Date(Date.now() - TODAY_WINDOW_MS).toISOString();

  const [activeShow, todayRes, recentRes, itemsRes, expRes, gradRes] = await Promise.all([
    getActiveShow(),
    supabase
      .from("card_transactions")
      .select(TX_COLS)
      .eq("workspace_id", workspaceId)
      .gte("date", since),
    supabase
      .from("card_transactions")
      .select(`${TX_COLS},card:items!card_id(name)`)
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false })
      .limit(RECENT_ROW_LIMIT),
    supabase
      .from("items")
      .select("category,owner,status,cost,market,sold_price,previous_sales,consigner_payout")
      .eq("workspace_id", workspaceId),
    supabase.from("expenses").select("paid_by,cost").eq("workspace_id", workspaceId),
    supabase.from("grading").select("cost").eq("workspace_id", workspaceId),
  ]);

  for (const res of [todayRes, recentRes, itemsRes, expRes, gradRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const todayRows = (todayRes.data ?? []) as unknown as TxRow[];
  const recentDeals = groupRecentDeals((recentRes.data ?? []) as unknown as TxRow[], 5);
  const totals = computeDashboardTotals(
    (itemsRes.data ?? []) as ItemRow[],
    (expRes.data ?? []) as ExpenseRow[],
    (gradRes.data ?? []) as GradingRow[],
  );

  // ── Layout ──

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
      <h1 className="sr-only">Home</h1>
      <DashboardClient workspaceId={workspaceId} />

      <ActiveShowChip show={activeShow} />

      <section className="space-y-3">
        <SectionHeader>Today</SectionHeader>
        <TodayStats rows={todayRows} />
      </section>

      <QuickActions />

      <section className="space-y-3">
        <SectionHeader>Recent activity</SectionHeader>
        <RecentActivity deals={recentDeals} />
      </section>

      <LifetimeSection totals={totals} />
    </div>
  );
}
