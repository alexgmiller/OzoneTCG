"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { SavedLocation } from "@/app/protected/expenses/actions";
import type { ShowSessionSummary } from "@/app/protected/expenses/ExpensesServer";
import { MoneyDisplay } from "@/components/ui";
import { estimateTaxSavings } from "@/lib/taxEstimate";
import { ExpenseTooltip } from "../ExpenseTooltip";
import {
  CHIP_ACTIVE, CHIP_CLASS, CHIP_IDLE, FIELD_CLASS, LABEL_CLASS, MILEAGE_RATE_TOOLTIP,
  type FormState, type LocationChip, type SetField,
} from "./shared";

const MAX_CHIPS = 6;

function shortLabel(s: string) {
  return s.length > 20 ? s.slice(0, 19) + "…" : s;
}

// ── Chip row ──────────────────────────────────────────────────────────────────

function ChipRow({
  chips,
  selected,
  onPick,
}: {
  chips: LocationChip[];
  selected: string;
  onPick: (address: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
      {chips.map((chip) => (
        <button
          key={chip.address}
          type="button"
          title={chip.title}
          onClick={() => onPick(chip.address)}
          className={`${CHIP_CLASS} ${selected === chip.address ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          <span>{chip.icon}</span>
          <span>{chip.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Mileage fields ────────────────────────────────────────────────────────────

export function MileageFields({
  form,
  setField,
  showSessions,
  homeAddress,
  savedLocations,
  lastShowMileage,
  mileageAmount,
}: {
  form: FormState;
  setField: SetField;
  showSessions: ShowSessionSummary[];
  homeAddress: string | null;
  savedLocations: SavedLocation[];
  lastShowMileage?: { miles: string; description: string };
  mileageAmount: number | null;
}) {
  const [homeTipDismissed, setHomeTipDismissed] = useState(true);

  useEffect(() => {
    setHomeTipDismissed(!!localStorage.getItem("mileage_home_tip_dismissed"));
  }, []);

  function dismissHomeTip() {
    localStorage.setItem("mileage_home_tip_dismissed", "1");
    setHomeTipDismissed(true);
  }

  const currentShow = form.show_session_id
    ? showSessions.find((s) => s.id === form.show_session_id) ?? null
    : null;
  const venueAddress = currentShow?.venue_address ?? null;
  const hasHomeButNoVenue = !!homeAddress && !!currentShow && !venueAddress;

  function buildChips(field: "from" | "to"): LocationChip[] {
    const chips: LocationChip[] = [];
    if (homeAddress) {
      chips.push({ icon: "🏠", label: "Home", address: homeAddress, title: homeAddress });
    }
    if (field === "to" && venueAddress && currentShow) {
      chips.push({ icon: "📍", label: shortLabel(currentShow.name), address: venueAddress, title: venueAddress });
    }
    for (const loc of savedLocations.slice(0, MAX_CHIPS - chips.length)) {
      chips.push({ icon: "📌", label: shortLabel(loc.label), address: loc.address, title: loc.address });
    }
    return chips;
  }

  const from = form.mileage_from.trim();
  const to = form.mileage_to.trim();
  const mapsUrl = from && to
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`
    : null;

  return (
    <div className="space-y-3">
      {/* ── From ── */}
      <div>
        <ChipRow chips={buildChips("from")} selected={form.mileage_from} onPick={(a) => setField("mileage_from", a)} />
        {!homeAddress && !homeTipDismissed && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-dashed border-accent-primary-border bg-accent-primary-soft px-3 py-2 text-xs">
            <span className="flex-1 leading-relaxed text-muted-foreground">
              Tip: Save your home address in Settings for one-tap mileage entry.{" "}
              <a href="/protected/settings" className="text-accent-primary underline underline-offset-2">
                Set home address →
              </a>
            </span>
            <button
              type="button"
              onClick={dismissHomeTip}
              aria-label="Dismiss tip"
              className="-my-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <label className={LABEL_CLASS}>From</label>
        <input
          className={FIELD_CLASS}
          placeholder="123 Main St, Sacramento, CA"
          value={form.mileage_from}
          onChange={(e) => setField("mileage_from", e.target.value)}
          autoFocus
        />
      </div>

      {/* ── To ── */}
      <div>
        <ChipRow chips={buildChips("to")} selected={form.mileage_to} onPick={(a) => setField("mileage_to", a)} />
        <label className={LABEL_CLASS}>To</label>
        <input
          className={FIELD_CLASS}
          placeholder="Convention Center, San Jose, CA"
          value={form.mileage_to}
          onChange={(e) => setField("mileage_to", e.target.value)}
        />
        {hasHomeButNoVenue && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Tip: Add this show&apos;s venue address when editing the show, and we&apos;ll auto-fill it next time.
          </p>
        )}
      </div>

      {/* ── Maps link ── */}
      {mapsUrl ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-1.5 text-sm text-accent-primary underline underline-offset-2 transition-colors duration-150 hover:text-accent-primary-hover"
        >
          <ExternalLink size={14} />
          Look up distance on Google Maps →
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">Fill From and To above to open Google Maps directions</p>
      )}

      {/* ── Miles ── */}
      <div>
        <label className={LABEL_CLASS}>Miles (one-way)</label>
        <input
          type="number"
          inputMode="decimal"
          className={`${FIELD_CLASS} font-mono tabular-nums`}
          placeholder="0"
          value={form.mileage_miles}
          onChange={(e) => setField("mileage_miles", e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">Distance shown on Google Maps, typically the one-way trip</p>
        {lastShowMileage && (
          <button
            type="button"
            onClick={() => setField("mileage_miles", lastShowMileage.miles)}
            className="inline-flex h-11 items-center text-sm text-accent-primary underline underline-offset-2 transition-colors duration-150 hover:text-accent-primary-hover"
          >
            Same as last entry ({lastShowMileage.miles} mi)
          </button>
        )}
      </div>

      {/* ── Round trip + rate ── */}
      <div className="grid grid-cols-2 items-end gap-3">
        <label className="flex h-11 cursor-pointer select-none items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.round_trip}
            onChange={(e) => setField("round_trip", e.target.checked)}
            className="h-5 w-5 rounded-lg accent-accent-primary"
          />
          Round trip (×2)
        </label>
        <div>
          <div className="mb-1.5 flex items-center">
            <label className="text-xs text-muted-foreground">Rate ($/mi)</label>
            <ExpenseTooltip content={MILEAGE_RATE_TOOLTIP} />
          </div>
          <input
            type="number"
            inputMode="decimal"
            className={`${FIELD_CLASS} font-mono tabular-nums`}
            value={form.mileage_rate}
            onChange={(e) => setField("mileage_rate", e.target.value)}
          />
        </div>
      </div>

      {/* ── Computed amount ── */}
      {mileageAmount != null && (
        <div className="space-y-0.5 rounded-lg border border-positive-border bg-positive-soft px-3 py-2.5">
          <div className="text-sm font-semibold">
            = <MoneyDisplay amount={mileageAmount} tone="positive" />
          </div>
          <div className="text-xs text-muted-foreground">
            ~<MoneyDisplay amount={estimateTaxSavings(mileageAmount)} tone="neutral" /> estimated tax savings
          </div>
        </div>
      )}
    </div>
  );
}
