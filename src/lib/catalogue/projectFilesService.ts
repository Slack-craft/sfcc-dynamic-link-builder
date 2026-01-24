import type { MutableRefObject } from "react"
import type { CatalogueProject, Tile } from "@/tools/catalogue-builder/catalogueTypes"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"
import type { AssetRecord, DatasetRecord } from "@/lib/assetStore"
import type { ProjectExportManifest } from "@/lib/devProjectTransfer"

type ToastApi = {
  warning: (message: string) => void
  error: (message: string) => void
  success: (message: string) => void
  info?: (message: string) => void
}

export type ReplaceSummary = {
  replaced: number
  created: number
  skipped: number
  replacedItems: Array<{ fileName: string; tileId: string; imageKey: string }>
}

export function buildUploadSignature(files: File[]) {
  return files
    .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    .join("|")
}

export function getDatasetKey(projectId: string, datasetId: string) {
  return `${projectId}:catalogueDataset:${datasetId}`
}

export async function createTilesFromFiles(params: {
  project: CatalogueProject | null
  fileList: FileList
  replaceExisting: boolean
  maxTotalUploadBytes: number
  isUploadingImagesRef: MutableRefObject<boolean>
  lastUploadSignatureRef: MutableRefObject<string | null>
  deleteImagesForProject: (projectId: string) => Promise<void>
  clearObjectUrlCache: () => void
  putImage: (projectId: string, name: string, blob: Blob) => Promise<string>
  putAssetRecord: (record: AssetRecord) => Promise<void>
  stripExtension: (value: string) => string
  sanitizeTileId: (value: string) => string
  createEmptyLinkBuilderState: () => LinkBuilderState
  createEmptyExtractedFlags: () => boolean[]
  upsertProject: (updated: CatalogueProject) => void
  setSelectedTileId: (tileId: string | null) => void
  toast: ToastApi
  isDev: boolean
}): Promise<ReplaceSummary | null> {
  const {
    project,
    fileList,
    replaceExisting,
    maxTotalUploadBytes,
    isUploadingImagesRef,
    lastUploadSignatureRef,
    deleteImagesForProject,
    clearObjectUrlCache,
    putImage,
    putAssetRecord,
    stripExtension,
    sanitizeTileId,
    createEmptyLinkBuilderState,
    createEmptyExtractedFlags,
    upsertProject,
    setSelectedTileId,
    toast,
    isDev,
  } = params
  if (!project) return null
  const files = Array.from(fileList).sort((a: File, b: File) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  )

  if (files.length === 0) return null
  const uploadSignature = buildUploadSignature(files)
  if (isUploadingImagesRef.current) {
    if (lastUploadSignatureRef.current === uploadSignature) {
      return null
    }
    return null
  }
  isUploadingImagesRef.current = true
  lastUploadSignatureRef.current = uploadSignature

  try {
    if (replaceExisting) {
      const existingTilesByKey = new Map<string, Tile>()
      project.tiles.forEach((tile) => {
        existingTilesByKey.set(tile.id.toLowerCase(), tile)
        if (tile.originalFileName) {
          existingTilesByKey.set(stripExtension(tile.originalFileName).toLowerCase(), tile)
        }
      })
      const existingIds = new Set(project.tiles.map((tile) => tile.id.toLowerCase()))

      let replacedCount = 0
      const tilesToAdd: Tile[] = []
      const newImageIds: string[] = []
      const replacedItems: Array<{ fileName: string; tileId: string; imageKey: string }> = []
      for (const file of files) {
        const fileKey = stripExtension(file.name).toLowerCase()
        const matchedTile = existingTilesByKey.get(fileKey)
        if (matchedTile && matchedTile.imageKey) {
          await putAssetRecord({
            assetId: matchedTile.imageKey,
            projectId: project.id,
            type: "image",
            name: file.name,
            blob: file,
            createdAt: Date.now(),
          })
          replacedCount += 1
          replacedItems.push({
            fileName: file.name,
            tileId: matchedTile.id,
            imageKey: matchedTile.imageKey,
          })
          continue
        }

        const baseName = stripExtension(file.name)
        const rawId = sanitizeTileId(baseName)
        let uniqueId = rawId
        let suffix = 2
        while (existingIds.has(uniqueId.toLowerCase())) {
          uniqueId = `${rawId}-${suffix}`
          suffix += 1
        }
        existingIds.add(uniqueId.toLowerCase())

        const colorKey = await putImage(project.id, file.name, file)
        newImageIds.push(colorKey)
        tilesToAdd.push({
          id: uniqueId,
          tileNumber: uniqueId,
          status: "todo",
          notes: undefined,
          dynamicLink: undefined,
          activeLinkMode: "plu",
          userHasChosenMode: false,
          linkBuilderState: createEmptyLinkBuilderState(),
          extractedPluFlags: createEmptyExtractedFlags(),
          facetBuilder: {
            selectedBrands: [],
            selectedArticleTypes: [],
            excludedPluIds: [],
            excludePercentMismatchesEnabled: false,
          },
          linkSource: "manual",
          liveCapturedUrl: undefined,
          imageKey: colorKey,
          originalFileName: file.name,
        })
      }

      if (replacedCount > 0 || tilesToAdd.length > 0) {
        clearObjectUrlCache()
        const nextImageAssetIds = Array.from(
          new Set([...(project.imageAssetIds ?? []), ...newImageIds])
        )
        upsertProject({
          ...project,
          tiles: tilesToAdd.length > 0 ? [...project.tiles, ...tilesToAdd] : project.tiles,
          imageAssetIds: nextImageAssetIds,
          updatedAt: new Date().toISOString(),
        })
      }
      if (isDev) {
        console.log("[setup] replace images", {
          files: files.length,
          replaced: replacedCount,
          created: tilesToAdd.length,
        })
      }
      return {
        replaced: replacedCount,
        created: tilesToAdd.length,
        skipped: Math.max(0, files.length - replacedCount - tilesToAdd.length),
        replacedItems,
      }
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > maxTotalUploadBytes) {
      toast.warning("Large upload detected. localStorage may hit limits with big image sets.")
    }

    const existingIds = new Set(
      (replaceExisting ? [] : project.tiles.map((tile) => tile.id)).map((id) =>
        id.toLowerCase()
      )
    )

    const tilesToAdd: Tile[] = []
    const newImageIds: string[] = []
    for (const file of files) {
      const baseName = stripExtension(file.name)
      const rawId = sanitizeTileId(baseName)
      let uniqueId = rawId
      let suffix = 2
      while (existingIds.has(uniqueId.toLowerCase())) {
        uniqueId = `${rawId}-${suffix}`
        suffix += 1
      }
      existingIds.add(uniqueId.toLowerCase())

      const colorKey = await putImage(project.id, file.name, file)
      newImageIds.push(colorKey)
      tilesToAdd.push({
        id: uniqueId,
        tileNumber: uniqueId,
        status: "todo",
        notes: undefined,
        dynamicLink: undefined,
        activeLinkMode: "plu",
        userHasChosenMode: false,
        linkBuilderState: createEmptyLinkBuilderState(),
        extractedPluFlags: createEmptyExtractedFlags(),
        facetBuilder: {
          selectedBrands: [],
          selectedArticleTypes: [],
          excludedPluIds: [],
          excludePercentMismatchesEnabled: false,
        },
        linkSource: "manual",
        liveCapturedUrl: undefined,
        imageKey: colorKey,
        originalFileName: file.name,
      })
    }

    const nextImageAssetIds = Array.from(
      new Set([...(replaceExisting ? [] : project.imageAssetIds ?? []), ...newImageIds])
    )

    const updated: CatalogueProject = {
      ...project,
      tiles: replaceExisting ? tilesToAdd : [...project.tiles, ...tilesToAdd],
      imageAssetIds: nextImageAssetIds,
      updatedAt: new Date().toISOString(),
    }

    upsertProject(updated)
    if (isDev) {
      console.log("[setup] image upload", {
        files: files.length,
        newAssetIds: newImageIds.length,
        imageAssetIds: updated.imageAssetIds.length,
        tiles: updated.tiles.length,
      })
    }
    setSelectedTileId(tilesToAdd[0]?.id ?? updated.tiles[0]?.id ?? null)
    return {
      replaced: 0,
      created: tilesToAdd.length,
      skipped: 0,
      replacedItems: [],
    }
  } finally {
    isUploadingImagesRef.current = false
    lastUploadSignatureRef.current = null
  }
}

