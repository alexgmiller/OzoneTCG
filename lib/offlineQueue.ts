// IndexedDB-backed offline queue for show transactions.
// Each PendingAction.id IS the client_id passed to the server action for deduplication.

export type ActionKind = "buy" | "sell" | "trade" | "expense";

export interface PendingAction {
  id: string;          // UUID = client_id used for server-side dedup
  kind: ActionKind;
  group_id: string | null;  // actions in the same deal group share a group_id
  group_seq: number;        // ordering within the group (0-based)
  payload: Record<string, unknown>;
  queued_at: number;   // Date.now()
  attempts: number;
  last_error: string | null;
  status: "pending" | "syncing" | "failed";
}

const DB_NAME = "ozone_offline";
const STORE = "pending_actions";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("status", "status");
        store.createIndex("group_id", "group_id");
        store.createIndex("queued_at", "queued_at");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | void
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req ? (req as IDBRequest).result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function queueAction(action: Omit<PendingAction, "attempts" | "last_error" | "status">): Promise<void> {
  const db = await openDB();
  const record: PendingAction = { ...action, attempts: 0, last_error: null, status: "pending" };
  await tx(db, "readwrite", (s) => s.put(record));
  db.close();
}

export async function queueActionGroup(
  actions: Omit<PendingAction, "attempts" | "last_error" | "status">[]
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    for (const a of actions) {
      store.put({ ...a, attempts: 0, last_error: null, status: "pending" });
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const db = await openDB();
  const result = await new Promise<PendingAction[]>((resolve, reject) => {
    const t = db.transaction(STORE, "readonly");
    const req = t.objectStore(STORE).index("queued_at").getAll();
    req.onsuccess = () => resolve((req.result as PendingAction[]).filter((a) => a.status !== "failed"));
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function getPendingCount(): Promise<number> {
  const actions = await getPendingActions();
  return actions.length;
}

export async function markSynced(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) store.delete(id);
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}

export async function markFailed(id: string, error: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) {
        const record: PendingAction = req.result;
        store.put({
          ...record,
          attempts: record.attempts + 1,
          last_error: error,
          status: "failed",
        });
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}

export async function resetForRetry(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      if (req.result) {
        store.put({ ...req.result, status: "pending", last_error: null });
      }
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db.close();
}

export async function deleteAction(id: string): Promise<void> {
  const db = await openDB();
  await tx(db, "readwrite", (s) => s.delete(id));
  db.close();
}

export async function clearAll(): Promise<void> {
  const db = await openDB();
  await tx(db, "readwrite", (s) => s.clear());
  db.close();
}
