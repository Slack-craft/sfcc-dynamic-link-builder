type StoredPdf = {
  fileId: string
  name: string
  blob: Blob
  size: number
  lastModified: number
  createdAt: number
}

const DB_NAME = "sca_catalogue_pdf_store"
const STORE_NAME = "pdfBlobs"
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "fileId" })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
  return dbPromise
}

export async function putPdf(record: StoredPdf): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store PDF"))
    tx.objectStore(STORE_NAME).put(record)
  })
}

export async function getPdf(fileId: string): Promise<StoredPdf | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const request = tx.objectStore(STORE_NAME).get(fileId)
    request.onsuccess = () => resolve(request.result as StoredPdf | undefined)
    request.onerror = () => reject(request.error ?? new Error("Failed to read PDF"))
  })
}

export async function deletePdf(fileId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete PDF"))
    tx.objectStore(STORE_NAME).delete(fileId)
  })
}

export async function clearPdfStore(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to clear PDF store"))
    tx.objectStore(STORE_NAME).clear()
  })
}
