"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui";
import {
  getCalendarMonthData,
  getDayDetail,
  scheduleShow,
  type DayActivity,
  type DayDetail,
} from "./actions";
import { MONTH_NAMES, addDays, getSundayOfWeek, type ViewMode } from "./components/helpers";
import { TodayWidget } from "./components/TodayWidget";
import { MonthGrid } from "./components/MonthGrid";
import { WeekStrip } from "./components/WeekStrip";
import { DayDetailPanel } from "./components/DayDetail";
import { ScheduleShowModal, type ScheduleFields } from "./components/ScheduleShowModal";
import { Lightbox } from "./components/Lightbox";

const iconBtn =
  "flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted disabled:opacity-40";

// ── Calendar page client ──────────────────────────────────────────────────────

export default function CalendarClient({
  initialData, initialYear, initialMonth, todayStr,
}: {
  initialData: DayActivity[];
  initialYear: number;
  initialMonth: number;
  todayStr: string;
}) {
  const [currentYear, setCurrentYear] = useState(initialYear);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [monthData, setMonthData] = useState<DayActivity[]>(initialData);
  const [monthLoading, startMonthTransition] = useTransition();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // View mode: week by default, then localStorage / viewport on mount
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cal_view") as ViewMode | null;
      if (stored === "week" || stored === "month") setViewMode(stored);
      else if (window.innerWidth >= 768) setViewMode("month");
    } catch {}
  }, []);

  const [weekStart, setWeekStart] = useState(() => getSundayOfWeek(todayStr));

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(todayStr);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleErr, setScheduleErr] = useState("");

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const activityMap = new Map<string, DayActivity>();
  for (const d of monthData) activityMap.set(d.date, d);

  // ── View toggle ─────────────────────────────────────────────────────────────

  function setView(mode: ViewMode) {
    setViewMode(mode);
    try { localStorage.setItem("cal_view", mode); } catch {}
  }

  // ── Month navigation ────────────────────────────────────────────────────────

  function loadMonth(y: number, m: number) {
    startMonthTransition(async () => {
      const data = await getCalendarMonthData(y, m).catch(() => []);
      setCurrentYear(y);
      setCurrentMonth(m);
      setMonthData(data);
    });
  }

  function prevMonth() {
    let y = currentYear, m = currentMonth - 1;
    if (m < 1) { m = 12; y--; }
    loadMonth(y, m);
  }
  function nextMonth() {
    let y = currentYear, m = currentMonth + 1;
    if (m > 12) { m = 1; y++; }
    loadMonth(y, m);
  }
  function goToday() {
    const now = new Date();
    loadMonth(now.getFullYear(), now.getMonth() + 1);
    setWeekStart(getSundayOfWeek(todayStr));
    setSelectedDate(null);
    setDayDetail(null);
  }

  // ── Week navigation: load the month when the week crosses a boundary ────────

  function moveWeek(delta: number) {
    const newStart = addDays(weekStart, delta);
    setWeekStart(newStart);
    const probe = delta > 0 ? addDays(newStart, 3) : newStart;
    const wm = parseInt(probe.slice(5, 7));
    const wy = parseInt(probe.slice(0, 4));
    if (wm !== currentMonth || wy !== currentYear) loadMonth(wy, wm);
  }

  // ── Day selection ───────────────────────────────────────────────────────────

  const selectDay = useCallback(async (dateStr: string) => {
    if (selectedDate === dateStr) {
      setSelectedDate(null);
      setDayDetail(null);
      return;
    }
    setSelectedDate(dateStr);
    setDetailLoading(true);
    try {
      setDayDetail(await getDayDetail(dateStr));
    } catch {
      setDayDetail({ date: dateStr, buys: [], sells: [], trades: [], expenses: [], shows: [] });
    } finally {
      setDetailLoading(false);
    }
  }, [selectedDate]);

  // ── Schedule show ───────────────────────────────────────────────────────────

  function openScheduleModal(dateStr?: string) {
    setScheduleDate(dateStr ?? todayStr);
    setScheduleErr("");
    setScheduleOpen(true);
  }

  async function handleScheduleShow(fields: ScheduleFields) {
    if (!fields.name.trim()) { setScheduleErr("Show name is required"); return; }
    setScheduleBusy(true);
    setScheduleErr("");
    try {
      await scheduleShow({
        name: fields.name.trim(),
        date: scheduleDate,
        location: fields.location || undefined,
        hours: fields.hours || undefined,
        startingCash: fields.startingCash ? parseFloat(fields.startingCash) : undefined,
        boothFee: fields.boothFee ? parseFloat(fields.boothFee) : undefined,
        notes: fields.notes || undefined,
      });
      setScheduleOpen(false);
      const data = await getCalendarMonthData(currentYear, currentMonth).catch(() => monthData);
      setMonthData(data);
      if (selectedDate === scheduleDate) {
        const detail = await getDayDetail(scheduleDate).catch(() => dayDetail);
        setDayDetail(detail);
      }
    } catch (e: unknown) {
      setScheduleErr(e instanceof Error ? e.message : "Failed to schedule show");
    } finally {
      setScheduleBusy(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-28 pt-4">
      <TodayWidget
        todayStr={todayStr}
        activity={activityMap.get(todayStr)}
        onOpen={() => selectDay(todayStr)}
      />

      {/* ── Calendar header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={prevMonth} className={iconBtn} disabled={monthLoading} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div className="flex min-w-36 items-center justify-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[currentMonth - 1]} <span className="tabular-nums">{currentYear}</span>
            </h2>
            {monthLoading && <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" />}
          </div>
          <button type="button" onClick={nextMonth} className={iconBtn} disabled={monthLoading} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="h-11 rounded-lg bg-muted px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Today
          </button>

          <div className="flex h-11 items-center overflow-hidden rounded-lg border border-border">
            {(["week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  "h-full px-3 text-sm font-semibold capitalize transition-colors duration-150",
                  viewMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openScheduleModal(selectedDate ?? todayStr)}
            className="flex h-11 items-center gap-1 rounded-lg bg-accent-primary-soft px-3 text-sm font-semibold text-accent-primary transition-colors duration-150 hover:bg-accent-primary-border"
          >
            <Plus size={16} />
            Show
          </button>
        </div>
      </div>

      {viewMode === "week" ? (
        <WeekStrip
          weekStart={weekStart}
          todayStr={todayStr}
          selectedDate={selectedDate}
          activityMap={activityMap}
          onSelect={selectDay}
          onPrev={() => moveWeek(-7)}
          onNext={() => moveWeek(7)}
        />
      ) : (
        <MonthGrid
          year={currentYear}
          month={currentMonth}
          todayStr={todayStr}
          selectedDate={selectedDate}
          activityMap={activityMap}
          onSelect={selectDay}
        />
      )}

      {/* ── Day detail ── */}
      {selectedDate && (
        detailLoading ? (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <Skeleton variant="text" className="w-1/3" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <DayDetailPanel
            detail={dayDetail}
            dateStr={selectedDate}
            todayStr={todayStr}
            onScheduleShow={() => openScheduleModal(selectedDate)}
            onClose={() => { setSelectedDate(null); setDayDetail(null); }}
            onOpenImage={setLightboxUrl}
          />
        )
      )}

      <ScheduleShowModal
        open={scheduleOpen}
        date={scheduleDate}
        onDateChange={setScheduleDate}
        onClose={() => setScheduleOpen(false)}
        onSubmit={handleScheduleShow}
        busy={scheduleBusy}
        err={scheduleErr}
      />

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
