import type { CatalogueProject } from "@/tools/catalogue-builder/catalogueTypes"

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

export type TileDetailRecord = {
  detailKey: string
  projectId: string
  tileId: string
  version: number
  detail: unknown
  updatedAt: number
}

const DB_NAME = "sca_catalogue_asset_store"
const STORE_NAME = "assets"
const DATASET_STORE = "datasets"
const TILE_DETAIL_STORE = "tile_details"
const PROJECT_STORE = "catalogue_projects"
const DB_VERSION = 4

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
      if (!db.objectStoreNames.contains(TILE_DETAIL_STORE)) {
        db.createObjectStore(TILE_DETAIL_STORE, { keyPath: "detailKey" })
      }
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: "projectId" })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
  return dbPromise
}

function getTileDetailKey(projectId: string, tileId: string) {
  return `${projectId}:${tileId}`
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

export async function putTileDetail(
  projectId: string,
  tileId: string,
  detail: unknown,
  version = 1
): Promise<void> {
  const record: TileDetailRecord = {
    detailKey: getTileDetailKey(projectId, tileId),
    projectId,
    tileId,
    version,
    detail,
    updatedAt: Date.now(),
  }
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TILE_DETAIL_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store tile detail"))
    tx.objectStore(TILE_DETAIL_STORE).put(record)
  })
}

export async function getTileDetail(
  projectId: string,
  tileId: string
): Promise<TileDetailRecord | undefined> {
  const db = await openDb()
  const detailKey = getTileDetailKey(projectId, tileId)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TILE_DETAIL_STORE, "readonly")
    const request = tx.objectStore(TILE_DETAIL_STORE).get(detailKey)
    request.onsuccess = () =>
      resolve(request.result as TileDetailRecord | undefined)
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to read tile detail"))
  })
}

export async function deleteTileDetail(
  projectId: string,
  tileId: string
): Promise<void> {
  const db = await openDb()
  const detailKey = getTileDetailKey(projectId, tileId)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TILE_DETAIL_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete tile detail"))
    tx.objectStore(TILE_DETAIL_STORE).delete(detailKey)
  })
}

export async function listTileDetailsByProject(
  projectId: string
): Promise<TileDetailRecord[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TILE_DETAIL_STORE, "readonly")
    const request = tx.objectStore(TILE_DETAIL_STORE).getAll()
    request.onsuccess = () => {
      const results = (request.result as TileDetailRecord[]).filter(
        (record) => record.projectId === projectId
      )
      resolve(results)
    }
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to list tile details"))
  })
}

export async function putProject(project: CatalogueProject): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store project"))
    tx.objectStore(PROJECT_STORE).put({
      projectId: project.id,
      project,
    })
  })
}

export async function getProject(
  projectId: string
): Promise<CatalogueProject | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, "readonly")
    const request = tx.objectStore(PROJECT_STORE).get(projectId)
    request.onsuccess = () => {
      const record = request.result as { project?: CatalogueProject } | undefined
      resolve(record?.project ?? null)
    }
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to read project"))
  })
}

export async function listProjects(): Promise<CatalogueProject[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, "readonly")
    const request = tx.objectStore(PROJECT_STORE).getAll()
    request.onsuccess = () => {
      const records = request.result as Array<{ project: CatalogueProject }>
      const projects = records.map((record) => record.project)
      projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      resolve(projects)
    }
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to list projects"))
  })
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete project"))
    tx.objectStore(PROJECT_STORE).delete(projectId)
  })
}
