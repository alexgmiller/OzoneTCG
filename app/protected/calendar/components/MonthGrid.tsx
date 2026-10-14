"use client";

import { cn } from "@/lib/utils";
import type { DayActivity } from "../actions";
import { DAY_ABBREVS, pad2, truncateName } from "./helpers";
import { DotRow, Legend, activityKinds } from "./ActivityDots";

// ── Compact money for tiny cells ("$1.2k") ────────────────────────────────────

function fmtShort$(n: number) {
  const abs = Math.abs(n);
  const prefix = n < 0 ? "–$" : "$";
  if (abs >= 1000) return prefix + (abs / 1000).toFixed(1) + "k";
  return prefix + abs.toFixed(0);
}

// ── Day cell ──────────────────────────────────────────────────────────────────

function DayCell({
  day, isToday, isSelected, isCurrentMonth, activity, onClick,
}: {
  day: number; isToday: boolean; isSelected: boolean;
  isCurrentMonth: boolean; activity?: DayActivity; onClick: () => void;
}) {
  const kinds = activityKinds(activity);
  const hasShows = (activity?.shows ?? []).length > 0;
  const pl = activity?.netPL ?? 0;
  const showName = hasShows ? activity!.shows[0].name : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-20 w-full select-none flex-col items-start gap-0.5 rounded-lg border p-1 text-left",
        "transition-colors duration-150",
        isSelected
          ? "border-accent-primary-border bg-accent-primary-soft"
          : hasShows
            ? "border-warning-border bg-warning-soft hover:bg-muted"
            : "border-transparent hover:bg-muted",
        isToday && !isSelected && !hasShows && "bg-accent-primary-soft",
        !isCurrentMonth && "opacity-30",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold leading-none tabular-nums",
          isToday ? "bg-primary text-primary-foreground" : "text-foreground",
        )}
      >
        {day}
      </span>

      {showName && (
        <span className="w-full truncate text-xs font-medium leading-tight text-warning">
          {truncateName(showName, 10)}
        </span>
      )}

      <div className="flex-1" />

      <div className="flex w-full flex-wrap items-end justify-between gap-x-1 gap-y-0.5">
        <DotRow kinds={kinds} />
        {pl !== 0 && (
          <span
            className={cn(
              "font-mono text-xs font-semibold leading-none tabular-nums",
              pl > 0 ? "text-positive" : "text-negative",
            )}
          >
            {fmtShort$(pl)}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Cell layout for a month ───────────────────────────────────────────────────

type Cell = { dateStr: string; day: number; currentMonth: boolean };

function buildCells(year: number, month: number): Cell[] {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();
  const cells: Cell[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    let m = month - 1, y = year;
    if (m < 1) { m = 12; y--; }
    cells.push({ dateStr: `${y}-${pad2(m)}-${pad2(d)}`, day: d, currentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: `${year}-${pad2(month)}-${pad2(d)}`, day: d, currentMonth: true });
  }
  let trailing = 1;
  while (cells.length % 7 !== 0 || cells.length < 35) {
    let m = month + 1, y = year;
    if (m > 12) { m = 1; y++; }
    cells.push({ dateStr: `${y}-${pad2(m)}-${pad2(trailing)}`, day: trailing, currentMonth: false });
    trailing++;
  }
  return cells;
}

// ── Month grid ────────────────────────────────────────────────────────────────

export function MonthGrid({
  year, month, todayStr, selectedDate, activityMap, onSelect,
}: {
  year: number;
  month: number;
  todayStr: string;
  selectedDate: string | null;
  activityMap: Map<string, DayActivity>;
  onSelect: (dateStr: string) => void;
}) {
  const cells = buildCells(year, month);

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAY_ABBREVS.map((d) => (
          <div key={d} className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => (
          <DayCell
            key={cell.dateStr}
            day={cell.day}
            isToday={cell.dateStr === todayStr}
            isSelected={cell.dateStr === selectedDate}
            isCurrentMonth={cell.currentMonth}
            activity={activityMap.get(cell.dateStr)}
            onClick={() => onSelect(cell.dateStr)}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-end"><Legend /></div>
    </div>
  );
}
