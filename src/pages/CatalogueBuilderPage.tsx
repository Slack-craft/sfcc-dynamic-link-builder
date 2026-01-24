import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import CatalogueHeader from "@/components/catalogue/CatalogueHeader"
import DevPanel from "@/components/catalogue/DevPanel"
import TileListPanel from "@/components/catalogue/TileListPanel"
import TileDetailsCard from "@/components/catalogue/TileDetailsCard"
import TileBuilderPanel from "@/components/catalogue/TileBuilderPanel"
import TileListView from "@/components/catalogue/TileListView"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Eraser } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import DatasetDropdownMenu from "@/components/catalogue/DatasetDropdownMenu"
import { toast } from "sonner"
import type { DynamicLinkBuilderHandle } from "@/tools/link-builder/DynamicLinkBuilder"
import { BRAND_OPTIONS } from "@/data/brands"
import {
  createProject,
  loadProjectsState,
  saveProjectsState,
  updateTile,
} from "@/tools/catalogue-builder/catalogueProjectsStorage"
import { clearImagesForProject, getImage, putImage } from "@/tools/catalogue-builder/imageStore"
import {
  deleteAssetsForProject,
  listAssets,
  putAsset,
  putAssetRecord,
  putProjectDataset,
  getProjectDataset,
  getAsset,
  deleteProjectDataset,
} from "@/lib/assetStore"
import PdfTileDetectionPage from "@/pages/PdfTileDetectionPage"
import { type PdfRect } from "@/tools/catalogue-builder/pdfTextExtract"
import { clearObjectUrlCache, getObjectUrl, revokeObjectUrl } from "@/lib/images/objectUrlCache"
import { linkViaPreview, openPreview } from "@/lib/preview/previewService"
import { parseCsvText } from "@/lib/catalogueDataset/parseCsv"
import { exportProjectToZip, importProjectFromZip } from "@/lib/devProjectTransfer"
import useProjectDataset from "@/hooks/useProjectDataset"
import useTileSelection from "@/hooks/useTileSelection"
import useTileBuilder from "@/hooks/useTileBuilder"
import useTileDraftState from "@/hooks/useTileDraftState"
import useGlobalShortcuts, { isTypingTarget } from "@/hooks/useGlobalShortcuts"
import useCatalogueActions from "@/hooks/useCatalogueActions"
import {
  createTilesFromFiles as createTilesFromFilesService,
  getDatasetKey,
  handleClearDataset as handleClearDatasetService,
  handleDatasetUpload as handleDatasetUploadService,
  handleDownloadDataset as handleDownloadDatasetService,
  handleDragOver as handleDragOverService,
  handleDrop as handleDropService,
  handleExportProjectData as handleExportProjectDataService,
  handleImportProjectData as handleImportProjectDataService,
  handleReplaceChange as handleReplaceChangeService,
  handleSetupImageUpload as handleSetupImageUploadService,
  handleSetupPdfUpload as handleSetupPdfUploadService,
  handleUploadChange as handleUploadChangeService,
} from "@/lib/catalogue/projectFilesService"
import { sanitizeTileId, stripExtension } from "@/lib/catalogue/format"
import { buildFacetQueryFromSelections } from "@/lib/catalogue/facets"
import { createEmptyExtractedFlags } from "@/lib/catalogue/plu"
import {
  buildDynamicOutputFromState,
  createEmptyLinkBuilderState,
  stripLegacyExtensionFromTile,
} from "@/lib/catalogue/link"
import { getExportSpreadOrder } from "@/lib/catalogue/pdf"
 
import type {
  CatalogueProject,
  ProjectStage,
  Region,
} from "@/tools/catalogue-builder/catalogueTypes"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"

const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024
const PDF_DETECTION_STORAGE_KEY = "sca_pdf_tile_project_v1"
const MAX_EXTRACTED_PLUS = 20
const isDev = (import.meta as any).env?.DEV

type PdfExportBox = PdfRect & {
  rectId?: string
  include?: boolean
  orderIndex?: number
}

type PdfExportPage = {
  pageNumber: number
  pageWidth?: number
  pageHeight?: number
  boxes: PdfExportBox[]
}

type PdfExportEntry = {
  pdfId: string
  filename?: string
  spreadNumber?: number
  pages: Record<string, PdfExportPage> | PdfExportPage[]
}

async function deleteImagesForProject(projectId: string) {
  await clearImagesForProject(projectId)
}

function readPdfDetectionFromStorage(): Record<string, unknown> {
  const raw = localStorage.getItem(PDF_DETECTION_STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore parse errors
  }
  return {}
}

function writePdfDetectionToStorage(payload: Record<string, unknown>) {
  localStorage.setItem(PDF_DETECTION_STORAGE_KEY, JSON.stringify(payload))
}