export async function handleSetupPdfUpload(params: {
  event: React.ChangeEvent<HTMLInputElement>
  project: CatalogueProject | null
  putAsset: (projectId: string, type: "pdf", name: string, blob: Blob) => Promise<string>
  upsertProject: (updated: CatalogueProject) => void
}) {
  const { event, project, putAsset, upsertProject } = params
  if (!project) return
  const files = event.target.files
  if (!files || files.length === 0) return
  const newPdfIds: string[] = []
  for (const file of Array.from(files)) {
    const pdfId = await putAsset(project.id, "pdf", file.name, file)
    newPdfIds.push(pdfId)
  }
  const nextPdfIds = Array.from(new Set([...(project.pdfAssetIds ?? []), ...newPdfIds]))
  const updated: CatalogueProject = {
    ...project,
    pdfAssetIds: nextPdfIds,
    updatedAt: new Date().toISOString(),
  }
  upsertProject(updated)
  event.target.value = ""
}

export function handleSetupImageUpload(params: {
  event: React.ChangeEvent<HTMLInputElement>
  createTilesFromFiles: (files: FileList, replaceExisting: boolean) => Promise<ReplaceSummary | null>
}) {
  const { event, createTilesFromFiles } = params
  const files = event.target.files
  if (!files || files.length === 0) return
  void createTilesFromFiles(files, false)
  event.target.value = ""
}

