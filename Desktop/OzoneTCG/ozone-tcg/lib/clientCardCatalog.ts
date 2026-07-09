"use client";

import { scoreLocalCard, parseTerms } from "./cardSearchScoring";
import type { AutocompleteCard } from "@/components/CardAutocomplete";

const DB_NAME   = "ozone_cards_v1";
const STORE     = "cards";
const META      = "meta";
const TTL_MS    = 24 * 60 * 60 * 1000; // 24 hours
const META_KEY  = "catalog_loaded_at";

type CatalogCard = {
  id: string;
  name: string;
  set_name: string | null;
  set_id: string;
  card_number: string | null;
  image_url: string | null;
};

// In-memory cache so searches are <10ms after first load
let memCache: CatalogCard[] = [];
let initPromise: Promise<void> | null = null;
let dbHandle: IDBDatabase | null = null;

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbHandle) { resolve(dbHandle); return; }
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
    };
    req.onsuccess = () => { dbHandle = req.result; resolve(req.result); };
    req.onerror  = () => reject(req.error);
  });
}

async function readMeta(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve) => {
    const tx  = db.transaction(META, "readonly");
    const req = tx.objectStore(META).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => resolve(undefined);
  });
}

async function writeMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(META, "readwrite");
    tx.objectStore(META).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function readAllCards(db: IDBDatabase): Promise<CatalogCard[]> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as CatalogCard[]);
    req.onerror   = () => reject(req.error);
  });
}

async function writeCards(db: IDBDatabase, cards: CatalogCard[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const card of cards) store.put(card);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the catalog. Safe to call multiple times — deduplicates.
 * Fetches from /api/card-catalog if cache is stale or missing.
 * Gracefully degrades to no-op if IndexedDB is unavailable.
 */
export async function initCatalog(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const db        = await openDB();
      const loadedAt  = await readMeta(db, META_KEY) as number | undefined;
      const isStale   = !loadedAt || (Date.now() - loadedAt > TTL_MS);

      if (!isStale) {
        memCache = await readAllCards(db);
        return;
      }

      const res = await fetch("/api/card-catalog");
      if (!res.ok) throw new Error(`catalog fetch ${res.status}`);
      const { cards }: { cards: CatalogCard[] } = await res.json();

      await writeCards(db, cards);
      await writeMeta(db, META_KEY, Date.now());
      memCache = cards;
    } catch {
      // Graceful degradation: catalog unavailable, fall back to server search
      memCache = [];
    }
  })();
  return initPromise;
}

/**
 * Search the in-memory catalog. Returns results in <10ms.
 * Returns an empty array if the catalog hasn't been initialised yet.
 */
export function searchCatalog(query: string, limit = 10): AutocompleteCard[] {
  if (!memCache.length) return [];

  const terms     = parseTerms(query);
  const fullQuery = query.toLowerCase().trim();

  if (!terms.length) return [];

  // First pass: filter to cards that contain every term somewhere
  const candidates = memCache.filter((c) => {
    const searchable = [
      c.name.toLowerCase(),
      (c.set_name ?? "").toLowerCase(),
      (c.set_id ?? "").toLowerCase(),
      (c.card_number ?? "").toLowerCase(),
    ].join(" ");
    return terms.every((t) => searchable.includes(t));
  });

  if (!candidates.length) return [];

  return candidates
    .map((c) => ({ c, score: scoreLocalCard(c, terms, fullQuery) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ c }) => ({
      name:       c.name,
      setName:    c.set_name ?? c.set_id ?? "",
      cardNumber: c.card_number ?? "",
      imageUrl:   c.image_url,
      market:     null,
      cardId:     c.id,
    }));
}

/**
 * Force-clear the catalog (useful from settings "Clear Cache" button).
 */
export async function clearCatalog(): Promise<void> {
  initPromise = null;
  memCache    = [];
  try {
    const db = await openDB();
    await writeCards(db, []);
    await writeMeta(db, META_KEY, 0);
  } catch { /* silent */ }
}

/** True if the catalog is loaded and has entries. */
export function isCatalogReady(): boolean {
  return memCache.length > 0;
}
