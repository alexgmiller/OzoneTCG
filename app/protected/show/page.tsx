import { Suspense } from "react";
import ShowClient from "./ShowClient";
import { getShowHistory } from "./actions";

async function ShowPageInner() {
  // Load recent completed shows for the summary screen and "resume" flow
  const history = await getShowHistory(10).catch(() => []);
  return <ShowClient recentShows={history} />;
}

export default function ShowPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center opacity-40 text-sm">Loading Show Mode…</div>}>
      <ShowPageInner />
    </Suspense>
  );
}
