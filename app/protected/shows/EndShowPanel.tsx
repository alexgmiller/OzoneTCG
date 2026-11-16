"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { endShowSession } from "./actions";
import { btnDanger, inputCls } from "./shared";

// Counted-cash input + confirm; used by the live card and the detail page
export default function EndShowPanel({ showId }: { showId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);

  async function end() {
    const counted = cash.trim() ? Number(cash) : null;
    if (counted !== null && (!Number.isFinite(counted) || counted < 0)) {
      toast.error("Counted cash must be 0 or more");
      return;
    }
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
