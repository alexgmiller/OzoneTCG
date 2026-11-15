"use client";

import { useState, useTransition } from "react";
import { Button, MoneyDisplay, SectionHeader, Textarea, useConfirm, useToast } from "@/components/ui";
import { settlePeriod } from "../actions";
import { NET_TONE, errorMessage, netLabel, netSide } from "./payoutMeta";

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
          <Textarea
            id="settle-notes"
            rows={2}
            placeholder="Paid via Venmo, squared up in cash…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isPending}
          />
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={handleSettle}
          disabled={isPending}
          className="w-full"
        >
          {isPending ? "Settling…" : "Mark as settled"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Closes the period and starts a new one from today. Settled periods appear below.
        </p>
      </div>
    </section>
  );
}
