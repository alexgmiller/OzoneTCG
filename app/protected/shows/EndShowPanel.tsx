"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm, useToast } from "@/components/ui";
import { endShowSession } from "./actions";
import { btnDanger, inputCls } from "./shared";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Counted-cash input + a confirm dialog before the show closes. Used by POS,
// the live show card and the show detail page, so ending works the same way
// everywhere.
export default function EndShowPanel({ showId, showName }: { showId: string; showName?: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);

  async function end() {
    const counted = cash.trim() ? Number(cash) : null;
    if (counted !== null && (!Number.isFinite(counted) || counted < 0)) {
      toast.error("Counted cash must be 0 or more");
      return;
    }
    const ok = await confirm({
      title: showName ? `End ${showName}?` : "End this show?",
      description: counted !== null
        ? `The show closes with ${usd.format(counted)} counted, and new deals stop attaching to it.`
        : "The show closes and new deals stop attaching to it. No counted cash will be recorded.",
      confirmLabel: "End show",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await endShowSession(showId, counted);
      toast.success("Show ended");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not end show");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && end()}
          placeholder="Counted cash (optional)"
          aria-label="Counted cash"
          className={`${inputCls} pl-7`}
          disabled={busy}
        />
      </div>
      <button type="button" onClick={end} disabled={busy} className={`${btnDanger} shrink-0`}>
        {busy ? "Ending…" : "Confirm end"}
      </button>
    </div>
  );
}
