import { Suspense } from "react";
import { getShowsCalendarData } from "./actions";
import ShowsCalendarClient from "./ShowsCalendarClient";

async function ShowsCalendarLoader() {
  const data = await getShowsCalendarData();

  return (
    <div className="w-full space-y-1">
      <div className="py-4">
        <h1 className="text-xl font-semibold">Upcoming Shows</h1>
        <p className="text-xs opacity-40 mt-0.5">Card shows near you · Updated daily</p>
      </div>
      <ShowsCalendarClient {...data} />
    </div>
  );
}

export default function ShowsCalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="py-8 text-center text-sm opacity-40">Loading shows…</div>
      }
    >
      <ShowsCalendarLoader />
    </Suspense>
  );
}
