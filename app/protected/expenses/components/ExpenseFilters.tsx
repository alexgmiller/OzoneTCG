"use client";

import type { ExpenseCategory } from "../actions";
import type { ShowSessionSummary } from "../ExpensesServer";
import { CATEGORIES, CAT_TOKEN, ShowPill, catMeta, plural, type FilterState } from "./expenseMeta";

const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground sm:w-auto";
const PILL_CLASS =
  "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors duration-150";
const PILL_ACTIVE = "border-accent-primary bg-accent-primary-soft text-accent-primary";
const PILL_IDLE = "border-border text-muted-foreground hover:bg-muted";

const QUICK_ADD: { cat: ExpenseCategory; label: string }[] = [
  { cat: "meals",     label: "Meal" },
  { cat: "mileage",   label: "Mileage" },
  { cat: "lodging",   label: "Hotel" },
  { cat: "booth_fee", label: "Booth Fee" },
  { cat: "supplies",  label: "Supplies" },
  { cat: "other",     label: "Other" },
];

// Scroll row with a fade on the right edge so it reads as scrollable.
function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex gap-2 overflow-x-auto pb-0.5 pr-8 [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

// ── Quick-add + filters + result counter ──────────────────────────────────────

export function ExpenseFilters({
  filters,
  onChange,
  showSessions,
  isHistoricalYear,
  onQuickAdd,
  shownCount,
  totalCount,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  showSessions: ShowSessionSummary[];
  isHistoricalYear: boolean;
  onQuickAdd: (c: ExpenseCategory) => void;
  shownCount: number;
  totalCount: number;
}) {
  const activeShow =
    filters.show !== "all" && filters.show !== "_none"
      ? showSessions.find((s) => s.id === filters.show) ?? null
      : null;

  return (
    <div className="space-y-3">
      {/* ── Quick-add row ── */}
      <div className="flex items-center gap-2 rounded-xl border border-accent-primary-border bg-accent-primary-soft px-3 py-2">
        <span className="shrink-0 font-mono text-xs uppercase tracking-wide text-muted-foreground">+ Add</span>
        <ScrollRow>
          {QUICK_ADD.map(({ cat, label }) => (
            <button
              key={cat}
              onClick={() => onQuickAdd(cat)}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors duration-150 hover:bg-muted"
            >
              <span className={CAT_TOKEN[cat].text}>{catMeta(cat).icon}</span>
              {label}
            </button>
          ))}
        </ScrollRow>
      </div>

      {/* ── Category pills: "All" fixed, rest scrolls ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange({ category: "all" })}
          className={`${PILL_CLASS} ${filters.category === "all" ? PILL_ACTIVE : PILL_IDLE}`}
        >
          All
        </button>
        <ScrollRow>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => onChange({ category: c.value })}
              className={`${PILL_CLASS} ${filters.category === c.value ? PILL_ACTIVE : PILL_IDLE}`}
            >
              {c.label}
            </button>
          ))}
        </ScrollRow>
      </div>

      {/* ── Dropdowns ── */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          className={SELECT_CLASS}
          value={filters.show}
          onChange={(e) => onChange({ show: e.target.value })}
        >
          <option value="all">All shows</option>
          <option value="_none">No show</option>
          {showSessions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {!isHistoricalYear && (
          <select
            className={SELECT_CLASS}
            value={filters.dateRange}
            onChange={(e) => onChange({ dateRange: e.target.value as FilterState["dateRange"] })}
          >
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="all">All time</option>
          </select>
        )}

        <select
          className={SELECT_CLASS}
          value={filters.paidBy}
          onChange={(e) => onChange({ paidBy: e.target.value as FilterState["paidBy"] })}
        >
          <option value="all">All payers</option>
          <option value="alex">Alex</option>
          <option value="mila">Mila</option>
          <option value="shared">Shared</option>
        </select>

        <select
          className={`${SELECT_CLASS} sm:ml-auto`}
          value={filters.groupBy}
          onChange={(e) => onChange({ groupBy: e.target.value as FilterState["groupBy"] })}
        >
          <option value="flat">Flat list</option>
          <option value="category">By category</option>
          <option value="show">By show</option>
        </select>
      </div>

      {/* ── Result counter + active show ── */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {shownCount === totalCount
            ? plural(shownCount, "expense")
            : `${shownCount} of ${totalCount} expenses`}
        </span>
        {activeShow && <ShowPill name={activeShow.name} />}
      </div>
    </div>
  );
}
