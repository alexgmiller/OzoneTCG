"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Skeleton, useToast, useConfirm } from "@/components/ui";
import { getPendingCount, clearAll } from "@/lib/offlineQueue";
import { replayPendingActions } from "@/lib/offlineSync";
import { Section, SettingRow, ActionButton } from "./SettingsPrimitives";

// ── Offline sync ──
export function OfflineSyncSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, setPending] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let mounted = true;
    getPendingCount()
      .then((n) => { if (mounted) setPending(n); })
      .catch(() => { if (mounted) setPending(0); });
    return () => { mounted = false; };
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const { synced, failed } = await replayPendingActions();
      setPending(await getPendingCount().catch(() => 0));
      if (failed > 0) toast.warning(`${failed} failed, ${synced} synced`);
      else if (synced > 0) toast.success(`Synced ${synced} transaction${synced === 1 ? "" : "s"}`);
      else toast.info("Nothing to sync");
    } catch {
      toast.error("Sync failed — try again");
    } finally {
      setSyncing(false);
    }
  }

  async function handleClear() {
    const ok = await confirm({
      title: "Clear offline queue?",
      description: "Every transaction waiting to sync is discarded permanently.",
      confirmLabel: "Clear queue",
      destructive: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      await clearAll();
      setPending(0);
      toast.success("Offline queue cleared");
    } catch {
      toast.error("Couldn't clear the queue");
    } finally {
      setClearing(false);
    }
  }

  const count = pending ?? 0;

  return (
    <Section icon={RefreshCw} title="Offline Sync">
      <SettingRow label="Queued transactions" description="Saved offline, waiting to sync">
        {pending === null ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <span className="text-sm font-medium tabular-nums text-foreground">{pending}</span>
        )}
      </SettingRow>
      <SettingRow label="Sync now" description="Push queued transactions to the server">
        <ActionButton tone="primary" onClick={handleSync} disabled={syncing || count === 0}>
          {syncing ? "Syncing…" : "Sync now"}
        </ActionButton>
      </SettingRow>
      <SettingRow label="Clear queue" description="Permanently discard everything waiting to sync">
        <ActionButton tone="danger" onClick={handleClear} disabled={clearing || count === 0}>
          {clearing ? "Clearing…" : "Clear"}
        </ActionButton>
      </SettingRow>
    </Section>
  );
}