export async function handleDatasetUpload(params: {
  event: React.ChangeEvent<HTMLInputElement>
  project: CatalogueProject | null
  parseCsvText: (text: string) => { headers: string[]; rows: Array<Record<string, string>> }
  putProjectDataset: (
    datasetKey: string,
    projectId: string,
    filename: string,
    csvText: string
  ) => Promise<void>
  datasetRowsRef: MutableRefObject<Array<Record<string, string>>>
  upsertProject: (updated: CatalogueProject) => void
}) {
  const { event, project, parseCsvText, putProjectDataset, datasetRowsRef, upsertProject } =
    params
  if (!project) return
  const file = event.target.files?.[0]
  if (!file) return
  const text = await file.text()
  const parsed = parseCsvText(text)
  const datasetId = crypto.randomUUID()
  const datasetKey = getDatasetKey(project.id, datasetId)
  await putProjectDataset(datasetKey, project.id, file.name, text)

  datasetRowsRef.current = parsed.rows

  const updated: CatalogueProject = {
    ...project,
    dataset: {
      id: datasetId,
      filename: file.name,
      rowCount: parsed.rows.length,
      headers: parsed.headers,
      loadedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  }
  upsertProject(updated)
  event.target.value = ""
}

export async function handleClearDataset(params: {
  project: CatalogueProject | null
  deleteProjectDataset: (datasetKey: string) => Promise<void>
  datasetRowsRef: MutableRefObject<Array<Record<string, string>>>
  upsertProject: (updated: CatalogueProject) => void
}) {
  const { project, deleteProjectDataset, datasetRowsRef, upsertProject } = params
  if (!project || !project.dataset) return
  const datasetKey = getDatasetKey(project.id, project.dataset.id)
  await deleteProjectDataset(datasetKey)
  datasetRowsRef.current = []
  const updated: CatalogueProject = {
    ...project,
    dataset: null,
    updatedAt: new Date().toISOString(),
  }
  upsertProject(updated)
}

export async function handleDownloadDataset(params: {
  project: CatalogueProject | null
  getProjectDataset: (datasetKey: string) => Promise<DatasetRecord | undefined>
  toast: ToastApi
}) {
  const { project, getProjectDataset, toast } = params
  if (!project?.dataset) return
  const datasetKey = getDatasetKey(project.id, project.dataset.id)
  const record = await getProjectDataset(datasetKey)
  if (!record) {
    toast.error("Dataset file not found in storage.")
    return
  }
  const blob = new Blob([record.csvText], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = record.filename || project.dataset.filename || "dataset.csv"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function handleExportProjectData(params: {
  project: CatalogueProject | null
  listAssets: (projectId: string) => Promise<AssetRecord[]>
  getProjectDataset: (datasetKey: string) => Promise<DatasetRecord | undefined>
  exportProjectToZip: (payload: {
    project: CatalogueProject
    assets: AssetRecord[]
    dataset?: DatasetRecord
  }) => Promise<Blob>
  toast: ToastApi
}) {
  const { project, listAssets, getProjectDataset, exportProjectToZip, toast } = params
  if (!project) return
  try {
    const assets = await listAssets(project.id)
    const datasetRecord = project.dataset
      ? await getProjectDataset(getDatasetKey(project.id, project.dataset.id))
      : undefined
    const blob = await exportProjectToZip({
      project,
      assets,
      dataset: datasetRecord,
    })
    const safeName = project.name.replace(/[^a-z0-9_-]+/gi, "_")
    const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)
    const filename = `catalogue_link_builder_export_${safeName}_${timestamp}.zip`
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.success("Project export ready.")
  } catch (error) {
    toast.error("Failed to export project data.")
  }
}

export async function handleImportProjectData(params: {
  datasetImportRef: MutableRefObject<HTMLInputElement | null>
  setDatasetImporting: (value: boolean) => void
  importProjectFromZip: (file: File) => Promise<{
    manifest: ProjectExportManifest
    assetBlobs: Map<string, Blob>
    datasetCsv?: string
  }>
  putProjectDataset: (
    datasetKey: string,
    projectId: string,
    filename: string,
    csvText: string
  ) => Promise<void>
  putAssetRecord: (record: AssetRecord) => Promise<void>
  setProjectsState: (updater: (prev: { projects: CatalogueProject[]; activeProjectId: string | null }) => {
    projects: CatalogueProject[]
    activeProjectId: string | null
  }) => void
  setDatasetImportOpen: (value: boolean) => void
  toast: ToastApi
}) {
  const {
    datasetImportRef,
    setDatasetImporting,
    importProjectFromZip,
    putProjectDataset,
    putAssetRecord,
    setProjectsState,
    setDatasetImportOpen,
    toast,
  } = params
  if (!datasetImportRef.current?.files?.[0]) return
  const file = datasetImportRef.current.files[0]
  setDatasetImporting(true)
  try {
    const { manifest, assetBlobs, datasetCsv } = await importProjectFromZip(file)
    const newProjectId = crypto.randomUUID()
    const now = new Date().toISOString()
    const imported: CatalogueProject = {
      ...manifest.project,
      id: newProjectId,
      createdAt: now,
      updatedAt: now,
    }

    if (imported.dataset && datasetCsv) {
      const datasetKey = getDatasetKey(newProjectId, imported.dataset.id)
      await putProjectDataset(datasetKey, newProjectId, imported.dataset.filename, datasetCsv)
    } else {
      imported.dataset = null
    }

    for (const assetMeta of manifest.assets) {
      const blob = assetBlobs.get(assetMeta.assetId)
      if (!blob) continue
      await putAssetRecord({
        assetId: assetMeta.assetId,
        projectId: newProjectId,
        type: assetMeta.type,
        name: assetMeta.name,
        blob,
        createdAt: assetMeta.createdAt,
      })
    }

    setProjectsState((prev) => ({
      activeProjectId: newProjectId,
      projects: [...prev.projects, imported],
    }))
    datasetImportRef.current.value = ""
    setDatasetImportOpen(false)
    toast.success(`Imported project: ${imported.name}`)
  } catch (error) {
    toast.error("Failed to import project data.")
  } finally {
    setDatasetImporting(false)
  }
}

export function handleUploadChange(params: {
  event: React.ChangeEvent<HTMLInputElement>
  createTilesFromFiles: (files: FileList, replaceExisting: boolean) => Promise<ReplaceSummary | null>
}) {
  const { event, createTilesFromFiles } = params
  const files = event.target.files
  if (!files || files.length === 0) return
  void createTilesFromFiles(files, false)
  event.target.value = ""
}

export async function handleReplaceChange(params: {
  event: React.ChangeEvent<HTMLInputElement>
  createTilesFromFiles: (files: FileList, replaceExisting: boolean) => Promise<ReplaceSummary | null>
}): Promise<ReplaceSummary | null> {
  const { event, createTilesFromFiles } = params
  const files = event.target.files
  if (!files || files.length === 0) return null
  const summary = await createTilesFromFiles(files, true)
  event.target.value = ""
  return summary
}

export function handleDrop(params: {
  event: React.DragEvent<HTMLDivElement>
  createTilesFromFiles: (files: FileList, replaceExisting: boolean) => Promise<ReplaceSummary | null>
}) {
  const { event, createTilesFromFiles } = params
  event.preventDefault()
  const files = event.dataTransfer.files
  if (!files || files.length === 0) return
  void createTilesFromFiles(files, false)
}

export function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
  event.preventDefault()
}
