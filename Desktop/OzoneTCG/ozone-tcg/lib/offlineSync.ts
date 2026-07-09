// Offline sync engine: replays pending actions from IndexedDB when online.
// Uses an executor function to avoid importing server actions directly
// (server actions can't be imported into lib/ without circular dependency issues).

import { getPendingActions, markSynced, markFailed, PendingAction } from "./offlineQueue";

export type Executor = (action: PendingAction) => Promise<void>;

export interface SyncCallbacks {
  onSynced?: (clientId: string) => void;
  onFailed?: (clientId: string, error: string) => void;
  onQueueEmpty?: () => void;
}

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.toLowerCase().includes("fetch failed") ||
    msg.toLowerCase().includes("failed to fetch") ||
    msg.toLowerCase().includes("network request failed") ||
    msg.toLowerCase().includes("networkerror")
  );
}

let syncing = false;

export async function replayPendingActions(
  executor: Executor,
  callbacks: SyncCallbacks = {}
): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const actions = await getPendingActions();
    if (actions.length === 0) {
      callbacks.onQueueEmpty?.();
      return;
    }

    // Sort by queued_at then group_seq for deterministic ordering
    actions.sort((a, b) => {
      if (a.queued_at !== b.queued_at) return a.queued_at - b.queued_at;
      return a.group_seq - b.group_seq;
    });

    // Process groups atomically: if one fails, skip the rest of its group
    const failedGroups = new Set<string>();

    for (const action of actions) {
      if (action.group_id && failedGroups.has(action.group_id)) continue;

      try {
        await executor(action);
        await markSynced(action.id);
        callbacks.onSynced?.(action.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await markFailed(action.id, msg);
        callbacks.onFailed?.(action.id, msg);
        if (action.group_id) failedGroups.add(action.group_id);
      }
    }

    const remaining = await getPendingActions();
    if (remaining.length === 0) callbacks.onQueueEmpty?.();
  } finally {
    syncing = false;
  }
}

export function startAutoSync(
  executor: Executor,
  callbacks: SyncCallbacks = {}
): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function attempt() {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void replayPendingActions(executor, callbacks);
    }
  }

  function onOnline() {
    attempt();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    intervalId = setInterval(attempt, 30_000);
    // Attempt immediately in case there are queued items
    attempt();
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
    }
    if (intervalId !== null) clearInterval(intervalId);
  };
}
