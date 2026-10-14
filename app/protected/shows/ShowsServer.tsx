import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { MoneyDisplay, StatCard } from "@/components/ui";
import type { ShowSession } from "./actions";
import NewShowForm from "./NewShowForm";
import ShowsList from "./ShowsList";

export default async function ShowsServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("show_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);

  const shows = (data ?? []) as ShowSession[];
  const hasActive = shows.some((s) => s.status === "active");

  // ── Lifetime stats ──
  const completed = shows.filter((s) => s.status === "completed");
  const totalPL = completed.reduce((sum, s) => sum + (s.net_pl ?? 0), 0);
  const avgPL = completed.length > 0 ? totalPL / completed.length : 0;
  const cardsSold = completed.reduce((sum, s) => sum + (s.cards_sold ?? 0), 0);

  return (
    <div className="w-full max-w-2xl mx-auto py-4 space-y-5">
      <h1 className="text-xl font-bold tracking-tight text-foreground">Shows</h1>

      <NewShowForm hasActive={hasActive} />

      {completed.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Lifetime P&L"
            value={<MoneyDisplay amount={totalPL} showSign />}
            delta={`${completed.length} show${completed.length === 1 ? "" : "s"}`}
            className="col-span-2 sm:col-span-1"
          />
          <StatCard label="Avg / show" value={<MoneyDisplay amount={avgPL} showSign />} />
          <StatCard
            label="Cards sold"
            value={<span className="text-foreground">{cardsSold}</span>}
          />
        </div>
      )}

      <ShowsList shows={shows} />
    </div>
  );
}
