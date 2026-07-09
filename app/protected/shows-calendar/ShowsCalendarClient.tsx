"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BookmarkIcon, CalendarIcon, ChevronDown, ChevronUp,
  ExternalLink, MapPin, Navigation, Sparkles, Star, TriangleAlert,
} from "lucide-react";
import { haversineDistanceMiles } from "@/lib/showsGeocode";
import { EmptyState } from "@/components/ui/EmptyState";
import { toggleShowBookmark } from "./actions";
import type { CardShow, ShowsCalendarData } from "./actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type LocationMode = "radius" | "state";
type DateRange = "30d" | "90d" | "6m" | "all";

const RADIUS_OPTIONS = [
  { value: 50,  label: "50 mi" },
  { value: 100, label: "100 mi" },
  { value: 200, label: "200 mi" },
  { value: 500, label: "500 mi" },
  { value: 9999, label: "All US" },
];

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "30d", label: "Next 30 days" },
  { value: "90d", label: "Next 90 days" },
  { value: "6m",  label: "Next 6 months" },
  { value: "all", label: "All upcoming" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateRange(start: string, end: string): string {
  if (start === end) return fmtDate(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function mapsUrl(homeAddress: string | null, show: CardShow): string {
  const dest = show.venue_address ?? `${show.venue_name ?? show.city}, ${show.city}, ${show.state}`;
  if (homeAddress) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(homeAddress)}&destination=${encodeURIComponent(dest)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
}

// ── Show card ─────────────────────────────────────────────────────────────────

function ShowCard({
  show,
  isBookmarked,
  distanceMiles,
  homeAddress,
  onBookmark,
  onCreateSession,
}: {
  show: CardShow;
  isBookmarked: boolean;
  distanceMiles: number | null;
  homeAddress: string | null;
  onBookmark: (id: string) => void;
  onCreateSession: (show: CardShow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="border rounded-xl overflow-hidden"
      style={{ borderColor: show.is_major ? "rgba(139,92,246,0.30)" : "rgba(255,255,255,0.07)" }}
    >
      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Date block */}
          <div
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-center min-w-[44px]"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <div className="text-[10px] uppercase tracking-wide opacity-40 font-mono">
              {new Date(show.start_date + "T00:00:00").toLocaleDateString(undefined, { month: "short" })}
            </div>
            <div className="text-lg font-bold tabular-nums leading-none">
              {new Date(show.start_date + "T00:00:00").getDate()}
            </div>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold leading-tight">{show.name}</span>
              {show.is_major && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.30)" }}
                >
                  <Sparkles size={9} />
                  Major
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-xs opacity-50 flex-wrap">
              <CalendarIcon size={11} className="shrink-0" />
              <span>{fmtDateRange(show.start_date, show.end_date)}</span>
              <span className="opacity-40">·</span>
              <MapPin size={11} className="shrink-0" />
              <span>{show.city}, {show.state}</span>
              {distanceMiles !== null && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="font-mono tabular-nums">{Math.round(distanceMiles)} mi</span>
                </>
              )}
            </div>
            {show.venue_name && (
              <div className="text-xs opacity-40 mt-0.5 truncate">{show.venue_name}</div>
            )}
          </div>

          {/* Bookmark */}
          <button
            onClick={() => startTransition(() => onBookmark(show.id))}
            disabled={pending}
            className={`shrink-0 p-1.5 rounded-lg transition-colors ${
              isBookmarked
                ? "text-amber-400"
                : "opacity-30 hover:opacity-70"
            }`}
            title={isBookmarked ? "Remove bookmark" : "Bookmark show"}
          >
            <Star size={15} fill={isBookmarked ? "currentColor" : "none"} />
          </button>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 opacity-30 hover:opacity-60 transition-opacity p-1"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            {show.description && (
              <p className="text-xs opacity-60 leading-relaxed">{show.description}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <a
                href={mapsUrl(homeAddress, show)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/5"
                style={{ borderColor: "rgba(255,255,255,0.12)" }}
              >
                <Navigation size={12} />
                {homeAddress ? "Directions from home" : "View on Maps"}
              </a>

              {show.website_url && (
                <a
                  href={show.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/5"
                  style={{ borderColor: "rgba(255,255,255,0.12)" }}
                >
                  <ExternalLink size={12} />
                  Show website
                </a>
              )}

              <button
                onClick={() => onCreateSession(show)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                style={{
                  background: "rgba(139,92,246,0.15)",
                  border: "1px solid rgba(139,92,246,0.35)",
                  color: "#c4b5fd",
                }}
              >
                <BookmarkIcon size={12} />
                Start show session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Client ───────────────────────────────────────────────────────────────

export default function ShowsCalendarClient({
  shows: allShows,
  bookmarkedIds: initialBookmarked,
  homeAddress,
  homeLat,
  homeLon,
  lastScrapeAt,
}: ShowsCalendarData) {
  // ── Filter state ─────────────────────────────────────────────────────────
  const [locationMode, setLocationMode] = useState<LocationMode>(
    homeLat !== null ? "radius" : "state",
  );
  const [radiusMiles, setRadiusMiles] = useState(200);
  const [selectedStates, setSelectedStates] = useState<string[]>(() => {
    if (homeAddress) {
      const m = homeAddress.match(/,\s*([A-Z]{2})\b/i);
      if (m) return [m[1].toUpperCase()];
    }
    return [];
  });
  const [dateRange, setDateRange] = useState<DateRange>("90d");
  const [includeMajor, setIncludeMajor] = useState(true);
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);

  // ── Bookmark state ───────────────────────────────────────────────────────
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(initialBookmarked);

  async function handleBookmark(id: string) {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    await toggleShowBookmark(id);
  }

  // ── Session creation redirect ─────────────────────────────────────────────
  function handleCreateSession(show: CardShow) {
    const params = new URLSearchParams({
      name: show.name,
      date: show.start_date,
      venue: show.venue_address ?? `${show.venue_name ?? ""}, ${show.city}, ${show.state}`.replace(/^,\s*/, ""),
    });
    window.location.href = `/protected/show?prefill=${encodeURIComponent(params.toString())}`;
  }

  // ── Derived: date cutoff ──────────────────────────────────────────────────
  const dateCutoff = useMemo(() => {
    if (dateRange === "30d") return addDays(30);
    if (dateRange === "90d") return addDays(90);
    if (dateRange === "6m")  return addDays(183);
    return "9999-12-31";
  }, [dateRange]);

  // ── Computed distances ────────────────────────────────────────────────────
  const showDistances = useMemo<Map<string, number | null>>(() => {
    const map = new Map<string, number | null>();
    for (const s of allShows) {
      if (homeLat !== null && homeLon !== null && s.latitude !== null && s.longitude !== null) {
        map.set(s.id, haversineDistanceMiles(homeLat, homeLon, s.latitude, s.longitude));
      } else {
        map.set(s.id, null);
      }
    }
    return map;
  }, [allShows, homeLat, homeLon]);

  // ── Filtered shows ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allShows.filter((show) => {
      if (show.start_date > dateCutoff) return false;
      if (onlyBookmarked && !bookmarkedIds.has(show.id)) return false;

      // Major shows bypass location filter if includeMajor is on
      if (show.is_major && includeMajor) return true;

      if (locationMode === "radius") {
        if (homeLat === null || homeLon === null) return false;
        const dist = showDistances.get(show.id);
        if (dist === null || dist === undefined) return false;
        return dist <= radiusMiles;
      } else {
        if (selectedStates.length === 0) return true;
        return selectedStates.includes(show.state);
      }
    });
  }, [allShows, dateCutoff, onlyBookmarked, bookmarkedIds, locationMode, homeLat, homeLon, showDistances, radiusMiles, selectedStates, includeMajor]);

  // ── Empty state logic ─────────────────────────────────────────────────────
  const noHomeSet = locationMode === "radius" && homeLat === null;
  const neverScraped = lastScrapeAt === null;

  function toggleState(st: string) {
    setSelectedStates((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st],
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* ── Filters strip (sticky) ── */}
      <div className="sticky top-14 z-30 bg-background/90 backdrop-blur-sm border-b pb-3 -mx-4 px-4 pt-2 space-y-3"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        {/* Location mode toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex rounded-lg border text-xs overflow-hidden"
            style={{ borderColor: "rgba(255,255,255,0.10)" }}
          >
            {(["radius", "state"] as LocationMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setLocationMode(mode)}
                className="px-3 py-1.5 transition-colors"
                style={
                  locationMode === mode
                    ? { background: "rgba(139,92,246,0.20)", color: "#c4b5fd" }
                    : { color: "rgba(226,232,240,0.5)" }
                }
              >
                {mode === "radius" ? "Near me" : "By state"}
              </button>
            ))}
          </div>

          {/* Date range */}
          <select
            className="text-xs border rounded-lg px-2 py-1.5 bg-background min-w-0"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
          >
            {DATE_RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Bookmark filter */}
          <button
            onClick={() => setOnlyBookmarked((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              onlyBookmarked ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "opacity-60 hover:opacity-100"
            }`}
          >
            <Star size={11} fill={onlyBookmarked ? "currentColor" : "none"} />
            Bookmarked
          </button>
        </div>

        {/* Radius or state sub-filter */}
        {locationMode === "radius" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs opacity-40">Radius:</span>
            {RADIUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setRadiusMiles(o.value)}
                className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                style={
                  radiusMiles === o.value
                    ? { borderColor: "rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }
                    : { borderColor: "rgba(255,255,255,0.10)", color: "rgba(226,232,240,0.5)" }
                }
              >
                {o.label}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs ml-auto cursor-pointer">
              <input
                type="checkbox"
                checked={includeMajor}
                onChange={(e) => setIncludeMajor(e.target.checked)}
                className="rounded"
              />
              <span className="opacity-60">Always show major</span>
            </label>
          </div>
        )}

        {locationMode === "state" && (
          <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
            {US_STATES.map((st) => (
              <button
                key={st}
                onClick={() => toggleState(st)}
                className="shrink-0 text-xs px-2 py-0.5 rounded-full border transition-colors font-mono"
                style={
                  selectedStates.includes(st)
                    ? { borderColor: "rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }
                    : { borderColor: "rgba(255,255,255,0.10)", color: "rgba(226,232,240,0.4)" }
                }
              >
                {st}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── No home address warning ── */}
      {noHomeSet && (
        <div
          className="flex items-start gap-2 rounded-xl border px-3 py-3 text-xs"
          style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.25)", color: "#fbbf24" }}
        >
          <TriangleAlert size={13} className="shrink-0 mt-0.5" />
          <span className="min-w-0 flex-1 leading-relaxed">
            Set your home address in{" "}
            <a href="/protected/settings" className="underline underline-offset-2">Settings</a>
            {" "}to filter shows by distance. Using state filter for now.
          </span>
        </div>
      )}

      {/* ── Stats row ── */}
      {!neverScraped && (
        <div className="flex items-center justify-between text-xs opacity-40">
          <span>{filtered.length} show{filtered.length !== 1 ? "s" : ""} found</span>
          {lastScrapeAt && (
            <span>Updated {new Date(lastScrapeAt).toLocaleDateString()}</span>
          )}
        </div>
      )}

      {/* ── Show list / empty states ── */}
      {neverScraped ? (
        <EmptyState
          title="Shows loading"
          hint="We scrape show data nightly. Check back after the first run or trigger the cron manually."
        />
      ) : noHomeSet && locationMode === "radius" ? (
        <EmptyState
          title="Set your home address"
          hint="Add your address in Settings to see shows near you."
          cta={
            <a href="/protected/settings" className="w-full text-sm modal-btn-primary py-2.5 text-center block">
              Go to Settings →
            </a>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No shows match your filters"
          hint={
            locationMode === "radius"
              ? "Try a larger radius or extend the date range."
              : "Try selecting more states or extending the date range."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((show) => (
            <ShowCard
              key={show.id}
              show={show}
              isBookmarked={bookmarkedIds.has(show.id)}
              distanceMiles={showDistances.get(show.id) ?? null}
              homeAddress={homeAddress}
              onBookmark={handleBookmark}
              onCreateSession={handleCreateSession}
            />
          ))}
        </div>
      )}
    </div>
  );
}
