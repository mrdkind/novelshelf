/**
 * لایه دسترسی به IndexedDB — مستقل از کامپوننت‌ها تا در آینده قابل جایگزینی باشد.
 * (مثلاً تبدیل به localStorage یا API ابری بدون تغییر بقیه کد)
 */

const DB_NAME = 'novelshelf';
const DB_VERSION = 1;

export const STORES = {
  progress: 'progress',
  bookmarks: 'bookmarks',
  favorites: 'favorites',
  history: 'history',
  readChapters: 'readChapters',
  settings: 'settings',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function isSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (!isSupported()) {
    return Promise.reject(new Error('unsupported'));
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.progress)) {
        const s = db.createObjectStore(STORES.progress, { keyPath: 'key' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORES.bookmarks)) {
        const s = db.createObjectStore(STORES.bookmarks, { keyPath: 'id' });
        s.createIndex('bookId', 'bookId');
        s.createIndex('volumeId', 'volumeId');
      }
      if (!db.objectStoreNames.contains(STORES.favorites)) {
        db.createObjectStore(STORES.favorites, { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains(STORES.history)) {
        const s = db.createObjectStore(STORES.history, { keyPath: 'bookId' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORES.readChapters)) {
        const s = db.createObjectStore(STORES.readChapters, { keyPath: 'key' });
        s.createIndex('bookId', 'bookId');
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('open-failed'));
    };
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('tx-abort'));
    tx.onerror = () => reject(tx.error ?? new Error('tx-error'));
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function getByIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).index(index).getAll(key);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value as unknown as object);
  return txDone(tx);
}

export async function bulkPut<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v as unknown as object);
  return txDone(tx);
}

export async function remove(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return txDone(tx);
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  return txDone(tx);
}

export async function clearAll(): Promise<void> {
  for (const store of Object.values(STORES)) {
    await clearStore(store);
  }
}
