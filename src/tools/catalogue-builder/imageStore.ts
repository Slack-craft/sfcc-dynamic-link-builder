const DB_NAME = "catalogue-builder-images"
const STORE_NAME = "images"
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"))
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        const request = run(store)
        request.onsuccess = () => resolve(request.result as T)
        request.onerror = () =>
          reject(request.error ?? new Error("IndexedDB request failed"))
        tx.oncomplete = () => db.close()
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error("IndexedDB transaction failed"))
        }
      })
  )
}

export function putImage(key: string, blob: Blob): Promise<void> {
  return withStore("readwrite", (store) => store.put(blob, key)).then(() => undefined)
}

export function getImage(key: string): Promise<Blob | undefined> {
  return withStore<Blob | undefined>("readonly", (store) => store.get(key))
}

export function delImage(key: string): Promise<void> {
  return withStore("readwrite", (store) => store.delete(key)).then(() => undefined)
}

export async function clearImagesForProject(tileKeys: string[]): Promise<void> {
  for (const key of tileKeys) {
    await delImage(key)
  }
}
