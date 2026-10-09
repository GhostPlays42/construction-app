// A small wrapper around the phone's built-in database (IndexedDB), which
// keeps data when the app is closed and has room for photos later.

const DB_NAME = "construction-app";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  store: "kv" | "outbox",
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const kv = {
  get: <T>(key: string) => run<T | undefined>("kv", "readonly", (s) => s.get(key)),
  set: (key: string, value: unknown) => run("kv", "readwrite", (s) => s.put(value, key)),
  delete: (key: string) => run("kv", "readwrite", (s) => s.delete(key)),
};

export const outboxStore = {
  all: <T>() => run<T[]>("outbox", "readonly", (s) => s.getAll()),
  put: <T extends { id: string }>(item: T) => run("outbox", "readwrite", (s) => s.put(item)),
  delete: (id: string) => run("outbox", "readwrite", (s) => s.delete(id)),
};
