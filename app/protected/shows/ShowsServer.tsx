import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import type { ShowSession } from "./actions";
import NewShowForm from "./NewShowForm";
import ShowsList from "./ShowsList";

// ── Shows ──
// One list of surface cards: the live show first, then UPCOMING, then PAST.
// Lifetime P&L lives on Finance; starting and ending a show lives in POS.
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-4">
      <h1 className="text-xl font-bold tracking-tight text-foreground">Shows</h1>
      <NewShowForm hasActive={hasActive} />
      <ShowsList shows={shows} />
    </div>
  );
}
