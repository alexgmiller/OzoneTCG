import {
  recordShowBuy,
  recordShowSell,
  recordShowTrade,
  addShowExpense,
} from "@/app/protected/show/actions";
import { queueAction } from "./offlineQueue";

type SyncResult = { queued: false; result: { scanId: string } };
type QueuedResult = { queued: true; id: string };
export type OfflineResult = SyncResult | QueuedResult;

function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (e instanceof TypeError) {
    const msg = e.message.toLowerCase();
    return (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("load failed")
    );
  }
  return false;
}

export async function offlineRecordShowBuy(
  payload: Parameters<typeof recordShowBuy>[0] & { client_id?: string }
): Promise<OfflineResult> {
  try {
    const result = await recordShowBuy(payload);
    return { queued: false, result };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const id = await queueAction("buy", payload as Record<string, unknown>);
    return { queued: true, id };
  }
}

export async function offlineRecordShowSell(
  payload: Parameters<typeof recordShowSell>[0] & { client_id?: string }
): Promise<OfflineResult> {
  try {
    const result = await recordShowSell(payload);
    return { queued: false, result };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const id = await queueAction("sell", payload as Record<string, unknown>);
    return { queued: true, id };
  }
}

export async function offlineRecordShowTrade(
  payload: Parameters<typeof recordShowTrade>[0] & { client_id?: string }
): Promise<OfflineResult> {
  try {
    const result = await recordShowTrade(payload);
    return { queued: false, result };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const id = await queueAction("trade", payload as Record<string, unknown>);
    return { queued: true, id };
  }
}

export async function offlineAddShowExpense(
  payload: Parameters<typeof addShowExpense>[0] & { client_id?: string }
): Promise<OfflineResult> {
  try {
    const result = await addShowExpense(payload);
    return { queued: false, result };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const id = await queueAction("expense", payload as Record<string, unknown>);
    return { queued: true, id };
  }
}
