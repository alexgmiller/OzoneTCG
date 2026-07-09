"use client";

// Offline-aware wrappers around show server actions.
// On network error: queues the action in IndexedDB and returns { queued: true }.
// On success: returns { queued: false, scanId }.
// Business errors (auth, validation) are re-thrown so the UI can display them.
//
// ── Receipt uploads and the offline queue ────────────────────────────────────
// Receipts (Supabase Storage) are NOT included in the offline queue payload and
// are NOT replayed when the queue syncs. This is a deliberate v1 limitation:
//   - The queue stores plain JSON; binary File/Blob objects can't be serialized
//     to IndexedDB in a portable way.
//   - If an expense is queued offline, the receipt must be attached later via
//     the Expenses page (ExpenseRowItem's paperclip button) once online.
//   - ExpenseForm displays a warning banner when navigator.onLine is false and
//     a receipt is staged, so users are informed before they commit.
// Future: a separate receipt-upload queue keyed by expense client_id could
// retry the upload automatically after the expense syncs, but that requires
// the sync engine to know the server-assigned expense UUID after replay.

import { queueAction } from "./offlineQueue";
import { isNetworkError } from "./offlineSync";
import type { PendingAction, ActionKind } from "./offlineQueue";

export type OfflineResult =
  | { queued: false; scanId: string }
  | { queued: true; clientId: string };

// Expense-specific result that threads expenseId through so the caller can
// upload a receipt immediately after the server action succeeds.
export type OfflineExpenseResult =
  | { queued: false; scanId: string; expenseId: string }
  | { queued: true; clientId: string };

type BuyInput = {
  show_session_id: string;
  name: string;
  category: "single" | "slab" | "sealed";
  owner: "alex" | "mila" | "shared";
  condition: string;
  grade: string | null;
  cost: number;
  market: number | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  buy_percentage: number;
  notes: string | null;
  batch_id?: string | null;
  client_id: string;
};

type SellInput = {
  show_session_id: string;
  item_id: string;
  item_name: string;
  sell_price: number;
  client_id: string;
};

type TradeInput = {
  show_session_id: string;
  goingOut: { itemId: string; tradeValue: number; name: string; cost: number | null }[];
  comingIn: { name: string; grade: string | null; marketPrice: number }[];
  cashDifference: number;
  notes: string | null;
  client_id: string;
};

type ExpenseInput = {
  show_session_id: string;
  description: string;
  cost: number;
  category: string;
  paid_by: "alex" | "mila";
  client_id: string;
  vendor_name?: string | null;
  payment_method?: string | null;
  mileage_miles?: number | null;
  mileage_rate?: number | null;
  expense_date?: string | null;
  deductible_percentage?: number | null;
};

async function tryOrQueue(
  kind: ActionKind,
  clientId: string,
  payload: Record<string, unknown>,
  fn: () => Promise<{ scanId: string }>,
  groupId?: string | null,
  groupSeq?: number
): Promise<OfflineResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await queueAction({
      id: clientId,
      kind,
      group_id: groupId ?? null,
      group_seq: groupSeq ?? 0,
      payload,
      queued_at: Date.now(),
    });
    return { queued: true, clientId };
  }

  try {
    const result = await fn();
    return { queued: false, scanId: result.scanId };
  } catch (err) {
    if (isNetworkError(err)) {
      await queueAction({
        id: clientId,
        kind,
        group_id: groupId ?? null,
        group_seq: groupSeq ?? 0,
        payload,
        queued_at: Date.now(),
      });
      return { queued: true, clientId };
    }
    throw err;
  }
}

export async function offlineRecordShowBuy(
  input: BuyInput,
  fn: (i: BuyInput) => Promise<{ scanId: string }>,
  groupId?: string | null,
  groupSeq?: number
): Promise<OfflineResult> {
  return tryOrQueue(
    "buy",
    input.client_id,
    input as unknown as Record<string, unknown>,
    () => fn(input),
    groupId,
    groupSeq
  );
}

export async function offlineRecordShowSell(
  input: SellInput,
  fn: (i: SellInput) => Promise<{ scanId: string }>
): Promise<OfflineResult> {
  return tryOrQueue(
    "sell",
    input.client_id,
    input as unknown as Record<string, unknown>,
    () => fn(input)
  );
}

export async function offlineRecordShowTrade(
  input: TradeInput,
  fn: (i: TradeInput) => Promise<{ scanId: string }>
): Promise<OfflineResult> {
  return tryOrQueue(
    "trade",
    input.client_id,
    input as unknown as Record<string, unknown>,
    () => fn(input)
  );
}

// Inlined rather than delegating to tryOrQueue so that expenseId is preserved
// in the success branch — necessary for the caller to upload a receipt.
export async function offlineAddShowExpense(
  input: ExpenseInput,
  fn: (i: ExpenseInput) => Promise<{ scanId: string; expenseId: string }>
): Promise<OfflineExpenseResult> {
  const enqueue = async (): Promise<{ queued: true; clientId: string }> => {
    await queueAction({
      id: input.client_id,
      kind: "expense",
      group_id: null,
      group_seq: 0,
      payload: input as unknown as Record<string, unknown>,
      queued_at: Date.now(),
    });
    return { queued: true, clientId: input.client_id };
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return enqueue();
  }

  try {
    const result = await fn(input);
    return { queued: false, scanId: result.scanId, expenseId: result.expenseId };
  } catch (err) {
    if (isNetworkError(err)) return enqueue();
    throw err;
  }
}

// Creates an executor for the sync engine that dispatches PendingAction back
// to the actual server actions. Import this in ShowClient and pass to startAutoSync.
export function createExecutor(actions: {
  recordShowBuy: (i: BuyInput) => Promise<{ scanId: string }>;
  recordShowSell: (i: SellInput) => Promise<{ scanId: string }>;
  recordShowTrade: (i: TradeInput) => Promise<{ scanId: string }>;
  addShowExpense: (i: ExpenseInput) => Promise<{ scanId: string; expenseId: string }>;
}) {
  return async (action: PendingAction): Promise<void> => {
    const p = action.payload as Record<string, unknown>;
    switch (action.kind) {
      case "buy":
        await actions.recordShowBuy(p as unknown as BuyInput);
        break;
      case "sell":
        await actions.recordShowSell(p as unknown as SellInput);
        break;
      case "trade":
        await actions.recordShowTrade(p as unknown as TradeInput);
        break;
      case "expense":
        await actions.addShowExpense(p as unknown as ExpenseInput);
        break;
    }
  };
}