export default function CatalogueBuilderPage() {
  const SHOW_DETECTION_EXPORT = false
  const renderCountRef = useRef(0)
  renderCountRef.current += 1
  if (isDev && renderCountRef.current % 10 === 0) {
    console.log("[CB] renders", renderCountRef.current)
  }
  const [projectsState, setProjectsState] = useState(() => loadProjectsState())
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectRegion, setNewProjectRegion] = useState<Region>("AU")
  const [tileThumbUrls, setTileThumbUrls] = useState<Record<string, string>>({})
  const [selectedColorUrl, setSelectedColorUrl] = useState<string | null>(null)
  const [pdfExtractRunning, setPdfExtractRunning] = useState(false)
  const [showMissingOnly, setShowMissingOnly] = useState(false)
  const [pdfAssetNames, setPdfAssetNames] = useState<Record<string, string>>({})
  const [offerDebugOpen, setOfferDebugOpen] = useState(false)
  const [offerTextDebugOpen, setOfferTextDebugOpen] = useState(false)
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false)
  const [pendingCapturedUrl, setPendingCapturedUrl] = useState<string | null>(null)
  const [datasetUploadOpen, setDatasetUploadOpen] = useState(false)
  const [datasetDetailsOpen, setDatasetDetailsOpen] = useState(false)
  const [datasetClearOpen, setDatasetClearOpen] = useState(false)
  const [datasetImportOpen, setDatasetImportOpen] = useState(false)
  const [datasetImporting, setDatasetImporting] = useState(false)
  const [devDebugOpen, setDevDebugOpen] = useState(false)
  const [lastReplaceLog, setLastReplaceLog] = useState<{
    at: string
    replaced: number
    created: number
    skipped: number
    replacedItems: Array<{ fileName: string; tileId: string; imageKey: string }>
  } | null>(null)
  const [awaitingManualLink, setAwaitingManualLink] = useState(false)
  const linkBuilderRef = useRef<DynamicLinkBuilderHandle | null>(null)
  const activeLinkModeRef = useRef<"plu" | "facet" | "live">("plu")
  const userHasChosenModeRef = useRef(false)
  const facetBrandsRef = useRef<string[]>([])
  const facetArticleTypesRef = useRef<string[]>([])
  const liveLinkInputRef = useRef<HTMLInputElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const replaceSingleInputRef = useRef<HTMLInputElement | null>(null)
  const addImagesInputRef = useRef<HTMLInputElement | null>(null)
  const datasetInputRef = useRef<HTMLInputElement | null>(null)
  const datasetImportRef = useRef<HTMLInputElement | null>(null)
  const isUploadingImagesRef = useRef(false)
  const lastUploadSignatureRef = useRef<string | null>(null)
  const beforeSelectRef = useRef<(() => void) | null>(null)

  const project = useMemo(() => {
    return (
      projectsState.projects.find(
        (item: CatalogueProject) => item.id === projectsState.activeProjectId
      ) ?? null
    )
  }, [projectsState])

  const {
    selectedTileId,
    setSelectedTileId,
    selectedTile,
    selectTile,
    selectTileByOffset,
  } = useTileSelection(project, beforeSelectRef)

  const { datasetMeta, datasetRowsRef, facetColumnList } = useProjectDataset(
    project?.id ?? null,
    project?.dataset?.id ?? null
  )

  const mappingDebug = useMemo(() => {
    if (!project) return undefined
    const tileMatches = project.tileMatches ?? {}
    const tiles = project.tiles ?? []
    const mappingLines = Object.entries(tileMatches)
      .slice(0, 20)
      .map(([rectId, imageId]) => `${rectId} -> ${imageId}`)

    const tileLines = tiles.slice(0, 20).map((tile) => {
      const imageKey = tile.imageKey ?? ""
      const rectId =
        imageKey.length > 0
          ? Object.entries(tileMatches).find(([, imageId]) => imageId === imageKey)?.[0] ?? "—"
          : "—"
      return [
        tile.id,
        `imageKey=${imageKey || "—"}`,
        `file=${tile.originalFileName ?? "—"}`,
        `rect=${rectId}`,
      ].join(" | ")
    })

    const exportEntries = getExportSpreadOrder(
      (project.pdfDetection as { export?: PdfExportEntry[] } | undefined)?.export ?? []
    )
    let rectCount = 0
    exportEntries.forEach((entry) => {
      const pages = Array.isArray(entry.pages) ? entry.pages : Object.values(entry.pages ?? {})
      pages.forEach((page: PdfExportPage) => {
        rectCount += page.boxes.length
      })
    })
    const mappedRectCount = Object.keys(tileMatches).length

    return {
      tilesCount: tiles.length,
      rectCount,
      mappedRectCount,
      tileLines,
      mappingLines,
    }
  }, [project?.id, project?.tiles, project?.tileMatches, project?.pdfDetection])
  const { vm: draftVm, actions: draftActions } = useTileDraftState({
    project,
    selectedTile,
    updateTile,
    onUpsertProject: upsertProject,
    commitBuilderState: () => linkBuilderRef.current?.commitNow(),
    beforeSelectRef,
    getActiveLinkMode: () => activeLinkModeRef.current,
    getUserHasChosenMode: () => userHasChosenModeRef.current,
    getFacetBrands: () => facetBrandsRef.current,
    getFacetArticleTypes: () => facetArticleTypesRef.current,
  })
  const {
    draftTitle,
    draftStatus,
    draftNotes,
    draftLinkState,
    draftExtractedFlags,
    draftFacetExcludedPluIds,
    draftFacetExcludePercentEnabled,
    draftLiveCapturedUrl,
  } = draftVm
  const {
    setDraftTitle,
    setDraftTitleEditedManually,
    setDraftStatus,
    setDraftNotes,
    setDraftLinkState,
    setDraftLinkOutput,
    setDraftExtractedFlags,
    setDraftFacetExcludedPluIds,
    setDraftFacetExcludePercentEnabled,
    setDraftLiveCapturedUrl,
    setDraftLinkSource,
    commitAndSaveSelectedTile,
  } = draftActions

  const datasetBrandOptions = useMemo(() => {
    if (!datasetMeta) return BRAND_OPTIONS
    const values = new Set<string>()
    datasetRowsRef.current.forEach((row) => {
      const value = row.brand?.trim()
      if (value) values.add(value)
    })
    if (values.size === 0) return BRAND_OPTIONS
    return Array.from(values).map((value) => ({ label: value, value }))
  }, [datasetMeta?.version])

  function persistProjectsState(
    updater: (prev: typeof projectsState) => typeof projectsState
  ) {
    setProjectsState((prev) => {
      const nextState = updater(prev)
      saveProjectsState(nextState)
      return nextState
    })
  }

  useEffect(() => {
    if (!project || project.stage !== "pdf-detect") return
    writePdfDetectionToStorage(project.pdfDetection ?? {})
  }, [project?.id, project?.stage, project?.pdfDetection])

  useEffect(() => {
    let cancelled = false
    async function loadPdfNames() {
      if (!project) {
        setPdfAssetNames({})
        return
      }
      const entries = await Promise.all(
        project.pdfAssetIds.map(async (assetId) => {
          const asset = await getAsset(assetId)
          return [assetId, asset?.name ?? "Unknown PDF"] as const
        })
      )
      if (cancelled) return
      setPdfAssetNames(Object.fromEntries(entries))
    }
    void loadPdfNames()
    return () => {
      cancelled = true
    }
  }, [project?.id, project?.pdfAssetIds])


  const projectBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Label className="text-xs font-medium uppercase text-muted-foreground">Project</Label>
      <select
        value={projectsState.activeProjectId ?? ""}
        onChange={(event) => {
          const nextId = event.target.value || null
          setActiveProjectId(nextId)
          setSelectedTileId(null)
        }}
        className="h-9 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm"
      >
        {projectsState.projects.length === 0 ? (
          <option value="">No projects</option>
        ) : null}
        {projectsState.projects.map((item: CatalogueProject) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" onClick={() => setNewProjectOpen(true)}>
        New Project
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" size="sm" variant="outline" disabled={!project}>
            Delete Project
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the project and its saved tiles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
              onClick={async () => {
            if (!project) return
            await deleteAssetsForProject(project.id)
            if (project.dataset) {
              const datasetKey = getDatasetKey(project.id, project.dataset.id)
              await deleteProjectDataset(datasetKey)
            }
            clearObjectUrlCache()
            deleteProject(project.id)
            setSelectedTileId(null)
          }}
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {project ? (
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          {project.region}
        </span>
      ) : null}
      {project?.dataset ? (
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          Dataset: {project.dataset.filename}
        </span>
      ) : null}
      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Create a catalogue project.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateProject}>
            <div className="space-y-2">
              <Label htmlFor="dialog-project-name">Project name</Label>
              <Input
                id="dialog-project-name"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="WK30 AU"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialog-project-region">Region</Label>
              <select
                id="dialog-project-region"
                value={newProjectRegion}
                onChange={(event) => setNewProjectRegion(event.target.value as Region)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="AU">AU</option>
                <option value="NZ">NZ</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!newProjectName.trim()}>
                Create Project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )

  useEffect(() => {
    saveProjectsState(projectsState)
  }, [projectsState])

  function setActiveProjectId(nextId: string | null) {
    persistProjectsState((prev) => ({
      ...prev,
      activeProjectId: nextId,
    }))
  }

  function upsertProject(updated: CatalogueProject) {
    persistProjectsState((prev) => ({
      ...prev,
      projects: prev.projects.map((item: CatalogueProject) =>
        item.id === updated.id ? updated : item
      ),
    }))
  }

  function addProject(newProject: CatalogueProject) {
    persistProjectsState((prev) => ({
      activeProjectId: newProject.id,
      projects: [...prev.projects, newProject],
    }))
  }

  function deleteProject(projectId: string) {
    persistProjectsState((prev) => {
      const projects = prev.projects.filter((item: CatalogueProject) => item.id !== projectId)
      const activeProjectId =
        prev.activeProjectId === projectId ? projects[0]?.id ?? null : prev.activeProjectId
      return { projects, activeProjectId }
    })
  }

  function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = newProjectName.trim()
    if (!trimmedName) return

    const created = createProject(trimmedName, newProjectRegion)
    addProject(created)
    setNewProjectName("")
    setNewProjectRegion("AU")
    setNewProjectOpen(false)
  }

  const tiles = project?.tiles ?? []
  const tileImageSignature = useMemo(() => {
    if (!project) return ""
    return project.tiles
      .map((tile) => `${tile.id}:${tile.imageKey ?? ""}`)
      .join("|")
  }, [project?.id, project?.tiles])
  const missingTilesCount = useMemo(() => {
    const start = performance.now()
    const count = tiles.filter((tile) => tile.pdfMappingStatus === "missing").length
    const duration = performance.now() - start
    if (isDev && duration > 10) {
      console.log("[CB] missingTilesCount", duration.toFixed(1), "ms")
    }
    return count
  }, [tiles])
  const displayTiles = useMemo(() => {
    const start = performance.now()
    const next = showMissingOnly
      ? tiles.filter((tile) => tile.pdfMappingStatus === "missing")
      : tiles
    const duration = performance.now() - start
    if (isDev && duration > 10) {
      console.log("[CB] displayTiles", duration.toFixed(1), "ms")
    }
    return next
  }, [tiles, showMissingOnly])
  const detectionSummary = useMemo(() => {
    const start = performance.now()
    if (!project) return []
    const detectionState = project.pdfDetection as {
      byPdfAssetId?: Record<string, PdfExportEntry>
      export?: PdfExportEntry[]
    }
    const exportEntries = getExportSpreadOrder(detectionState.export ?? [])
    const summary = exportEntries.map((entry, index) => {
      const assetId = entry.pdfId
      const pages = entry?.pages ?? {}
      const pageList: Array<{
        boxes?: Array<{ include?: boolean; orderIndex?: number }>
        pageWidth?: number
        pageHeight?: number
      }> = Array.isArray(pages) ? pages : (Object.values(pages) as Array<{
        boxes?: Array<{ include?: boolean; orderIndex?: number }>
        pageWidth?: number
        pageHeight?: number
      }>)
      const boxes = pageList.flatMap((page) => page.boxes ?? [])
      const included = boxes.filter((box) => box.include ?? true)
      const ordered = included.filter((box) => Number.isFinite(box.orderIndex))
      const hasSize = pageList.some(
        (page) => Number.isFinite(page.pageWidth) && Number.isFinite(page.pageHeight)
      )
      return {
        assetId,
        name: pdfAssetNames[assetId] ?? entry?.filename ?? `PDF ${index + 1}`,
        exportPresent: Boolean(entry),
        totalCount: boxes.length,
        includedCount: included.length,
        orderedCount: ordered.length,
        hasSize,
        spreadNumber: entry?.spreadNumber,
      }
    })
    const duration = performance.now() - start
    if (isDev && duration > 10) {
      console.log("[CB] detectionSummary", duration.toFixed(1), "ms")
    }
    return summary
  }, [project, pdfAssetNames])
  const detectedBrands = useMemo(() => {
    if (selectedTile?.offer?.detectedBrands?.length) {
      return selectedTile.offer.detectedBrands
    }
    if (selectedTile?.offer?.brand?.label) {
      return [selectedTile.offer.brand.label]
    }
    return []
  }, [selectedTile?.offer?.brand?.label, selectedTile?.offer?.detectedBrands])
  const {
    draftActiveLinkMode,
    setDraftActiveLinkMode,
    draftUserHasChosenMode,
    setDraftUserHasChosenMode,
    draftFacetBrands: builderFacetBrands,
    setDraftFacetBrands: setBuilderFacetBrands,
    draftFacetArticleTypes: builderFacetArticleTypes,
    setDraftFacetArticleTypes: setBuilderFacetArticleTypes,
    isPluAvailable,
    isFacetAvailable,
    isLiveAvailable,
    previewUrl,
    onPreviewUrlChange,
    facetQuery,
    activeOutput,
  } = useTileBuilder({
    selectedTile,
    linkState: draftLinkState,
    projectRegion: project?.region,
    liveCapturedUrl: draftLiveCapturedUrl,
    setLiveCapturedUrl: setDraftLiveCapturedUrl,
  })

  useEffect(() => {
    activeLinkModeRef.current = draftActiveLinkMode
    userHasChosenModeRef.current = draftUserHasChosenMode
  }, [draftActiveLinkMode, draftUserHasChosenMode])
  useEffect(() => {
    facetBrandsRef.current = builderFacetBrands
    facetArticleTypesRef.current = builderFacetArticleTypes
  }, [builderFacetBrands, builderFacetArticleTypes])

  const { actions: catalogueActions } = useCatalogueActions({
    project,
    selectedTile,
    draftLinkState,
    setDraftLinkState,
    setDraftLinkOutput,
    setDraftExtractedFlags,
    setDraftLiveCapturedUrl,
    setDraftLinkSource,
    setDraftActiveLinkMode,
    setDraftUserHasChosenMode,
    setPendingCapturedUrl,
    setCaptureDialogOpen,
    setPdfExtractRunning,
    pdfExtractRunning,
    datasetBrandOptions,
    pdfAssetNames,
    updateTile,
    upsertProject,
    deleteImagesForProject,
    setSelectedTileId,
    replaceInputRef,
    toast,
    maxExtractedPlus: MAX_EXTRACTED_PLUS,
    isDev,
  })
  const {
    extractPlusFromPdf,
    reExtractOfferForSelected,
    confirmReplaceAll,
    confirmClearAll,
    convertCapturedUrlToBuilderState,
  } = catalogueActions


  function setProjectStage(nextStage: ProjectStage) {
    if (!project) return
    const nextProject: CatalogueProject = {
      ...project,
      stage: nextStage,
      updatedAt: new Date().toISOString(),
    }
    if (nextStage === "pdf-detect") {
      writePdfDetectionToStorage(nextProject.pdfDetection ?? {})
    }
    if (nextStage === "catalogue") {
      nextProject.pdfDetection = readPdfDetectionFromStorage()
    }
    upsertProject(nextProject)
  }

  function downloadDetectionExport() {
    if (!project) return
    const payload = {
      projectId: project.id,
      projectName: project.name,
      pdfDetection: project.pdfDetection ?? {},
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${project.name || "catalogue"}-pdf-detection.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    let cancelled = false

    if (!project) return () => undefined
    const currentProject = project

    async function loadThumbs() {
      const next: Record<string, string> = {}
      for (const tile of currentProject.tiles) {
        if (!tile.imageKey) continue
        const blob = await getImage(tile.imageKey)
        if (!blob) continue
        const url = getObjectUrl(tile.imageKey, blob)
        next[tile.id] = url
      }
      if (cancelled) {
        return
      }
      setTileThumbUrls(next)
    }

    void loadThumbs()

    return () => {
      cancelled = true
    }
  }, [project?.id, tileImageSignature])

  useEffect(() => {
    async function loadSelectedImages() {
      if (!selectedTile) return
      if (selectedTile.imageKey) {
        const colorBlob = await getImage(selectedTile.imageKey)
        if (colorBlob) {
          const cachedUrl = getObjectUrl(selectedTile.imageKey, colorBlob)
          setSelectedColorUrl(cachedUrl)
        }
      } else {
        setSelectedColorUrl(null)
      }
    }

    void loadSelectedImages()
  }, [
    selectedTile?.id,
    selectedTile?.imageKey,
  ])

  async function createTilesFromFiles(fileList: FileList, replaceExisting: boolean) {
    return await createTilesFromFilesService({
      project,
      fileList,
      replaceExisting,
      maxTotalUploadBytes: MAX_TOTAL_UPLOAD_BYTES,
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
    })
  }

  function handleSetupPdfUpload(event: React.ChangeEvent<HTMLInputElement>) {
    void handleSetupPdfUploadService({
      event,
      project,
      putAsset,
      upsertProject,
    })
  }

  function handleSetupImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    handleSetupImageUploadService({
      event,
      createTilesFromFiles,
    })
  }

  async function handleDatasetUpload(event: React.ChangeEvent<HTMLInputElement>) {
    await handleDatasetUploadService({
      event,
      project,
      parseCsvText,
      putProjectDataset,
      datasetRowsRef,
      upsertProject,
    })
  }

  async function handleClearDataset() {
    await handleClearDatasetService({
      project,
      deleteProjectDataset,
      datasetRowsRef,
      upsertProject,
    })
  }

  async function handleDownloadDataset() {
    await handleDownloadDatasetService({
      project,
      getProjectDataset,
      toast,
    })
  }

  async function handleExportProjectData() {
    await handleExportProjectDataService({
      project,
      listAssets,
      getProjectDataset,
      exportProjectToZip,
      toast,
    })
  }

  async function handleImportProjectData() {
    await handleImportProjectDataService({
      datasetImportRef,
      setDatasetImporting,
      importProjectFromZip,
      putProjectDataset,
      putAssetRecord,
      setProjectsState,
      setDatasetImportOpen,
      toast,
    })
  }

  function handleUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
    handleUploadChangeService({
      event,
      createTilesFromFiles,
    })
  }

  async function handleReplaceChange(event: React.ChangeEvent<HTMLInputElement>) {
    const summary = await handleReplaceChangeService({
      event,
      createTilesFromFiles,
    })
    if (!summary) return
    if (isDev) {
      setLastReplaceLog({
        at: new Date().toISOString(),
        replaced: summary.replaced,
        created: summary.created,
        skipped: summary.skipped,
        replacedItems: summary.replacedItems,
      })
    }
    if (summary.replaced === 0 && summary.created === 0) {
      toast.info("No matching images found to replace.")
      return
    }
    toast.success(
      `Replace completed: ${summary.replaced} replaced, ${summary.created} created, ${summary.skipped} skipped.`
    )
  }

  async function handleAddImagesChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return
    const summary = await createTilesFromFiles(files, false)
    event.target.value = ""
    if (!summary) return
    toast.info(
      `Add Images: ${summary.created} created, ${summary.skipped} skipped duplicates.`
    )
  }

  async function handleReplaceSingleImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !project || !selectedTile?.imageKey) return
    await putAssetRecord({
      assetId: selectedTile.imageKey,
      projectId: project.id,
      type: "image",
      name: file.name,
      blob: file,
      createdAt: Date.now(),
    })
    const updated = updateTile(project, selectedTile.id, {
      imageUpdatedSinceExtraction: true,
    })
    upsertProject(updated)
    revokeObjectUrl(selectedTile.imageKey)
    const blob = await getImage(selectedTile.imageKey)
    if (blob) {
      const nextUrl = getObjectUrl(selectedTile.imageKey, blob)
      setSelectedColorUrl(nextUrl)
      setTileThumbUrls((prev) => ({ ...prev, [selectedTile.id]: nextUrl }))
    }
    event.target.value = ""
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    handleDropService({
      event,
      createTilesFromFiles,
    })
  }

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    handleDragOverService(event)
  }, [])

  useEffect(() => {
    if (!awaitingManualLink) return

    let active = true
    async function onPointerDown(event: PointerEvent) {
      if (!active) return
      if (isTypingTarget(event.target)) return
      active = false
      window.removeEventListener("pointerdown", onPointerDown, { capture: true } as AddEventListenerOptions)
      try {
        const text = await navigator.clipboard.readText()
        const trimmed = text.trim()
        const isAllowed =
          trimmed.startsWith("https://staging.supercheapauto.com.au/") ||
          trimmed.startsWith("https://staging.supercheapauto.co.nz/")
        if (isAllowed) {
          handleCapturedUrl(trimmed)
          setAwaitingManualLink(false)
          toast.success("Live Link pasted")
          return
        }
      } catch {
        // ignore clipboard errors
      }
      setAwaitingManualLink(false)
      liveLinkInputRef.current?.focus()
      toast.info("Paste the URL into Live Link.")
    }

    window.addEventListener("pointerdown", onPointerDown, { capture: true })
    return () => {
      active = false
      window.removeEventListener("pointerdown", onPointerDown, { capture: true } as AddEventListenerOptions)
    }
  }, [awaitingManualLink])

  function handleCapturedUrl(finalUrl: string) {
    setDraftLiveCapturedUrl(finalUrl)
    setDraftActiveLinkMode("live")
    setDraftUserHasChosenMode(true)
    setPendingCapturedUrl(finalUrl)
    setCaptureDialogOpen(true)
  }

  async function handleOpenPreview() {
    await openPreview({
      url: previewUrl,
      extensionStatus: "unavailable",
      setExtensionStatus: () => {},
      onOpenWindow: () => {
        window.open(previewUrl, "scaPreview", "popup,width=1200,height=800")
      },
      toastInfo: toast.info,
    })
  }

  async function handleLinkViaPreview() {
    await linkViaPreview({
      url: previewUrl,
      extensionStatus: "unavailable",
      setExtensionStatus: () => {},
      onBeforeOpen: () => {
        setDraftActiveLinkMode("live")
        setDraftUserHasChosenMode(true)
      },
      onOpenWindow: () => {
        window.open(previewUrl, "scaPreview", "popup,width=1200,height=800")
      },
      onManualFallback: () => {
        setAwaitingManualLink(true)
      },
      toastInfo: toast.info,
    })
  }

  function clearLegacyExtensionData() {
    if (!project) return
    let changed = false
    const cleanedTiles = project.tiles.map((tile) => {
      const cleaned = stripLegacyExtensionFromTile(tile)
      if (cleaned !== tile) changed = true
      return cleaned
    })
    if (!changed) {
      toast.info("No legacy Extension data found for this project.")
      return
    }
    setProjectsState((prev) => ({
      ...prev,
      projects: prev.projects.map((item: CatalogueProject) =>
        item.id === project.id
          ? { ...item, tiles: cleanedTiles, updatedAt: new Date().toISOString() }
          : item
      ),
    }))
    toast.success("Legacy Extension data cleared for this project.")
  }

  useGlobalShortcuts({ onSave: commitAndSaveSelectedTile })

  useEffect(() => {
    const handler = () => {
      if (!selectedTile) return
      commitAndSaveSelectedTile()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [commitAndSaveSelectedTile, selectedTile?.id])

  if (!project) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Catalogue Builder</h2>
          <p className="text-sm text-muted-foreground">
            Create a catalogue project to get started.
          </p>
        </div>
        {projectBar}
        <Card>
          <CardHeader>
            <CardTitle>New project</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateProject}>
              <div className="space-y-2">
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="Summer catalogue 2026"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-region">Region</Label>
                <select
                  id="project-region"
                  value={newProjectRegion}
                  onChange={(event) => setNewProjectRegion(event.target.value as Region)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="AU">AU</option>
                  <option value="NZ">NZ</option>
                </select>
              </div>
              <Button type="submit" disabled={!newProjectName.trim()}>
                Create project
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDatasetImportOpen(true)}
              >
                Import Project Data
              </Button>
            </form>
          </CardContent>
        </Card>
        <Dialog open={datasetImportOpen} onOpenChange={setDatasetImportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Project Data</DialogTitle>
              <DialogDescription>
                Imports into local storage on this machine.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label htmlFor="project-import-file">Project export (.zip)</Label>
              <Input
                id="project-import-file"
                ref={datasetImportRef}
                type="file"
                accept=".zip"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDatasetImportOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleImportProjectData}
                disabled={datasetImporting}
              >
                {datasetImporting ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  const canContinueToDetection = project.pdfAssetIds.length > 0

  return (
    <div className="space-y-4">
      <CatalogueHeader
        projectName="Catalogue Builder"
        onBackToProjects={() => undefined}
        onOpenTileDetection={() => undefined}
        rightSlot={projectBar}
      />
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {project.stage === "setup" ? (
            <Button
              type="button"
              onClick={() => setProjectStage("pdf-detect")}
              disabled={!canContinueToDetection}
            >
              Continue to PDF Detection
            </Button>
          ) : null}
          {project.stage === "pdf-detect" ? (
            <Button type="button" onClick={() => setProjectStage("catalogue")}>
              Finish detection
            </Button>
          ) : null}
          {project.stage === "catalogue" ? (
            <Button type="button" variant="outline" onClick={() => setProjectStage("pdf-detect")}>
              Back to detection
            </Button>
          ) : null}
        </div>
        {project.stage === "catalogue" && project.tiles.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={extractPlusFromPdf}
              disabled={pdfExtractRunning}
            >
              Extract PLUs from PDF
            </Button>
            <Button type="button" variant="outline" onClick={confirmReplaceAll}>
              Replace All Images
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => addImagesInputRef.current?.click()}
            >
              Add Images
            </Button>
            <Button type="button" variant="outline" onClick={confirmClearAll}>
              Clear All Tiles
            </Button>
            <DatasetDropdownMenu
              datasetLoaded={Boolean(project.dataset)}
              datasetName={project.dataset?.filename}
              onUpload={() => setDatasetUploadOpen(true)}
              onViewDetails={() => setDatasetDetailsOpen(true)}
              onClear={() => setDatasetClearOpen(true)}
            />
          </div>
        ) : null}
      </div>
      {project.stage === "setup" ? (
        <Card>
          <CardHeader>
            <CardTitle>Project setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{project.name}</span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                {project.region}
              </span>
            </div>
            <div className="space-y-2">
              <Label>Upload PDFs</Label>
              <Input
                type="file"
                multiple
                accept="application/pdf"
                onChange={handleSetupPdfUpload}
              />
              <p className="text-xs text-muted-foreground">
                {project.pdfAssetIds.length} PDF{project.pdfAssetIds.length === 1 ? "" : "s"} uploaded
              </p>
            </div>
            <div className="space-y-2">
              <Label>Upload tile images</Label>
              <Input
                type="file"
                multiple
                accept="image/*"
                onChange={handleSetupImageUpload}
              />
              <p className="text-xs text-muted-foreground">
                {new Set(project.imageAssetIds).size} image{new Set(project.imageAssetIds).size === 1 ? "" : "s"} uploaded
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {project.stage === "pdf-detect" ? (
        <PdfTileDetectionPage
          key={project.id}
          project={project}
          onProjectChange={upsertProject}
        />
      ) : null}
      {project.stage === "catalogue" ? (
        <Card>
          <CardHeader className="pt-5 pb-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{project.name} - Tiles: <span className="font-medium text-foreground">{project.tiles.length}</span></CardTitle>
            </div>
          </CardHeader>
        <CardContent>
          {SHOW_DETECTION_EXPORT ? (
            <Card className="mt-4">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Detection Export Summary</CardTitle>
                  <Button type="button" size="sm" variant="outline" onClick={downloadDetectionExport}>
                    Download export JSON
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-muted-foreground">
                  Project: <span className="text-foreground">{project.name}</span> ({project.id})
                </div>
                <div className="text-muted-foreground">
                  PDFs: <span className="text-foreground">{project.pdfAssetIds.length}</span>
                </div>
                {detectionSummary.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No export data available.</div>
                ) : (
                  <div className="space-y-2">
                    {detectionSummary.map((row, index) => {
                      const hasWarning = !row.exportPresent || row.orderedCount === 0
                      return (
                        <div key={row.assetId} className="rounded-md border border-border p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium">
                              {index + 1}. {row.name}
                            </div>
                            {hasWarning ? (
                              <Badge variant="destructive">Check export</Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Export: {row.exportPresent ? "yes" : "no"} | Total: {row.totalCount} | Included:{" "}
                            {row.includedCount} | Ordered: {row.orderedCount} | Page size:{" "}
                            {row.hasSize ? "yes" : "no"} | Spread: {row.spreadNumber ?? "?"}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
          <Separator className="my-4" />
          {project.tiles.length === 0 ? (
            <div
              className="rounded-lg border border-dashed border-border p-6 text-center"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <div className="space-y-2">
                <div className="text-sm font-medium">Upload Tile Images</div>
                <p className="text-xs text-muted-foreground">
                  Drag and drop your images here, or choose files to create tiles in order.
                </p>
              </div>
              <div className="mt-4 flex flex-col items-center gap-3">
                <Button type="button" onClick={() => uploadInputRef.current?.click()}>
                  Upload Tile Images
                </Button>
                <Input
                  ref={uploadInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleUploadChange}
                  className="max-w-xs"
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
              <TileListPanel
                missingTilesCount={missingTilesCount}
                showMissingOnly={showMissingOnly}
                onToggleShowMissingOnly={() => setShowMissingOnly((prev) => !prev)}
              >
                <TileListView
                  tiles={displayTiles}
                  selectedTileId={selectedTileId}
                  tileThumbUrls={tileThumbUrls}
                  onSelectTile={selectTile}
                  isDev={isDev}
                />
              </TileListPanel>
              <div>
                {selectedTile ? (
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle>{selectedTile.id}</CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" onClick={commitAndSaveSelectedTile}>
                            Save (Ctrl+S)
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              commitAndSaveSelectedTile()
                              selectTileByOffset(1)
                            }}
                          >
                            Save & Next
                          </Button>
                          <Button type="button" variant="outline" onClick={() => selectTileByOffset(-1)}>
                            Previous
                          </Button>
                          <Button type="button" variant="outline" onClick={() => selectTileByOffset(1)}>
                            Next
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedColorUrl ? (
                        <div className="space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <div className="text-xs font-medium uppercase text-muted-foreground">
                                Image
                              </div>
                              <div className="w-full overflow-hidden rounded-md border border-border bg-muted/50 p-3">
                                <img
                                  src={selectedColorUrl}
                                  alt={selectedTile.originalFileName}
                                  className="max-h-[360px] w-full h-auto rounded-md object-contain"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => replaceSingleInputRef.current?.click()}
                                >
                                  Replace Image
                                </Button>
                                <Input
                                  ref={replaceSingleInputRef}
                                  type="file"
                                  accept="image/*"
                                  onChange={handleReplaceSingleImage}
                                  className="hidden"
                                />
                              </div>
                            </div>
                            <TileDetailsCard
                              title={draftTitle}
                              onChangeTitle={(value) => {
                                setDraftTitle(value)
                                setDraftTitleEditedManually(true)
                              }}
                              brandLabel={selectedTile.offer?.brand?.label ?? null}
                              percentOffRaw={selectedTile.offer?.percentOff?.raw ?? null}
                              detectedBrands={detectedBrands}
                              status={draftStatus}
                              onChangeStatus={setDraftStatus}
                              finalDynamicLink={activeOutput}
                              notes={draftNotes}
                              onChangeNotes={setDraftNotes}
                              imageUpdatedSinceExtraction={selectedTile.imageUpdatedSinceExtraction}
                              onReExtractOffer={reExtractOfferForSelected}
                            />
                          </div>
                          <div className="space-y-2">
                            {awaitingManualLink ? (
                              <div className="text-xs text-muted-foreground">
                                Click back into the app to paste into Live Link.
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No image for this tile.</p>
                      )}
                      <TileBuilderPanel
                        selectedTile={selectedTile}
                        awaitingManualLink={awaitingManualLink}
                        linkBuilderRef={linkBuilderRef}
                        draftLinkState={draftLinkState}
                        setDraftLinkState={setDraftLinkState}
                        setDraftLinkOutput={setDraftLinkOutput}
                        projectRegion={project?.region ?? "AU"}
                        datasetMeta={datasetMeta}
                        onOpenDatasetPanel={() => setDatasetUploadOpen(true)}
                        draftFacetBrands={builderFacetBrands}
                        draftFacetArticleTypes={builderFacetArticleTypes}
                        setDraftFacetBrands={setBuilderFacetBrands}
                        setDraftFacetArticleTypes={setBuilderFacetArticleTypes}
                        draftFacetExcludedPluIds={draftFacetExcludedPluIds}
                        setDraftFacetExcludedPluIds={setDraftFacetExcludedPluIds}
                        draftFacetExcludePercentEnabled={draftFacetExcludePercentEnabled}
                        setDraftFacetExcludePercentEnabled={setDraftFacetExcludePercentEnabled}
                        detectedBrands={detectedBrands}
                        detectedOfferPercent={selectedTile.offer?.percentOff?.value}
                        draftLiveCapturedUrl={draftLiveCapturedUrl}
                        setDraftLiveCapturedUrl={setDraftLiveCapturedUrl}
                        liveLinkEditable
                        liveLinkInputRef={liveLinkInputRef}
                        previewUrl={previewUrl}
                        onPreviewUrlChange={onPreviewUrlChange}
                        draftActiveLinkMode={draftActiveLinkMode}
                        setDraftActiveLinkMode={(mode) => {
                          setDraftActiveLinkMode(mode)
                          setDraftUserHasChosenMode(true)
                        }}
                        isPluAvailable={isPluAvailable}
                        isFacetAvailable={isFacetAvailable}
                        isLiveAvailable={isLiveAvailable}
                        activeOutput={activeOutput}
                        onOpenPreview={handleOpenPreview}
                        onLinkViaPreview={handleLinkViaPreview}
                        previewExtraControls={
                          draftLiveCapturedUrl ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDraftLiveCapturedUrl("")
                                setDraftLinkSource("manual")
                                setDraftUserHasChosenMode(false)
                              }}
                            >
                              Clear captured link
                            </Button>
                          ) : null
                        }
                        manualBaseActions={
                          draftActiveLinkMode === "plu" ? (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-10 w-10"
                                    aria-label="Clear PLUs"
                                    onClick={() => {
                                      if (!draftLinkState.plus.some((value) => value.trim())) return
                                      const nextState: LinkBuilderState = {
                                        ...draftLinkState,
                                        plus: draftLinkState.plus.map(() => ""),
                                      }
                                      setDraftLinkState(nextState)
                                      setDraftExtractedFlags(createEmptyExtractedFlags())
                                      setDraftLinkOutput(
                                        buildDynamicOutputFromState(nextState, "")
                                      )
                                    }}
                                  >
                                    <Eraser className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Clear PLUs</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null
                        }
                        extractedPluFlags={draftExtractedFlags}
                        setDraftExtractedFlags={setDraftExtractedFlags}
                        captureDialogOpen={captureDialogOpen}
                        setCaptureDialogOpen={setCaptureDialogOpen}
                        onCaptureOnly={() => {
                          setCaptureDialogOpen(false)
                          setPendingCapturedUrl(null)
                          setDraftActiveLinkMode("live")
                          setDraftUserHasChosenMode(true)
                        }}
                        onConvertCaptured={() => {
                          if (!pendingCapturedUrl) {
                            setCaptureDialogOpen(false)
                            setPendingCapturedUrl(null)
                            return
                          }
                          const { nextState, didConvert, warnings } =
                            convertCapturedUrlToBuilderState(pendingCapturedUrl, draftLinkState)
                          if (didConvert) {
                            setDraftLinkState(nextState)
                            setDraftLinkOutput(
                              buildDynamicOutputFromState(
                                draftActiveLinkMode === "facet"
                                  ? { ...nextState, plus: [] }
                                  : nextState,
                                draftActiveLinkMode === "facet" ? facetQuery : ""
                              )
                            )
                            setDraftLinkSource("manual")
                            const nextPluCount = nextState.plus.filter((plu) => plu.trim().length > 0).length
                            const nextFacetQuery = buildFacetQueryFromSelections(
                              builderFacetBrands,
                              builderFacetArticleTypes
                            )
                            if (nextPluCount > 0) {
                              setDraftActiveLinkMode("plu")
                            } else if (nextFacetQuery) {
                              setDraftActiveLinkMode("facet")
                            } else {
                              setDraftActiveLinkMode("plu")
                            }
                            setDraftUserHasChosenMode(true)
                          } else {
                            toast.warning(warnings[0] ?? "Unable to convert this URL yet.")
                          }
                          setCaptureDialogOpen(false)
                          setPendingCapturedUrl(null)
                        }}
                        offerDebugOpen={offerDebugOpen}
                        setOfferDebugOpen={setOfferDebugOpen}
                        offerTextDebugOpen={offerTextDebugOpen}
                        setOfferTextDebugOpen={setOfferTextDebugOpen}
                        onReExtractOffer={reExtractOfferForSelected}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a tile to edit its details.
                  </p>
                )}
              </div>
            </div>
          )}
          <Input
            ref={replaceInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleReplaceChange}
            className="hidden"
          />
          <Input
            ref={addImagesInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleAddImagesChange}
            className="hidden"
          />
        </CardContent>
      </Card>
      ) : null}
      <Dialog open={datasetUploadOpen} onOpenChange={setDatasetUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Dataset</DialogTitle>
            <DialogDescription>
              Upload a CSV dataset for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              ref={datasetInputRef}
              type="file"
              accept=".csv"
              onChange={(event) => {
                void handleDatasetUpload(event)
                setDatasetUploadOpen(false)
              }}
            />
            {project?.dataset ? (
              <div className="text-xs text-muted-foreground">
                Current dataset: {project.dataset.filename} ({project.dataset.rowCount} rows)
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={datasetDetailsOpen} onOpenChange={setDatasetDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dataset Details</DialogTitle>
          </DialogHeader>
          {project?.dataset ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Filename: </span>
                {project.dataset.filename}
              </div>
              <div>
                <span className="text-muted-foreground">Rows: </span>
                {project.dataset.rowCount}
              </div>
              <div>
                <span className="text-muted-foreground">Uploaded: </span>
                {new Date(project.dataset.loadedAt).toLocaleString()}
              </div>
              <Button type="button" variant="outline" onClick={handleDownloadDataset}>
                Download dataset
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No dataset uploaded.</p>
          )}
        </DialogContent>
      </Dialog>

      <DevPanel
        isDev={isDev}
        facetColumnList={facetColumnList}
        devDebugOpen={devDebugOpen}
        onDevDebugOpenChange={setDevDebugOpen}
        onClearLegacyExtensionData={clearLegacyExtensionData}
        onExportProjectData={handleExportProjectData}
        onOpenImportDialog={() => setDatasetImportOpen(true)}
        mappingDebug={mappingDebug}
        replaceLog={lastReplaceLog}
      />

      <Dialog open={datasetImportOpen} onOpenChange={setDatasetImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Project Data</DialogTitle>
            <DialogDescription>
              Imports into local storage on this machine.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="project-import-file">Project export (.zip)</Label>
            <Input
              id="project-import-file"
              ref={datasetImportRef}
              type="file"
              accept=".zip"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDatasetImportOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImportProjectData}
              disabled={datasetImporting}
            >
              {datasetImporting ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={datasetClearOpen} onOpenChange={setDatasetClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear dataset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the dataset from this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleClearDataset()
                setDatasetClearOpen(false)
              }}
            >
              Clear Dataset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}





