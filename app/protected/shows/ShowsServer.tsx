import { createClient } from "@/lib/supabase/server";
import { getWorkspaceId } from "@/lib/getWorkspaceId";
import { PageHeader } from "@/components/ui";
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

  // Desktop (lg+): the list takes two thirds, New show sits in the right
  // column (sticky); DOM order stays the phone order
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-4 lg:max-w-6xl">
      <PageHeader title="Shows" />
      <div className="space-y-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6 lg:space-y-0">
        <div className="lg:sticky lg:top-4 lg:col-start-3 lg:row-start-1">
          <NewShowForm hasActive={hasActive} />
        </div>
        <div className="lg:col-span-2 lg:row-start-1">
          <ShowsList shows={shows} />
        </div>
      </div>
    </div>
  );
}
