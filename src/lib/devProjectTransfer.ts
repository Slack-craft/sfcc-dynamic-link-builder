import JSZip from "jszip"
import type { CatalogueProject } from "@/tools/catalogue-builder/catalogueTypes"
import type { AssetRecord, DatasetRecord } from "@/lib/assetStore"

export type ProjectExportManifest = {
  schemaVersion: 1
  exportedAt: string
  project: CatalogueProject
  assets: Array<{
    assetId: string
    type: AssetRecord["type"]
    name: string
    createdAt: number
    blobPath: string
  }>
  dataset?: {
    datasetId: string
    filename: string
    createdAt: number
    csvPath: string
  }
}

export async function exportProjectToZip(params: {
  project: CatalogueProject
  assets: AssetRecord[]
  dataset?: DatasetRecord
}): Promise<Blob> {
  const { project, assets, dataset } = params
  const zip = new JSZip()
  const manifest: ProjectExportManifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project,
    assets: assets.map((asset) => ({
      assetId: asset.assetId,
      type: asset.type,
      name: asset.name,
      createdAt: asset.createdAt,
      blobPath: `blobs/assets/${asset.assetId}`,
    })),
    dataset: dataset
      ? {
          datasetId: project.dataset?.id ?? dataset.datasetKey,
          filename: dataset.filename,
          createdAt: dataset.createdAt,
          csvPath: `blobs/datasets/${project.dataset?.id ?? dataset.datasetKey}.csv`,
        }
      : undefined,
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2))

  for (const asset of assets) {
    zip.file(`blobs/assets/${asset.assetId}`, asset.blob)
  }

  if (dataset) {
    const datasetId = project.dataset?.id ?? dataset.datasetKey
    zip.file(`blobs/datasets/${datasetId}.csv`, dataset.csvText)
  }

  return zip.generateAsync({ type: "blob" })
}

export async function importProjectFromZip(file: File): Promise<{
  manifest: ProjectExportManifest
  assetBlobs: Map<string, Blob>
  datasetCsv?: string
}> {
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)
  const manifestEntry = zip.file("manifest.json")
  if (!manifestEntry) {
    throw new Error("Export missing manifest.json")
  }
  const manifestRaw = await manifestEntry.async("text")
  const manifest = JSON.parse(manifestRaw) as ProjectExportManifest
  if (!manifest || manifest.schemaVersion !== 1) {
    throw new Error("Unsupported export schema")
  }

  const assetBlobs = new Map<string, Blob>()
  for (const asset of manifest.assets) {
    const entry = zip.file(asset.blobPath)
    if (!entry) continue
    const blob = await entry.async("blob")
    assetBlobs.set(asset.assetId, blob)
  }

  let datasetCsv: string | undefined
  if (manifest.dataset) {
    const entry = zip.file(manifest.dataset.csvPath)
    if (entry) {
      datasetCsv = await entry.async("text")
    }
  }

  return { manifest, assetBlobs, datasetCsv }
}
