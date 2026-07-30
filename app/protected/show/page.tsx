import { Suspense } from "react";
import ShowClient from "./ShowClient";
import { getShowHistory, getActiveShowSession } from "./actions";
import ShowLoading from "./loading";

async function ShowPageInner() {
  const [history, activeSession] = await Promise.all([
    getShowHistory(10).catch(() => []),
    getActiveShowSession().catch(() => null),
  ]);
  return <ShowClient recentShows={history} initialActiveSession={activeSession} />;
}

export default function ShowPage() {
  return (
    <Suspense fallback={<ShowLoading />}>
      <ShowPageInner />
    </Suspense>
  );
}
