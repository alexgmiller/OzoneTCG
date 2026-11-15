"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { scheduleShow } from "@/app/protected/calendar/actions";
import { startShow } from "./actions";
import { labelCls, todayLocalISO } from "./shared";

// Returns a rounded non-negative amount, null when blank; throws a user-facing message otherwise
function parseMoney(raw: string, label: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be 0 or more`);
  return Math.round(n * 100) / 100;
}

// Collapsible "New show" panel: Schedule, or Start now when the date is today
export default function NewShowForm({ hasActive }: { hasActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState(() => todayLocalISO());
  const [boothFee, setBoothFee] = useState("");
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState<"schedule" | "start" | null>(null);

  const isToday = date === todayLocalISO();
  const canStartNow = isToday && !hasActive;
  const ready = name.trim().length > 0 && date.length > 0 && busy === null;

  function reset() {
    setName(""); setVenue(""); setDate(todayLocalISO()); setBoothFee(""); setCash("");
  }

  // Validated form values; throws on a bad number
  function values() {
    const fee = parseMoney(boothFee, "Booth fee");
    const startingCash = parseMoney(cash, "Starting cash");
    return {
      name: name.trim(),
      date,
      location: venue.trim() || undefined,
      boothFee: fee && fee > 0 ? fee : undefined,
      startingCash: startingCash ?? undefined,
    };
  }

  async function schedule() {
    setBusy("schedule");
    try {
      const v = values();
      await scheduleShow(v);
      toast.success(`${v.name} scheduled`);
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule show");
    } finally {
      setBusy(null);
    }
  }

  // Venue or booth fee need a scheduled record first (the fee is logged as an expense)
  async function startNow() {
    setBusy("start");
    try {
      const v = values();
      const scheduledId = v.location || v.boothFee ? await scheduleShow(v) : null;
      await startShow({ scheduledId, name: v.name, starting_cash: v.startingCash ?? null, date: v.date });
      router.push("/protected/pos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start show");
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full">
        <Plus size={16} />
        New show
      </Button>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">New show</h2>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
          <X size={18} />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="show-name" className={labelCls}>Show name</label>
          <Input
            id="show-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sacramento Card Show"
            disabled={busy !== null}
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="show-venue" className={labelCls}>Venue</label>
          <Input
            id="show-venue"
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Optional"
            disabled={busy !== null}
          />
        </div>

        <div>
          <label htmlFor="show-date" className={labelCls}>Date</label>
          <Input
            id="show-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy !== null}
          />
        </div>

        <MoneyField id="show-fee" label="Booth fee" value={boothFee} onChange={setBoothFee} disabled={busy !== null} />
        <MoneyField id="show-cash" label="Starting cash" value={cash} onChange={setCash} disabled={busy !== null} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={schedule}
          disabled={!ready}
          variant={canStartNow ? "outline" : "primary"}
          className={canStartNow ? undefined : "col-span-2"}
        >
          {busy === "schedule" ? "Scheduling…" : "Schedule"}
        </Button>
        {canStartNow && (
          <Button onClick={startNow} disabled={!ready}>
            {busy === "start" ? "Starting…" : "Start now"}
          </Button>
        )}
      </div>

      {isToday && hasActive && (
        <p className="text-xs text-muted-foreground">End the live show before starting another one.</p>
      )}
    </section>
  );
}

// ── Money field ───────────────────────────────────────────────────────────────

function MoneyField({ id, label, value, onChange, disabled }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className="pl-7"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
