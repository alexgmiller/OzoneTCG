import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui";
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
        <div className="mx-auto w-full max-w-2xl space-y-4 pt-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      }
    >
      <CalendarPageInner />
    </Suspense>
  );
}
