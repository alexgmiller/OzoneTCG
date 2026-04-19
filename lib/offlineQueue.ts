const DB_NAME = "ozone_offline";
const DB_VERSION = 1;
const STORE = "pending_actions";

export type PendingAction = {
  id: string;
  timestamp: number;
  actionType: "buy" | "sell" | "trade" | "deal-buy" | "deal-trade" | "expense";
  payload: Record<string, unknown>;
  status: "pending" | "syncing" | "failed";
  retryCount: number;
  errorMessage?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueAction(
  actionType: PendingAction["actionType"],
  payload: Record<string, unknown>
): Promise<string> {
  const db = await openDb();
  const action: PendingAction = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    actionType,
    payload,
    status: "pending",
    retryCount: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return action.id;
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as PendingAction[]).sort((a, b) => a.timestamp - b.timestamp)
      );
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function markSynced(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function markFailed(id: string, errorMessage: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const action = getReq.result as PendingAction | undefined;
      if (!action) { resolve(); return; }
      store.put({
        ...action,
        status: "failed",
        retryCount: action.retryCount + 1,
        errorMessage,
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Label suitable for display — extracted from the action payload */
export function pendingActionLabel(action: PendingAction): string {
  const p = action.payload as Record<string, unknown>;
  switch (action.actionType) {
    case "buy":
    case "deal-buy":
      return (p.name as string) ?? "Buy";
    case "sell":
      return (p.item_name as string) ?? "Sell";
    case "trade":
    case "deal-trade": {
      const out = p.goingOut as Array<{ name: string }> | undefined;
      const inn = p.comingIn as Array<{ name: string }> | undefined;
      const outNames = out?.map((g) => g.name).join(", ");
      const inNames = inn?.map((c) => c.name).join(", ");
      if (outNames && inNames) return `${outNames} → ${inNames}`;
      return outNames ?? inNames ?? "Trade";
    }
    case "expense":
      return (p.description as string) ?? "Expense";
    default:
      return "Action";
  }
}
