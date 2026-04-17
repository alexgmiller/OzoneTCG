import { Suspense } from "react";
import ShowClient from "./ShowClient";
import { getShowHistory, getActiveShowSession } from "./actions";

async function ShowPageInner() {
  const [history, activeSession] = await Promise.all([
    getShowHistory(10).catch(() => []),
    getActiveShowSession().catch(() => null),
  ]);
  return <ShowClient recentShows={history} initialActiveSession={activeSession} />;
}

export default function ShowPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center opacity-40 text-sm">Loading Show Mode…</div>}>
      <ShowPageInner />
    </Suspense>
  );
}
