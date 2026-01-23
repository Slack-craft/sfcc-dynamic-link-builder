export type AssetType = "image" | "pdf"

export type AssetRecord = {
  assetId: string
  projectId: string
  type: AssetType
  name: string
  blob: Blob
  createdAt: number
}

export type DatasetRecord = {
  datasetKey: string
  projectId: string
  filename: string
  csvText: string
  createdAt: number
}

const DB_NAME = "sca_catalogue_asset_store"
const STORE_NAME = "assets"
const DATASET_STORE = "datasets"
const DB_VERSION = 2

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error("Failed to open asset DB"))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "assetId" })
      }
      if (!db.objectStoreNames.contains(DATASET_STORE)) {
        db.createObjectStore(DATASET_STORE, { keyPath: "datasetKey" })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
  return dbPromise
}

export async function putAsset(
  projectId: string,
  type: AssetType,
  name: string,
  blob: Blob
): Promise<string> {
  const assetId = crypto.randomUUID()
  const record: AssetRecord = {
    assetId,
    projectId,
    type,
    name,
    blob,
    createdAt: Date.now(),
  }
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store asset"))
    tx.objectStore(STORE_NAME).put(record)
  })
  return assetId
}

export async function putAssetRecord(record: AssetRecord): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store asset record"))
    tx.objectStore(STORE_NAME).put(record)
  })
}

export async function getAsset(assetId: string): Promise<AssetRecord | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const request = tx.objectStore(STORE_NAME).get(assetId)
    request.onsuccess = () => resolve(request.result as AssetRecord | undefined)
    request.onerror = () => reject(request.error ?? new Error("Failed to read asset"))
  })
}

export async function listAssets(
  projectId: string,
  type?: AssetType
): Promise<AssetRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      const results = (request.result as AssetRecord[]).filter(
        (record) =>
          record.projectId === projectId && (!type || record.type === type)
      )
      resolve(results)
    }
    request.onerror = () => reject(request.error ?? new Error("Failed to list assets"))
  })
}

export async function deleteAsset(assetId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete asset"))
    tx.objectStore(STORE_NAME).delete(assetId)
  })
}

export async function deleteAssetsForProject(projectId: string): Promise<void> {
  const assets = await listAssets(projectId)
  if (assets.length === 0) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to clear assets"))
    const store = tx.objectStore(STORE_NAME)
    assets.forEach((asset) => store.delete(asset.assetId))
  })
}

export async function putProjectDataset(
  datasetKey: string,
  projectId: string,
  filename: string,
  csvText: string
): Promise<void> {
  const record: DatasetRecord = {
    datasetKey,
    projectId,
    filename,
    csvText,
    createdAt: Date.now(),
  }
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DATASET_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store dataset"))
    tx.objectStore(DATASET_STORE).put(record)
  })
}

export async function getProjectDataset(
  datasetKey: string
): Promise<DatasetRecord | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATASET_STORE, "readonly")
    const request = tx.objectStore(DATASET_STORE).get(datasetKey)
    request.onsuccess = () => resolve(request.result as DatasetRecord | undefined)
    request.onerror = () => reject(request.error ?? new Error("Failed to read dataset"))
  })
}

export async function deleteProjectDataset(datasetKey: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DATASET_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete dataset"))
    tx.objectStore(DATASET_STORE).delete(datasetKey)
  })
}
