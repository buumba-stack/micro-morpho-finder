/**
 * Local session persistence for the analysis batch.
 *
 * Everything the app computes lives in memory, so a reload, a crash or a
 * closed window used to lose an entire batch. This store keeps the batch
 * (images, per-image settings, results, blank matches, user rejections) in
 * IndexedDB so the original batch-processed dataset survives, and re-analysis
 * of a single image updates that dataset in place instead of replacing it.
 *
 * Images never leave the machine — IndexedDB is local browser/Electron storage.
 */

import type { ImageEntry, AnalysisSettings } from "./study-types";

const DB_NAME = "microfluor";
const DB_VERSION = 1;
const STORE = "session";
const KEY = "current";

export interface SavedSession {
  version: number;
  savedAt: string;
  defaults: AnalysisSettings;
  entries: ImageEntry[];
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

/** Entries that were mid-run when the window closed come back as pending. */
function normalize(entries: ImageEntry[]): ImageEntry[] {
  return entries
    .filter((e) => e && e.file instanceof File)
    .map((e) => (e.status === "running" ? { ...e, status: "pending" as const } : e));
}

export async function loadSession(): Promise<SavedSession | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = tx(db, "readonly").get(KEY);
    req.onsuccess = () => {
      const value = req.result as SavedSession | undefined;
      db.close();
      if (!value || value.version !== DB_VERSION || !Array.isArray(value.entries)) {
        resolve(null);
        return;
      }
      resolve({ ...value, entries: normalize(value.entries) });
    };
    req.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

/**
 * Persists the batch. If the browser refuses the payload (quota), retries
 * without the comparison crops, which are the bulkiest derived data.
 */
export async function saveSession(
  entries: ImageEntry[],
  defaults: AnalysisSettings,
): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;

  const write = (payload: SavedSession) =>
    new Promise<boolean>((resolve) => {
      let req: IDBRequest;
      try {
        req = tx(db, "readwrite").put(payload, KEY);
      } catch {
        resolve(false);
        return;
      }
      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        req.transaction?.abort?.();
        resolve(false);
      };
    });

  const full: SavedSession = {
    version: DB_VERSION,
    savedAt: new Date().toISOString(),
    defaults,
    entries,
  };
  let ok = await write(full);
  if (!ok) {
    ok = await write({
      ...full,
      entries: entries.map((e) => ({ ...e, blankMatches: undefined })),
    });
  }
  db.close();
  return ok;
}

export async function clearSession(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const req = tx(db, "readwrite").delete(KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
  db.close();
}
