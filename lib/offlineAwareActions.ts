import { recordBuy, recordSell, recordTrade } from "@/app/protected/pos/actions";
import type { BuyInput, SellInput, TradeInput } from "@/app/protected/pos/ledger";
import { queueAction, type PendingAction } from "./offlineQueue";

type SyncResult = { queued: false; result: { id: string } };
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

// client_id is fixed before the first attempt so a replay can't record twice
async function withQueue<T extends { client_id?: string | null }>(
  type: PendingAction["actionType"],
  run: (p: T) => Promise<{ id: string }>,
  payload: T,
): Promise<OfflineResult> {
  const p = { ...payload, client_id: payload.client_id ?? crypto.randomUUID() };
  try {
    return { queued: false, result: await run(p) };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    return { queued: true, id: await queueAction(type, p as Record<string, unknown>) };
  }
}

export const offlineRecordBuy = (p: BuyInput) => withQueue("pos-buy", recordBuy, p);
export const offlineRecordSell = (p: SellInput) => withQueue("pos-sell", recordSell, p);
export const offlineRecordTrade = (p: TradeInput) => withQueue("pos-trade", recordTrade, p);
