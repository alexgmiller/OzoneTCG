"use client";

import { useState, useTransition } from "react";
import { MoneyDisplay, SectionHeader, useConfirm, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { settlePeriod } from "../actions";
import { BTN_PRIMARY, NET_TONE, TEXTAREA, errorMessage, netLabel, netSide } from "./payoutMeta";

// ── Settle the current period, with optional notes ──

export function SettleForm({ netPayout }: { netPayout: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const side = netSide(netPayout);
  const netAbs = Math.abs(netPayout);
  const summary = side === "even" ? "Break even" : `${netLabel(side)} $${netAbs.toFixed(2)}`;

  async function handleSettle() {
    const ok = await confirm({
      title: "Settle this period?",
      description: `${summary}. This closes the period and starts a new one from today.`,
      confirmLabel: "Mark as settled",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await settlePeriod(notes.trim() || undefined);
        setNotes("");
        toast.success("Period settled");
      } catch (e) {
        toast.error(errorMessage(e));
      }
    });
  }

  return (
    <section className="space-y-3">
      <SectionHeader>Settle up</SectionHeader>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-foreground">{netLabel(side)}</span>
          <MoneyDisplay amount={netAbs} tone={NET_TONE[side]} className="font-semibold" />
        </div>

        <div className="space-y-2">
          <label htmlFor="settle-notes" className="block text-xs font-medium text-muted-foreground">
            Notes <span className="font-normal">(optional)</span>
          </label>
          <textarea
            id="settle-notes"
            rows={2}
            className={TEXTAREA}
            placeholder="Paid via Venmo, squared up in cash…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
          />
        </div>

        <button
          type="button"
          onClick={handleSettle}
          disabled={isPending}
          className={cn(BTN_PRIMARY, "h-12 w-full font-semibold")}
        >
          {isPending ? "Settling…" : "Mark as settled"}
        </button>
        <p className="text-xs text-muted-foreground">
          Closes the period and starts a new one from today. Settled periods appear below.
        </p>
      </div>
    </section>
  );
}
