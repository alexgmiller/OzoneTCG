import { Suspense } from "react";
import { connection } from "next/server";
import CalendarClient from "./CalendarClient";
import { getCalendarMonthData } from "./actions";

async function CalendarPageInner() {
  // "Today" must be computed at request time, not at prerender time
  await connection();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  const todayStr = now.toISOString().slice(0, 10);

  const initialData = await getCalendarMonthData(year, month).catch(() => []);

  return (
    <CalendarClient
      initialData={initialData}
      initialYear={year}
      initialMonth={month}
      todayStr={todayStr}
    />
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center opacity-40 text-sm">Loading Calendar…</div>
      }
    >
      <CalendarPageInner />
    </Suspense>
  );
}
