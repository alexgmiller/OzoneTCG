import { getPendingActions, markSynced, markFailed } from "./offlineQueue";
import {
  recordShowBuy,
  recordShowSell,
  recordShowTrade,
  addShowExpense,
} from "@/app/protected/show/actions";

export async function replayPendingActions(): Promise<{ synced: number; failed: number }> {
  let actions;
  try {
    actions = await getPendingActions();
  } catch {
    return { synced: 0, failed: 0 };
  }
  if (actions.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const action of actions) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = action.payload as any;
      switch (action.actionType) {
        case "buy":
        case "deal-buy":
          await recordShowBuy(payload);
          break;
        case "sell":
          await recordShowSell(payload);
          break;
        case "trade":
        case "deal-trade":
          await recordShowTrade(payload);
          break;
        case "expense":
          await addShowExpense(payload);
          break;
      }
      await markSynced(action.id);
      synced++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      try { await markFailed(action.id, msg); } catch { /* ignore IDB errors */ }
      failed++;
    }
  }

  window.dispatchEvent(
    new CustomEvent("offline-sync-result", { detail: { synced, failed } })
  );
  return { synced, failed };
}

export async function replayOneAction(id: string): Promise<{ synced: boolean }> {
  let actions;
  try {
    actions = await getPendingActions();
  } catch {
    return { synced: false };
  }
  const action = actions.find((a) => a.id === id);
  if (!action) return { synced: false };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = action.payload as any;
    switch (action.actionType) {
      case "buy":
      case "deal-buy":
        await recordShowBuy(payload);
        break;
      case "sell":
        await recordShowSell(payload);
        break;
      case "trade":
      case "deal-trade":
        await recordShowTrade(payload);
        break;
      case "expense":
        await addShowExpense(payload);
        break;
    }
    await markSynced(id);
    window.dispatchEvent(new CustomEvent("offline-sync-result", { detail: { synced: 1, failed: 0 } }));
    return { synced: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    try { await markFailed(id, msg); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("offline-sync-result", { detail: { synced: 0, failed: 1 } }));
    return { synced: false };
  }
}

let autoSyncCleanup: (() => void) | null = null;

export function startAutoSync(): () => void {
  if (autoSyncCleanup) autoSyncCleanup();

  const onOnline = () => {
    setTimeout(() => replayPendingActions(), 2000);
  };
  window.addEventListener("online", onOnline);

  const interval = setInterval(() => {
    if (navigator.onLine) replayPendingActions();
  }, 30_000);

  autoSyncCleanup = () => {
    window.removeEventListener("online", onOnline);
    clearInterval(interval);
    autoSyncCleanup = null;
  };
  return autoSyncCleanup;
}
