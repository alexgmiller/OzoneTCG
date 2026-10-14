"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useConfirm, useToast } from "@/components/ui";
import { deleteShowSession, startShow } from "../actions";
import EndShowPanel from "../EndShowPanel";
import { btnGhostDanger, btnPrimary, btnSecondary, todayLocalISO, type ShowStatus } from "../shared";

type ShowSummary = {
  id: string;
  name: string;
  status: ShowStatus;
  starting_cash: number | null;
};

// Start (scheduled) · Open POS + End (active); nothing for completed shows
export default function ShowDetailActions({ show, hasActive }: { show: ShowSummary; hasActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await startShow({ scheduledId: show.id, name: show.name, starting_cash: show.starting_cash, date: todayLocalISO() });
      router.push("/protected/pos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start show");
      setBusy(false);
    }
  }

  if (show.status === "scheduled") {
    return (
      <div className="space-y-2">
        <button type="button" onClick={start} disabled={busy || hasActive} className={`${btnPrimary} w-full`}>
          {busy ? "Starting…" : "Start show"}
        </button>
        {hasActive && (
          <p className="text-xs text-muted-foreground">End the live show before starting this one.</p>
        )}
      </div>
    );
  }

  if (show.status === "active") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Link href="/protected/pos" className={btnPrimary}>Open POS</Link>
          <button type="button" onClick={() => setEnding((v) => !v)} className={btnSecondary}>
            {ending ? "Cancel" : "End show"}
          </button>
        </div>
        {ending && <EndShowPanel showId={show.id} />}
      </div>
    );
  }

  return null;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function DeleteShowButton({ showId, showName }: { showId: string; showName: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: `Delete "${showName}"?`,
      description:
        "The show record is deleted. Its deals and expenses are kept and no longer linked to a show.",
      confirmLabel: "Delete show",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteShowSession(showId);
      toast.success("Show deleted");
      router.push("/protected/shows");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete show");
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={remove} disabled={busy} className={btnGhostDanger}>
      <Trash2 size={16} />
      {busy ? "Deleting…" : "Delete show"}
    </button>
  );
}
