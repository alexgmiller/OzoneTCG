import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import type { ShowSession } from "@/app/protected/show/actions";
import ShowsClient from "./ShowsClient";
import ShowsPastList from "./ShowsPastList";

function money(v: number) {
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function moneySign(v: number) {
  return (v >= 0 ? "+" : "−") + money(v);
}

export default async function ShowsServer() {
  const supabase = await createClient();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await supabase
    .from("show_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false });

  if (error) throw new Error(error.message);

  const shows = (data ?? []) as ShowSession[];
  const active = shows.find((s) => s.status === "active");

  // Active show → jump straight into show mode
  if (active) {
    redirect("/protected/show");
  }

  const completed = shows.filter((s) => s.status === "completed");

  const totalShows = completed.length;
  const totalPL = completed.reduce((s, x) => s + (x.net_pl ?? 0), 0);
  const avgPL = totalShows > 0 ? totalPL / totalShows : null;
  const bestShow = completed.reduce(
    (best, s) => (s.net_pl > (best?.net_pl ?? -Infinity) ? s : best),
    null as ShowSession | null
  );
  const totalCardsBought = completed.reduce((s, x) => s + (x.cards_bought ?? 0), 0);
  const totalCardsSold = completed.reduce((s, x) => s + (x.cards_sold ?? 0), 0);

  return (
    <div className="p-4 space-y-5">
      <h1 className="text-xl font-bold">Shows</h1>

      {/* Start a Show */}
      <ShowsClient />

      {/* Lifetime stats */}
      {totalShows > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border rounded-xl p-3">
            <div className="text-xs opacity-50 uppercase tracking-wide">Total P&L</div>
            <div className={`text-lg font-semibold mt-0.5 ${totalPL >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {moneySign(totalPL)}
            </div>
            <div className="text-xs opacity-40 mt-1">{totalShows} shows</div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="text-xs opacity-50 uppercase tracking-wide">Avg per show</div>
            <div className={`text-lg font-semibold mt-0.5 ${(avgPL ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {avgPL != null ? moneySign(avgPL) : "—"}
            </div>
            <div className="text-xs opacity-40 mt-1">per show</div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="text-xs opacity-50 uppercase tracking-wide">Cards bought</div>
            <div className="text-lg font-semibold mt-0.5">{totalCardsBought}</div>
            <div className="text-xs opacity-40 mt-1">lifetime</div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="text-xs opacity-50 uppercase tracking-wide">Best show</div>
            <div className={`text-lg font-semibold mt-0.5 ${(bestShow?.net_pl ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {bestShow ? moneySign(bestShow.net_pl) : "—"}
            </div>
            <div className="text-xs opacity-40 mt-1 truncate">{bestShow?.name ?? "—"}</div>
          </div>
        </div>
      )}

      {/* Past shows */}
      {totalShows > 0 && (
        <div>
          <div className="text-xs font-medium mb-2 opacity-60 uppercase tracking-wide">Past Shows</div>
          <ShowsPastList shows={completed} />
        </div>
      )}

      {totalShows === 0 && (
        <div className="text-center py-8 opacity-40">
          <div className="text-sm">No completed shows yet.</div>
          <div className="text-xs mt-1">Start your first show above.</div>
        </div>
      )}

      {/* Total cards sold lifetime stat */}
      {totalCardsSold > 0 && (
        <div className="text-xs opacity-30 text-center pb-2">
          {totalCardsBought} cards bought · {totalCardsSold} cards sold across all shows
        </div>
      )}
    </div>
  );
}
