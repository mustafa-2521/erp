// Minimal IndexedDB wrapper: `cache` holds last-known server data, `outbox` holds writes made offline.
const DB_NAME = 'inks-erp';
const VERSION = 1;

type Store = 'cache' | 'outbox';
export type CacheEntry<T> = { key: string; value: T; savedAt: number };

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('cache', { keyPath: 'key' });
      db.createObjectStore('outbox', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

async function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch { return fallback; }
};

export const cacheGet = <T>(key: string) =>
  safe(() => run<CacheEntry<T> | undefined>('cache', 'readonly', s => s.get(key)), undefined);
export const cachePut = <T>(key: string, value: T) =>
  safe(() => run('cache', 'readwrite', s => s.put({ key, value, savedAt: Date.now() } satisfies CacheEntry<T>)).then(() => undefined), undefined);
export const cacheClear = () => safe(() => run('cache', 'readwrite', s => s.clear()).then(() => undefined), undefined);

// Outbox calls are not wrapped in `safe`: a write that cannot be persisted must surface as an error.
export const outboxAll = <T>() => run<T[]>('outbox', 'readonly', s => s.getAll());
export const outboxPut = <T>(item: T) => run('outbox', 'readwrite', s => s.put(item)).then(() => undefined);
export const outboxDelete = (id: string) => run('outbox', 'readwrite', s => s.delete(id)).then(() => undefined);
export const outboxClear = () => run('outbox', 'readwrite', s => s.clear()).then(() => undefined);
