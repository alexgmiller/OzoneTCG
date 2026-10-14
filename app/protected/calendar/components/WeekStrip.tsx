"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayActivity } from "../actions";
import { DAY_ABBREVS, addDays, truncateName } from "./helpers";
import { DotRow, Legend, activityKinds } from "./ActivityDots";

// ── Week cell ─────────────────────────────────────────────────────────────────

function WeekCell({
  dateStr, isToday, isSelected, activity, onClick,
}: {
  dateStr: string; isToday: boolean; isSelected: boolean;
  activity?: DayActivity; onClick: () => void;
}) {
  const d = new Date(dateStr + "T12:00:00");
  const kinds = activityKinds(activity);
  const hasShows = (activity?.shows ?? []).length > 0;
  const showName = hasShows ? activity!.shows[0].name : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border px-0.5 py-2",
        "transition-colors duration-150",
        isSelected
          ? "border-accent-primary-border bg-accent-primary-soft"
          : hasShows
            ? "border-warning-border bg-warning-soft hover:bg-muted"
            : "border-transparent hover:bg-muted",
        isToday && !isSelected && !hasShows && "bg-accent-primary-soft",
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {DAY_ABBREVS[d.getDay()]}
      </span>

      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
          isToday ? "bg-primary text-primary-foreground" : "text-foreground",
        )}
      >
        {d.getDate()}
      </span>

      {showName ? (
        <span className="max-w-full truncate text-xs font-medium leading-tight text-warning">
          {truncateName(showName, 7)}
        </span>
      ) : (
        <span className="invisible text-xs leading-tight">·</span>
      )}

      <DotRow kinds={kinds} />
    </button>
  );
}

// ── Week strip ────────────────────────────────────────────────────────────────

export function WeekStrip({
  weekStart, todayStr, selectedDate, activityMap, onSelect, onPrev, onNext,
}: {
  weekStart: string;
  todayStr: string;
  selectedDate: string | null;
  activityMap: Map<string, DayActivity>;
  onSelect: (dateStr: string) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) weekDays.push(addDays(weekStart, i));

  const navCls =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted";

  return (
    <div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onPrev} className={navCls} aria-label="Previous week">
          <ChevronLeft size={18} />
        </button>
        <div className="flex min-w-0 flex-1 gap-1">
          {weekDays.map((dateStr) => (
            <WeekCell
              key={dateStr}
              dateStr={dateStr}
              isToday={dateStr === todayStr}
              isSelected={dateStr === selectedDate}
              activity={activityMap.get(dateStr)}
              onClick={() => onSelect(dateStr)}
            />
          ))}
        </div>
        <button type="button" onClick={onNext} className={navCls} aria-label="Next week">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="mt-2 flex justify-end px-1"><Legend /></div>
    </div>
  );
}
