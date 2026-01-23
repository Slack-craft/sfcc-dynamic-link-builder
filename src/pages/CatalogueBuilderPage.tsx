import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { FileText, Info, Trash2, Upload, Eraser } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import DynamicLinkBuilder, { type DynamicLinkBuilderHandle } from "@/tools/link-builder/DynamicLinkBuilder"
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
  getAsset,
  listAssets,
  putAsset,
  putAssetRecord,
  putProjectDataset,
  getProjectDataset,
  deleteProjectDataset,
} from "@/lib/assetStore"
import PdfTileDetectionPage from "@/pages/PdfTileDetectionPage"
import { extractTextFromRect, loadPdfDocument, type PdfRect } from "@/tools/catalogue-builder/pdfTextExtract"
import { parseOfferText } from "@/lib/extraction/parseOfferText"
import { extractPlusFromPdfText } from "@/lib/extraction/pluUtils"
import { clearObjectUrlCache, getObjectUrl } from "@/lib/images/objectUrlCache"
import { extensionRequest } from "@/lib/preview/extensionRequest"
import { hasExtensionPing } from "@/lib/preview/hasExtension"
import { parseCsvText, type CsvRow } from "@/lib/catalogueDataset/parseCsv"
import { detectFacetColumns } from "@/lib/catalogueDataset/columns"
import { exportProjectToZip, importProjectFromZip } from "@/lib/devProjectTransfer"
 
import type {
  CatalogueProject,
  ProjectStage,
  Region,
  Tile,
  TileStatus,
} from "@/tools/catalogue-builder/catalogueTypes"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"

const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024
const PDF_DETECTION_STORAGE_KEY = "sca_pdf_tile_project_v1"
const MAX_PLUS_FIELDS = 20
const MAX_EXTRACTED_PLUS = 20
const isDev = (import.meta as any).env?.DEV

type TileCardProps = {
  tile: Tile
  isSelected: boolean
  thumbUrl?: string
  onSelect: (tileId: string) => void
}

const TileCard = memo(function TileCard({
  tile,
  isSelected,
  thumbUrl,
  onSelect,
}: TileCardProps) {
  const renders = useRef(0)
  renders.current += 1
  if (isDev && renders.current % 20 === 0) {
    console.log("[TileCard] renders", renders.current, tile.id)
  }
  const mappingInfo = formatMappingInfo(tile.originalFileName ?? tile.id)
  return (
    <button
      type="button"
      onClick={() => onSelect(tile.id)}
      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
        isSelected
          ? "border-primary bg-muted"
          : "border-border hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt=""
              className="h-10 w-10 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-md border border-dashed border-border" />
          )}
          <span className="font-medium">{tile.id}</span>
        </div>
        <div className="flex items-center gap-2">
          {tile.pdfMappingStatus === "missing" ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="text-[10px] uppercase">
                    Missing
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {tile.pdfMappingReason ?? "Missing PDF mapping"} ({mappingInfo})
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {tile.mappedSpreadNumber ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground">
                    <Info className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {`Spread ${tile.mappedSpreadNumber} - ${tile.mappedPdfFilename ?? "PDF"} - ${tile.mappedHalf ?? "?"} - box ${tile.mappedBoxIndex ?? "?"}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <span className="text-xs uppercase text-muted-foreground">
            {tile.status}
          </span>
        </div>
      </div>
      {tile.title ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {tile.title.length > 80 ? `${tile.title.slice(0, 80)}...` : tile.title}
        </div>
      ) : null}
    </button>
  )
})

type TileListProps = {
  tiles: Tile[]
  selectedTileId: string | null
  tileThumbUrls: Record<string, string>
  onSelect: (tileId: string) => void
}

const TileList = memo(function TileList({
  tiles,
  selectedTileId,
  tileThumbUrls,
  onSelect,
}: TileListProps) {
  const renders = useRef(0)
  renders.current += 1
  if (isDev && renders.current % 20 === 0) {
    console.log("[TileList] renders", renders.current)
  }
  return (
    <div className="space-y-2">
      {tiles.map((tile) => (
        <TileCard
          key={tile.id}
          tile={tile}
          isSelected={tile.id === selectedTileId}
          thumbUrl={tileThumbUrls[tile.id]}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
})

type PdfDoc = Awaited<ReturnType<typeof loadPdfDocument>>
type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>

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

type DatasetCache = {
  headers: string[]
  rowsRef: React.MutableRefObject<CsvRow[]>
  rowCount: number
  columnMeta: ReturnType<typeof detectFacetColumns>
  version: number
}

function sanitizeTileId(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return "tile"
  const sanitized = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
  return sanitized || "tile"
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, "")
}

function parseTileMapping(fileName: string) {
  const pageMatch = fileName.match(/-p(\d{1,2})-/i)
  const boxMatch = fileName.match(/-box(\d{2})-/i)
  if (!pageMatch || !boxMatch) return null
  const imgPage = Number(pageMatch[1])
  const boxOrder = Number(boxMatch[1])
  if (!Number.isFinite(imgPage) || !Number.isFinite(boxOrder)) return null
  const half: "left" | "right" = imgPage % 2 === 1 ? "left" : "right"
  const spreadIndex = Math.ceil(imgPage / 2)
  return {
    imgPage,
    half,
    spreadIndex,
    boxOrder,
  }
}

function formatMappingInfo(fileName: string) {
  const mapping = parseTileMapping(fileName)
  if (!mapping) return "p?? box??"
  const pageLabel = String(mapping.imgPage).padStart(2, "0")
  const boxLabel = String(mapping.boxOrder).padStart(2, "0")
  return `p${pageLabel} box${boxLabel}`
}

function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function buildIdFilter(pluValues: string[]) {
  const joined = pluValues.join("%7c")
  return `?prefn1=id&prefv1=${joined}`
}

function buildFacetQueryFromSelections(
  selectedBrands: string[],
  selectedArticleTypes: string[]
) {
  const selected: Record<string, string[]> = {}
  if (selectedBrands.length > 0) {
    selected.brand = selectedBrands
  }
  if (selectedArticleTypes.length > 0) {
    selected.adArticleType = selectedArticleTypes
  }
  const entries = Object.entries(selected).filter(([, values]) => values.length > 0)
  if (entries.length === 0) return ""
  const params = entries.map(([facetKey, values], index) => {
    const prefIndex = index + 1
    const outputKey = facetKey === "brand" ? "srgBrand" : facetKey
    const encodedValues = encodeURIComponent(values.join("|"))
    return `prefn${prefIndex}=${encodeURIComponent(outputKey)}&prefv${prefIndex}=${encodedValues}`
  })
  return `?${params.join("&")}&sz=36`
}

function buildPlusArray(values: string[]) {
  return Array.from({ length: Math.max(MAX_PLUS_FIELDS, values.length) }, (_, index) => {
    return values[index] ?? ""
  })
}

function isBrandPath(pathname: string) {
  return /^\/brands\/[^/]+$/i.test(pathname)
}

function getBrandStub(pathname: string) {
  const match = pathname.match(/^\/brands\/([^/]+)/i)
  return match?.[1] ?? ""
}

function buildDynamicOutputFromState(state: LinkBuilderState, derivedQuery = "") {
  const cleanedPLUs = state.plus.map((p) => p.trim()).filter((p) => p.length > 0)

  if (cleanedPLUs.length === 1 && !derivedQuery) {
    return `$Url('Product-Show','pid','${cleanedPLUs[0]}')$`
  }

  const baseValue = state.category?.value ?? state.brand?.value ?? ""
  if (!baseValue) {
    if (cleanedPLUs.length > 1 || derivedQuery) {
      return "Select a Category or Brand to generate the base link."
    }
    return "Select a Category or Brand, or enter one PLU to generate a Product link."
  }

  let built = `$Url('Search-Show','cgid','${baseValue}')$`
  if (derivedQuery) {
    built += derivedQuery
    return built
  }
  if (cleanedPLUs.length > 1) {
    built += buildIdFilter(cleanedPLUs)
    return built
  }
  return built
}

function buildPreviewUrlFromState(
  state: LinkBuilderState,
  scope?: Region,
  derivedQuery = "",
  ignorePlu = false
) {
  const domain =
    scope === "NZ"
      ? "https://staging.supercheapauto.co.nz"
      : "https://staging.supercheapauto.com.au"

  const cleanedPLUs = state.plus.map((p) => p.trim()).filter((p) => p.length > 0)
  const isSinglePlu = !ignorePlu && cleanedPLUs.length === 1
  const isMultiPlu = !ignorePlu && cleanedPLUs.length > 1

  if (isSinglePlu) {
    return `${domain}/p/sca-product/${cleanedPLUs[0]}.html`
  }

  if (isMultiPlu) {
    return `${domain}/${buildIdFilter(cleanedPLUs)}`
  }

  const previewPathOverride = state.previewPathOverride ?? ""
  let derivedPath = previewPathOverride
  if (!derivedPath && state.brand) {
    derivedPath = `/brands/${slugifyLabel(state.brand.label)}`
  }
  if (!derivedPath && state.category?.value === "catalogue-onsale") {
    derivedPath = "/catalogue-out-now"
  }

  if (derivedPath) {
    return `${domain}${derivedPath}${derivedQuery}`
  }

  if (derivedQuery) {
    return `${domain}${derivedQuery}`
  }

  return domain
}

function getExportSpreadOrder(entries: PdfExportEntry[]) {
  const withParsed = entries.map((entry, index) => {
    const match = entry.filename?.match(/P(\d{1,2})/i)
    const order = match ? Number(match[1]) : Number.NaN
    return { entry, index, order }
  })
  if (withParsed.some((item) => Number.isFinite(item.order))) {
    return withParsed
      .sort((a, b) => {
        const aValid = Number.isFinite(a.order)
        const bValid = Number.isFinite(b.order)
        if (aValid && bValid) return (a.order as number) - (b.order as number)
        if (aValid) return -1
        if (bValid) return 1
        return a.index - b.index
      })
      .map((item) => item.entry)
  }
  return entries
}

function getFirstPageExport(entry: PdfExportEntry) {
  if (Array.isArray(entry.pages)) {
    return entry.pages[0]
  }
  const keys = Object.keys(entry.pages)
  const firstKey = keys[0]
  return firstKey ? entry.pages[firstKey] : undefined
}

function findRectById(entries: PdfExportEntry[], rectId: string) {
  for (const entry of entries) {
    const pages = Array.isArray(entry.pages) ? entry.pages : Object.values(entry.pages)
    for (const page of pages) {
      const box = page.boxes.find((item) => item.rectId === rectId)
      if (box) {
        return { entry, page, box }
      }
    }
  }
  return null
}

function createEmptyLinkBuilderState(): LinkBuilderState {
  return {
    category: { label: "Catalog", value: "catalogue-onsale" },
    brand: null,
    plus: Array.from({ length: MAX_PLUS_FIELDS }, () => ""),
    previewPathOverride: "",
    captureMode: "path+filters",
  }
}

function stripLegacyExtensionFromTile(tile: Tile): Tile {
  const state = tile.linkBuilderState
  if (!state || typeof state !== "object") return tile
  if (!("extension" in state)) return tile
  const { extension: _legacyExtension, ...rest } = state as LinkBuilderState & {
    extension?: string
  }
  return { ...tile, linkBuilderState: rest }
}

function createEmptyExtractedFlags() {
  return Array.from({ length: MAX_PLUS_FIELDS }, () => false)
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
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftTitleEditedManually, setDraftTitleEditedManually] = useState(false)
  const [draftStatus, setDraftStatus] = useState<TileStatus>("todo")
  const [draftNotes, setDraftNotes] = useState("")
  const [draftLinkState, setDraftLinkState] = useState<LinkBuilderState>(() =>
    createEmptyLinkBuilderState()
  )
  const [draftLinkOutput, setDraftLinkOutput] = useState("")
  const [draftExtractedFlags, setDraftExtractedFlags] = useState<boolean[]>(() =>
    createEmptyExtractedFlags()
  )
  const [draftFacetBrands, setDraftFacetBrands] = useState<string[]>([])
  const [draftFacetArticleTypes, setDraftFacetArticleTypes] = useState<string[]>([])
  const [draftFacetExcludedPluIds, setDraftFacetExcludedPluIds] = useState<string[]>([])
  const [draftFacetExcludePercentEnabled, setDraftFacetExcludePercentEnabled] = useState(false)
  const [tileThumbUrls, setTileThumbUrls] = useState<Record<string, string>>({})
  const [selectedColorUrl, setSelectedColorUrl] = useState<string | null>(null)
  const [pdfExtractRunning, setPdfExtractRunning] = useState(false)
  const [showMissingOnly, setShowMissingOnly] = useState(false)
  const [pdfAssetNames, setPdfAssetNames] = useState<Record<string, string>>({})
  const [offerDebugOpen, setOfferDebugOpen] = useState(false)
  const [offerTextDebugOpen, setOfferTextDebugOpen] = useState(false)
  const [draftLiveCapturedUrl, setDraftLiveCapturedUrl] = useState("")
  const [draftLinkSource, setDraftLinkSource] = useState<"manual" | "live">("manual")
  const [draftActiveLinkMode, setDraftActiveLinkMode] = useState<"plu" | "facet" | "live">(
    "plu"
  )
  const [draftUserHasChosenMode, setDraftUserHasChosenMode] = useState(false)
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false)
  const [pendingCapturedUrl, setPendingCapturedUrl] = useState<string | null>(null)
  const [datasetMeta, setDatasetMeta] = useState<DatasetCache | null>(null)
  const datasetRowsRef = useRef<CsvRow[]>([])
  const [datasetUploadOpen, setDatasetUploadOpen] = useState(false)
  const [datasetDetailsOpen, setDatasetDetailsOpen] = useState(false)
  const [datasetClearOpen, setDatasetClearOpen] = useState(false)
  const [datasetImportOpen, setDatasetImportOpen] = useState(false)
  const [datasetImporting, setDatasetImporting] = useState(false)
  const [awaitingManualLink, setAwaitingManualLink] = useState(false)
  const [extensionStatus, setExtensionStatus] = useState<
    "unknown" | "available" | "unavailable"
  >("unknown")
  const linkBuilderRef = useRef<DynamicLinkBuilderHandle | null>(null)
  const liveLinkInputRef = useRef<HTMLInputElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const datasetInputRef = useRef<HTMLInputElement | null>(null)
  const datasetImportRef = useRef<HTMLInputElement | null>(null)
  const isUploadingImagesRef = useRef(false)
  const lastUploadSignatureRef = useRef<string | null>(null)

  const project = useMemo(() => {
    return (
      projectsState.projects.find(
        (item) => item.id === projectsState.activeProjectId
      ) ?? null
    )
  }, [projectsState])

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

  useEffect(() => {
    let cancelled = false

    async function hydrateDataset() {
      if (!project || !project.dataset) {
        datasetRowsRef.current = []
        setDatasetMeta(null)
        return
      }

      const datasetKey = getDatasetKey(project.id, project.dataset.id)
      const record = await getProjectDataset(datasetKey)
      if (cancelled) return
      if (!record?.csvText) {
        datasetRowsRef.current = []
        setDatasetMeta(null)
        return
      }

      const parsed = parseCsvText(record.csvText)
      datasetRowsRef.current = parsed.rows
      setDatasetMeta({
        headers: parsed.headers,
        rowsRef: datasetRowsRef,
        rowCount: parsed.rows.length,
        columnMeta: detectFacetColumns(parsed.headers),
        version: Date.now(),
      })
    }

    void hydrateDataset()
    return () => {
      cancelled = true
    }
  }, [project?.id, project?.dataset?.id])

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
        {projectsState.projects.map((item) => (
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
      projects: prev.projects.map((item) =>
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
      const projects = prev.projects.filter((item) => item.id !== projectId)
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
      const boxes = Array.isArray(pages)
        ? pages.flatMap((page) => page.boxes ?? [])
        : Object.values(pages).flatMap((page) => page.boxes ?? [])
      const included = boxes.filter((box) => box.include ?? true)
      const ordered = included.filter((box) => Number.isFinite(box.orderIndex))
      const hasSize = Array.isArray(pages)
        ? pages.some(
            (page) => Number.isFinite(page.pageWidth) && Number.isFinite(page.pageHeight)
          )
        : Object.values(pages).some(
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
  const selectedTile = useMemo(
    () => tiles.find((tile) => tile.id === selectedTileId) ?? null,
    [tiles, selectedTileId]
  )
  const detectedBrands = useMemo(() => {
    if (selectedTile?.offer?.detectedBrands?.length) {
      return selectedTile.offer.detectedBrands
    }
    if (selectedTile?.offer?.brand?.label) {
      return [selectedTile.offer.brand.label]
    }
    return []
  }, [selectedTile?.offer?.brand?.label, selectedTile?.offer?.detectedBrands])
  const facetQuery = useMemo(
    () => buildFacetQueryFromSelections(draftFacetBrands, draftFacetArticleTypes),
    [draftFacetBrands, draftFacetArticleTypes]
  )
  const pluCount = useMemo(
    () => draftLinkState.plus.filter((plu) => plu.trim().length > 0).length,
    [draftLinkState.plus]
  )
  const isPluAvailable = pluCount > 0
  const isFacetAvailable = facetQuery.length > 0
  const isLiveAvailable = draftLiveCapturedUrl.trim().length > 0

  const candidatePluUrl = useMemo(
    () => buildPreviewUrlFromState(draftLinkState, project?.region, ""),
    [draftLinkState, project?.region]
  )
  const candidateFacetUrl = useMemo(
    () => buildPreviewUrlFromState(draftLinkState, project?.region, facetQuery, true),
    [draftLinkState, facetQuery, project?.region]
  )
  const candidateLiveUrl = useMemo(
    () => draftLiveCapturedUrl.trim(),
    [draftLiveCapturedUrl]
  )

  useEffect(() => {
    const availableModes: Array<"plu" | "facet" | "live"> = []
    if (isPluAvailable) availableModes.push("plu")
    if (isFacetAvailable) availableModes.push("facet")
    if (isLiveAvailable) availableModes.push("live")

    if (draftUserHasChosenMode) {
      if (!availableModes.includes(draftActiveLinkMode)) {
        const nextMode = availableModes[0] ?? "plu"
        setDraftActiveLinkMode(nextMode)
      }
      return
    }

    if (availableModes.includes("plu")) {
      setDraftActiveLinkMode("plu")
    } else if (availableModes.includes("facet")) {
      setDraftActiveLinkMode("facet")
    } else if (availableModes.includes("live")) {
      setDraftActiveLinkMode("live")
    }
  }, [
    draftActiveLinkMode,
    draftUserHasChosenMode,
    isFacetAvailable,
    isLiveAvailable,
    isPluAvailable,
  ])

  const previewUrl = useMemo(() => {
    if (draftActiveLinkMode === "live" && candidateLiveUrl) return candidateLiveUrl
    if (draftActiveLinkMode === "facet") return candidateFacetUrl
    return candidatePluUrl
  }, [candidateFacetUrl, candidateLiveUrl, candidatePluUrl, draftActiveLinkMode])

  function computeOutputForMode(
    state: LinkBuilderState,
    mode: "plu" | "facet" | "live",
    query: string
  ) {
    if (mode === "live") return "Live mode does not convert yet."
    if (mode === "facet") {
      return buildDynamicOutputFromState({ ...state, plus: [] }, query)
    }
    return buildDynamicOutputFromState(state, "")
  }

  const activeOutput = useMemo(
    () => computeOutputForMode(draftLinkState, draftActiveLinkMode, facetQuery),
    [draftActiveLinkMode, draftLinkState, facetQuery]
  )

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
    if (!project) {
      setSelectedTileId(null)
      return
    }
    if (!selectedTileId && project.tiles.length > 0) {
      setSelectedTileId(project.tiles[0].id)
      return
    }
    if (selectedTileId && !selectedTile) {
      setSelectedTileId(project.tiles[0]?.id ?? null)
    }
  }, [project, selectedTileId, selectedTile])

  useEffect(() => {
    if (!selectedTile) {
      setDraftTitle("")
      setDraftTitleEditedManually(false)
      setDraftStatus("todo")
      setDraftNotes("")
      setDraftLinkState(createEmptyLinkBuilderState())
      setDraftLinkOutput("")
      setDraftExtractedFlags(createEmptyExtractedFlags())
    setDraftFacetBrands([])
    setDraftFacetArticleTypes([])
    setDraftFacetExcludedPluIds([])
    setDraftFacetExcludePercentEnabled(false)
    setDraftLiveCapturedUrl("")
    setDraftLinkSource("manual")
    setDraftActiveLinkMode("plu")
    setDraftUserHasChosenMode(false)
    return
    }
    setDraftTitle(selectedTile.title ?? "")
    setDraftTitleEditedManually(selectedTile.titleEditedManually ?? false)
    setDraftStatus(selectedTile.status)
    setDraftNotes(selectedTile.notes ?? "")
    setDraftLinkState(selectedTile.linkBuilderState ?? createEmptyLinkBuilderState())
    setDraftLinkOutput(selectedTile.dynamicLink ?? "")
    setDraftExtractedFlags(selectedTile.extractedPluFlags ?? createEmptyExtractedFlags())
    setDraftLiveCapturedUrl(selectedTile.liveCapturedUrl ?? "")
    setDraftLinkSource(selectedTile.linkSource ?? "manual")
    setDraftActiveLinkMode(selectedTile.activeLinkMode ?? "plu")
    setDraftUserHasChosenMode(selectedTile.userHasChosenMode ?? false)
    setDraftFacetBrands(selectedTile.facetBuilder?.selectedBrands ?? [])
    setDraftFacetArticleTypes(selectedTile.facetBuilder?.selectedArticleTypes ?? [])
    setDraftFacetExcludedPluIds(selectedTile.facetBuilder?.excludedPluIds ?? [])
    setDraftFacetExcludePercentEnabled(
      selectedTile.facetBuilder?.excludePercentMismatchesEnabled ?? false
    )
  }, [selectedTile])

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

  function buildUploadSignature(files: File[]) {
    return files
      .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      .join("|")
  }

  function getDatasetKey(projectId: string, datasetId: string) {
    return `${projectId}:catalogueDataset:${datasetId}`
  }

  async function createTilesFromFiles(fileList: FileList, replaceExisting: boolean) {
    if (!project) return
    const files = Array.from(fileList).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    )

    if (files.length === 0) return
    const uploadSignature = buildUploadSignature(files)
    if (isUploadingImagesRef.current) {
      if (lastUploadSignatureRef.current === uploadSignature) {
        return
      }
      return
    }
    isUploadingImagesRef.current = true
    lastUploadSignatureRef.current = uploadSignature

    try {
      if (replaceExisting) {
        await deleteImagesForProject(project.id)
        clearObjectUrlCache()
      }

      const totalSize = files.reduce((sum, file) => sum + file.size, 0)
      if (totalSize > MAX_TOTAL_UPLOAD_BYTES) {
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
        new Set([
          ...(replaceExisting ? [] : project.imageAssetIds ?? []),
          ...newImageIds,
        ])
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
    } finally {
      isUploadingImagesRef.current = false
      lastUploadSignatureRef.current = null
    }
  }

  async function handleSetupPdfUpload(event: React.ChangeEvent<HTMLInputElement>) {
    if (!project) return
    const files = event.target.files
    if (!files || files.length === 0) return
    const newPdfIds: string[] = []
    for (const file of Array.from(files)) {
      const pdfId = await putAsset(project.id, "pdf", file.name, file)
      newPdfIds.push(pdfId)
    }
    const nextPdfIds = Array.from(
      new Set([...(project.pdfAssetIds ?? []), ...newPdfIds])
    )
    const updated: CatalogueProject = {
      ...project,
      pdfAssetIds: nextPdfIds,
      updatedAt: new Date().toISOString(),
    }
    upsertProject(updated)
    event.target.value = ""
  }

  function handleSetupImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return
    void createTilesFromFiles(files, false)
    event.target.value = ""
  }

  async function handleDatasetUpload(event: React.ChangeEvent<HTMLInputElement>) {
    if (!project) return
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const parsed = parseCsvText(text)
    const datasetId = crypto.randomUUID()
    const datasetKey = getDatasetKey(project.id, datasetId)
    await putProjectDataset(datasetKey, project.id, file.name, text)

    datasetRowsRef.current = parsed.rows
    setDatasetMeta({
      headers: parsed.headers,
      rowsRef: datasetRowsRef,
      rowCount: parsed.rows.length,
      columnMeta: detectFacetColumns(parsed.headers),
      version: Date.now(),
    })

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

  async function handleClearDataset() {
    if (!project || !project.dataset) return
    const datasetKey = getDatasetKey(project.id, project.dataset.id)
    await deleteProjectDataset(datasetKey)
    datasetRowsRef.current = []
    setDatasetMeta(null)
    const updated: CatalogueProject = {
      ...project,
      dataset: null,
      updatedAt: new Date().toISOString(),
    }
    upsertProject(updated)
  }

  async function handleDownloadDataset() {
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

  async function handleExportProjectData() {
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
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "")
        .slice(0, 15)
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

  async function handleImportProjectData() {
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
        await putProjectDataset(
          datasetKey,
          newProjectId,
          imported.dataset.filename,
          datasetCsv
        )
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

  function handleUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return
    void createTilesFromFiles(files, false)
    event.target.value = ""
  }

  function handleReplaceChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return
    void createTilesFromFiles(files, true)
    event.target.value = ""
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const files = event.dataTransfer.files
    if (!files || files.length === 0) return
    void createTilesFromFiles(files, false)
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
  }

  function saveSelectedTile(overrides?: {
    linkBuilderState?: LinkBuilderState
    dynamicLink?: string
    liveCapturedUrl?: string
    linkSource?: "manual" | "live"
  }) {
    if (!project || !selectedTile) return
    const liveCaptured = overrides?.liveCapturedUrl ?? draftLiveCapturedUrl
    const linkSource = overrides?.linkSource ?? draftLinkSource
    const updated = updateTile(project, selectedTile.id, {
      title: draftTitle.trim() || undefined,
      titleEditedManually: draftTitleEditedManually,
      status: draftStatus,
      notes: draftNotes.trim() || undefined,
      dynamicLink: overrides?.dynamicLink?.trim() || draftLinkOutput.trim() || undefined,
      liveCapturedUrl: liveCaptured.trim() || undefined,
      linkSource,
      linkBuilderState: overrides?.linkBuilderState ?? draftLinkState,
      extractedPluFlags: draftExtractedFlags,
      activeLinkMode: draftActiveLinkMode,
      userHasChosenMode: draftUserHasChosenMode,
      facetBuilder: {
        selectedBrands: draftFacetBrands,
        selectedArticleTypes: draftFacetArticleTypes,
        excludedPluIds: draftFacetExcludedPluIds,
        excludePercentMismatchesEnabled: draftFacetExcludePercentEnabled,
      },
    })
    upsertProject(updated)
  }

  const commitAndSaveSelectedTile = useCallback(() => {
    if (!selectedTile) return
    const result = linkBuilderRef.current?.commitNow()
    if (result) {
      setDraftLinkState(result.state)
      setDraftLinkOutput(result.output)
    }
    saveSelectedTile({
      linkBuilderState: result?.state,
      dynamicLink: result?.output,
      liveCapturedUrl: draftLiveCapturedUrl,
      linkSource: draftLinkSource,
    })
  }, [
    selectedTile,
    draftTitle,
    draftTitleEditedManually,
    draftStatus,
    draftNotes,
    draftLinkOutput,
    draftLinkState,
    draftExtractedFlags,
    draftFacetBrands,
    draftFacetArticleTypes,
    draftFacetExcludedPluIds,
    draftFacetExcludePercentEnabled,
    draftLiveCapturedUrl,
    draftLinkSource,
    draftActiveLinkMode,
    draftUserHasChosenMode,
    project,
  ])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg || msg.type !== "SCA_LINK_SESSION_CLOSED") return
      if (!msg.finalUrl) return
      handleCapturedUrl(msg.finalUrl)
      setAwaitingManualLink(false)
      setExtensionStatus("available")
      toast.success("Live Link captured")
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function checkExtension() {
      const pinged = await hasExtensionPing(180)
      if (cancelled) return
      setExtensionStatus(pinged ? "available" : "unavailable")
    }
    void checkExtension()
    return () => {
      cancelled = true
    }
  }, [])

  function isTypingTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null
    if (!el) return false
    const tag = el.tagName?.toLowerCase()
    if (tag === "input" || tag === "textarea" || tag === "select") return true
    if (el.isContentEditable) return true
    const role = el.getAttribute?.("role")
    return role === "combobox" || role === "listbox" || role === "textbox"
  }

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

  function convertCapturedUrlToBuilderState(
    finalUrl: string,
    currentState: LinkBuilderState
  ) {
    let parsed: URL
    try {
      parsed = new URL(finalUrl)
    } catch {
      return { nextState: currentState, didConvert: false, warnings: ["Invalid URL"] }
    }

    const pathname = parsed.pathname ?? ""
    const params = new URLSearchParams(parsed.search)

    const productMatch = pathname.match(/\/p\/[^/]+\/(\d{4,8})\.html/i)
    if (productMatch) {
      const plu = productMatch[1]
        return {
          nextState: {
            ...currentState,
            category: null,
            brand: null,
            plus: buildPlusArray([plu]),
            previewPathOverride: "",
          },
          didConvert: true,
          warnings: [],
      }
    }

    const prefn1 = params.get("prefn1")
    const prefv1 = params.get("prefv1")
    if (prefn1?.toLowerCase() === "id" && prefv1) {
      const parsedPlus = prefv1
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean)
      if (parsedPlus.length > 0) {
        const baseState =
          currentState.category || currentState.brand
            ? currentState
            : { ...currentState, category: { label: "Catalog", value: "catalogue-onsale" } }
          return {
            nextState: {
              ...baseState,
              plus: buildPlusArray(parsedPlus),
              previewPathOverride: "",
            },
            didConvert: true,
            warnings: [],
        }
      }
    }

    if (pathname === "/catalogue-out-now") {
      return {
        nextState: {
          ...currentState,
          category: { label: "Catalog", value: "catalogue-onsale" },
          brand: null,
          plus: buildPlusArray([]),
          previewPathOverride: "/catalogue-out-now",
        },
        didConvert: true,
        warnings: [],
      }
    }

    if (isBrandPath(pathname)) {
      const stub = getBrandStub(pathname)
      const match = BRAND_OPTIONS.find(
        (option) => slugifyLabel(option.label) === stub
      )
      if (!match) {
        return {
          nextState: currentState,
          didConvert: false,
          warnings: ["Unable to map brand from captured URL."],
        }
      }
        return {
          nextState: {
            ...currentState,
            brand: match,
            category: null,
            plus: buildPlusArray([]),
            previewPathOverride: pathname,
          },
          didConvert: true,
        warnings: [],
      }
    }

    return {
      nextState: currentState,
      didConvert: false,
      warnings: ["Unable to convert this URL to a dynamic link yet."],
    }
  }

  function handleCapturedUrl(finalUrl: string) {
    setDraftLiveCapturedUrl(finalUrl)
    setDraftActiveLinkMode("live")
    setDraftUserHasChosenMode(true)
    setPendingCapturedUrl(finalUrl)
    setCaptureDialogOpen(true)
  }

  async function handleOpenPreview() {
    const url = previewUrl
    if (!url) return
    if (extensionStatus === "unavailable") {
      window.open(url, "scaPreview", "popup,width=1200,height=800")
      return
    }
    toast.info("Opening preview...")
    try {
      await extensionRequest("SCA_OPEN_PREVIEW_WINDOW", { url }, 600)
      setExtensionStatus("available")
    } catch (error) {
      setExtensionStatus("unavailable")
      window.open(url, "scaPreview", "popup,width=1200,height=800")
    }
  }

  async function handleLinkViaPreview() {
    const url = previewUrl
    if (!url) return
    setDraftActiveLinkMode("live")
    setDraftUserHasChosenMode(true)
    const startManualFallback = () => {
      window.open(url, "scaPreview", "popup,width=1200,height=800")
      setAwaitingManualLink(true)
      toast.info("Copy the URL in the preview (Ctrl+L, Ctrl+C), then click back into the app to paste into Live Link.")
    }

    if (extensionStatus === "unavailable") {
      startManualFallback()
      return
    }
    toast.info("Opening preview... Close the window to capture Live Link.")
    try {
      await extensionRequest("SCA_OPEN_LINK_VIA_PREVIEW", { url }, 600)
      setExtensionStatus("available")
    } catch (error) {
      setExtensionStatus("unavailable")
      startManualFallback()
    }
  }

  const handleSelectTile = useCallback(
    (tileId: string) => {
      if (tileId === selectedTileId) return
      if (selectedTile) {
        commitAndSaveSelectedTile()
      }
      setSelectedTileId(tileId)
    },
    [selectedTile, selectedTileId, commitAndSaveSelectedTile]
  )

  function reExtractOfferForSelected() {
    if (!project || !selectedTile) return
    if (!selectedTile.extractedText) {
      toast.error("No extracted text available for this tile.")
      return
    }
    const offer = parseOfferText(selectedTile.extractedText, datasetBrandOptions)
    const shouldSetTitle = !selectedTile.title || !selectedTile.titleEditedManually
    const nextTitle = shouldSetTitle ? offer.title ?? selectedTile.title : selectedTile.title
    const updated = updateTile(project, selectedTile.id, {
      offer,
      title: nextTitle,
      titleEditedManually: shouldSetTitle ? false : selectedTile.titleEditedManually,
      offerUpdatedAt: Date.now(),
    })
    upsertProject(updated)
    toast.success("Offer extracted.")
  }

  function selectTileByOffset(offset: number) {
    if (!selectedTile) return
    commitAndSaveSelectedTile()
    const currentIndex = tiles.findIndex((tile) => tile.id === selectedTile.id)
    if (currentIndex === -1) return
    const nextIndex = currentIndex + offset
    if (nextIndex < 0 || nextIndex >= tiles.length) return
    setSelectedTileId(tiles[nextIndex].id)
  }

  function confirmReplaceAll() {
    if (!project) return
    if (!window.confirm("Replace all images? This will remove existing tiles.")) return
    replaceInputRef.current?.click()
  }

  async function confirmClearAll() {
    if (!project) return
    if (!window.confirm("Clear all tiles? This cannot be undone.")) return
    await deleteImagesForProject(project.id)
    const updated: CatalogueProject = {
      ...project,
      tiles: [],
      imageAssetIds: [],
      updatedAt: new Date().toISOString(),
    }
    upsertProject(updated)
    setSelectedTileId(null)
  }

  async function extractPlusFromPdf() {
    if (!project || pdfExtractRunning) return
    if (project.pdfAssetIds.length === 0) {
      toast.error("No PDFs uploaded for this project.")
      return
    }
      const detectionState = project.pdfDetection as {
        byPdfAssetId?: Record<string, PdfExportEntry>
        export?: PdfExportEntry[]
      }
      const exportById = detectionState?.byPdfAssetId
      const exportMap = detectionState?.export
    if ((!exportById || Object.keys(exportById).length === 0) && (!exportMap || exportMap.length === 0)) {
      toast.error("No PDF detection export found.")
      return
    }

    setPdfExtractRunning(true)
    let processedTiles = 0
    let tilesWithPlus = 0
    let totalPlus = 0
    let missingMappings = 0
    let missingNoExport = 0
    let missingNoRect = 0
    let missingNoMatch = 0
    let spreadsFound = 0
    let missingLogCount = 0

    try {
      const buildOfferUpdate = (tile: Tile, text: string) => {
        const offer = parseOfferText(text, datasetBrandOptions)
        const shouldSetTitle = !tile.title || !tile.titleEditedManually
        const nextTitle = shouldSetTitle ? offer.title ?? tile.title : tile.title
        return {
          offer,
          extractedText: text,
          title: nextTitle,
          titleEditedManually: shouldSetTitle ? false : tile.titleEditedManually,
          offerUpdatedAt: Date.now(),
        }
      }

      const docCache = new Map<string, PdfDoc>()
      const pageCache = new Map<string, Map<number, PdfPage>>()
      const exportEntries = getExportSpreadOrder(exportMap ?? [])
      spreadsFound = exportEntries.length
      const rectIdByImageId = new Map<string, string>()
      Object.entries(project.tileMatches ?? {}).forEach(([rectId, imageId]) => {
        rectIdByImageId.set(imageId, rectId)
      })
      const resolvedTiles: Tile[] = []
      for (const tile of project.tiles) {
        const fileName = tile.originalFileName ?? tile.id
        const matchedRectId = tile.imageKey
          ? rectIdByImageId.get(tile.imageKey)
          : undefined
        if (matchedRectId) {
          const matched = findRectById(exportEntries, matchedRectId)
          if (!matched) {
            missingMappings += 1
            missingNoMatch += 1
            resolvedTiles.push({
              ...tile,
              pdfMappingStatus: "missing",
              pdfMappingReason: "Matched rect not found in export",
            })
            continue
          }

          const { entry: pdfEntry, page: pageEntry, box } = matched
          const pdfAssetId = pdfEntry.pdfId
          let doc = docCache.get(pdfAssetId)
          if (!doc) {
            const asset = await getAsset(pdfAssetId)
            if (!asset) {
              missingMappings += 1
              resolvedTiles.push({
                ...tile,
                pdfMappingStatus: "missing",
                pdfMappingReason: "PDF asset missing",
              })
              continue
            }
            doc = await loadPdfDocument(asset.blob)
            docCache.set(pdfAssetId, doc)
          }

          let perDocPageCache = pageCache.get(pdfAssetId)
          if (!perDocPageCache) {
            perDocPageCache = new Map()
            pageCache.set(pdfAssetId, perDocPageCache)
          }
          const pageNumber = pageEntry.pageNumber ?? 1
          let page = perDocPageCache.get(pageNumber)
          if (!page) {
            page = await doc.getPage(pageNumber)
            perDocPageCache.set(pageNumber, page)
          }

          processedTiles += 1
          const rect = {
            xPdf: box.xPdf,
            yPdf: box.yPdf,
            wPdf: box.wPdf,
            hPdf: box.hPdf,
          }
          const text = await extractTextFromRect(page, rect)
          const plus = extractPlusFromPdfText(text)
          const offerUpdate = buildOfferUpdate(tile, text)
          const pageWidth = pageEntry.pageWidth ?? page.getViewport({ scale: 1 }).width
          const mappedHalf =
            box.xPdf + box.wPdf / 2 < pageWidth / 2 ? "left" : "right"
          if (plus.length > 0) {
            const trimmed = plus.slice(0, MAX_EXTRACTED_PLUS)
            const baseState = tile.linkBuilderState ?? createEmptyLinkBuilderState()
            const nextFlags = createEmptyExtractedFlags()
            trimmed.forEach((_, index) => {
              if (index < nextFlags.length) nextFlags[index] = true
            })
            resolvedTiles.push({
              ...tile,
              linkBuilderState: {
                ...baseState,
                plus: baseState.plus.map((_, index) => trimmed[index] ?? ""),
              },
              extractedPluFlags: nextFlags,
              pdfMappingStatus: undefined,
              pdfMappingReason: undefined,
              mappedPdfFilename: pdfEntry.filename ?? pdfAssetNames[pdfAssetId],
              mappedSpreadNumber: pdfEntry.spreadNumber,
              mappedHalf,
              mappedBoxIndex: box.orderIndex,
              ...offerUpdate,
            })
            tilesWithPlus += 1
            totalPlus += trimmed.length
          } else {
            resolvedTiles.push({
              ...tile,
              pdfMappingStatus: undefined,
              pdfMappingReason: undefined,
              mappedPdfFilename: pdfEntry.filename ?? pdfAssetNames[pdfAssetId],
              mappedSpreadNumber: pdfEntry.spreadNumber,
              mappedHalf,
              mappedBoxIndex: box.orderIndex,
              ...offerUpdate,
            })
          }

          continue
        }
        const mapping = parseTileMapping(fileName)
        if (!mapping) {
          missingMappings += 1
          const missingTile: Tile = {
            ...tile,
            pdfMappingStatus: "missing",
            pdfMappingReason: "Missing page/box mapping",
          }
          if (isDev && missingLogCount < 20) {
            console.log("[pdf-extract] missing mapping", {
              fileName,
              reason: "no page/box match",
            })
            missingLogCount += 1
          }
          resolvedTiles.push(missingTile)
          continue
        }
        const pdfEntry = exportEntries.find(
          (entry) => entry.spreadNumber === mapping.spreadIndex
        )
        if (!pdfEntry) {
          missingMappings += 1
          missingNoExport += 1
          const missingTile: Tile = {
            ...tile,
            pdfMappingStatus: "missing",
            pdfMappingReason: `No pdf export for spreadIndex ${mapping.spreadIndex}`,
          }
          if (isDev && missingLogCount < 20) {
            console.log("[pdf-extract] missing mapping", {
              fileName,
              imgPage: mapping.imgPage,
              spreadIndex: mapping.spreadIndex,
              half: mapping.half,
              boxOrder: mapping.boxOrder,
              exportFound: false,
            })
            missingLogCount += 1
          }
          resolvedTiles.push(missingTile)
          continue
        }
        const pdfAssetId = pdfEntry.pdfId

        let doc = docCache.get(pdfAssetId)
        if (!doc) {
          const asset = await getAsset(pdfAssetId)
          if (!asset) {
            missingMappings += 1
            const missingTile: Tile = {
              ...tile,
              pdfMappingStatus: "missing",
              pdfMappingReason: "PDF asset missing",
            }
            if (isDev && missingLogCount < 20) {
              console.log("[pdf-extract] missing mapping", {
                fileName,
                imgPage: mapping.imgPage,
                spreadIndex: mapping.spreadIndex,
                half: mapping.half,
                boxOrder: mapping.boxOrder,
                pdfAssetIdFound: true,
                exportFound: true,
                assetFound: false,
              })
              missingLogCount += 1
            }
            resolvedTiles.push(missingTile)
            continue
          }
          doc = await loadPdfDocument(asset.blob)
          docCache.set(pdfAssetId, doc)
        }

        let perDocPageCache = pageCache.get(pdfAssetId)
        if (!perDocPageCache) {
          perDocPageCache = new Map()
          pageCache.set(pdfAssetId, perDocPageCache)
        }
        let page = perDocPageCache.get(1)
        if (!page) {
          page = await doc.getPage(1)
          perDocPageCache.set(1, page)
        }

        const pageEntry = getFirstPageExport(pdfEntry)
        if (!pageEntry) {
          missingMappings += 1
          missingNoRect += 1
          const missingTile: Tile = {
            ...tile,
            pdfMappingStatus: "missing",
            pdfMappingReason: "No rects for export page",
          }
          if (isDev && missingLogCount < 20) {
            console.log("[pdf-extract] missing mapping", {
              fileName,
              imgPage: mapping.imgPage,
              spreadIndex: mapping.spreadIndex,
              half: mapping.half,
              boxOrder: mapping.boxOrder,
              pdfAssetIdFound: true,
              exportFound: true,
              pageFound: false,
            })
            missingLogCount += 1
          }
          resolvedTiles.push(missingTile)
          continue
        }

        const pageWidth = page.getViewport({ scale: 1 }).width
        const withOrder = pageEntry.boxes.filter(
          (item) => (item.include ?? true) && Number.isFinite(item.orderIndex)
        )
        const leftBucket = withOrder
          .filter((item) => item.xPdf + item.wPdf / 2 < pageWidth / 2)
          .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
        const rightBucket = withOrder
          .filter((item) => item.xPdf + item.wPdf / 2 >= pageWidth / 2)
          .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
        const bucket = mapping.half === "left" ? leftBucket : rightBucket
        const box = bucket[mapping.boxOrder - 1]
        if (!box) {
          missingMappings += 1
          missingNoRect += 1
          const missingTile: Tile = {
            ...tile,
            pdfMappingStatus: "missing",
            pdfMappingReason: `No rect for box (L:${leftBucket.length} R:${rightBucket.length})`,
          }
          if (isDev && missingLogCount < 20) {
            const orderIndices = bucket.map((item) => item.orderIndex ?? 0)
            const minOrder =
              orderIndices.length > 0 ? Math.min(...orderIndices) : null
            const maxOrder =
              orderIndices.length > 0 ? Math.max(...orderIndices) : null
            console.log("[pdf-extract] missing mapping", {
              fileName,
              imgPage: mapping.imgPage,
              spreadIndex: mapping.spreadIndex,
              half: mapping.half,
              boxOrder: mapping.boxOrder,
              pdfAssetIdFound: true,
              exportFound: true,
              bucketSize: bucket.length,
              leftBucketSize: leftBucket.length,
              rightBucketSize: rightBucket.length,
              orderRange: [minOrder, maxOrder],
            })
            missingLogCount += 1
          }
          resolvedTiles.push(missingTile)
          continue
        }
        processedTiles += 1
        const rect = {
          xPdf: box.xPdf,
          yPdf: box.yPdf,
          wPdf: box.wPdf,
          hPdf: box.hPdf,
        }
        const text = await extractTextFromRect(page, rect)
        const plus = extractPlusFromPdfText(text)
        const offerUpdate = buildOfferUpdate(tile, text)
        if (plus.length > 0) {
          const trimmed = plus.slice(0, MAX_EXTRACTED_PLUS)
          const baseState = tile.linkBuilderState ?? createEmptyLinkBuilderState()
          const nextFlags = createEmptyExtractedFlags()
          trimmed.forEach((_, index) => {
            if (index < nextFlags.length) nextFlags[index] = true
          })
          resolvedTiles.push({
            ...tile,
            linkBuilderState: {
              ...baseState,
              plus: baseState.plus.map((_, index) => trimmed[index] ?? ""),
            },
            extractedPluFlags: nextFlags,
            pdfMappingStatus: undefined,
            pdfMappingReason: undefined,
            mappedPdfFilename: pdfEntry.filename ?? pdfAssetNames[pdfAssetId],
            mappedSpreadNumber: mapping.spreadIndex,
            mappedHalf: mapping.half,
            mappedBoxIndex: mapping.boxOrder,
            ...offerUpdate,
          })
          tilesWithPlus += 1
          totalPlus += trimmed.length
        } else {
          resolvedTiles.push({
            ...tile,
            pdfMappingStatus: undefined,
            pdfMappingReason: undefined,
            mappedPdfFilename: pdfEntry.filename ?? pdfAssetNames[pdfAssetId],
            mappedSpreadNumber: mapping.spreadIndex,
            mappedHalf: mapping.half,
            mappedBoxIndex: mapping.boxOrder,
            ...offerUpdate,
          })
        }
      }

      const updated: CatalogueProject = {
        ...project,
        tiles: resolvedTiles,
        updatedAt: new Date().toISOString(),
      }
      upsertProject(updated)
      toast.success(
        `${processedTiles} tiles processed, ${tilesWithPlus} with PLUs, ${totalPlus} PLUs filled, ` +
          `${missingMappings} missing mappings (spreads ${spreadsFound}, no export ${missingNoExport}, no rect ${missingNoRect}, no match ${missingNoMatch}).`
      )
    } catch (error) {
      toast.error("PDF extraction failed. Check the PDF asset and detection map.")
    } finally {
      setPdfExtractRunning(false)
    }
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
      projects: prev.projects.map((item) =>
        item.id === project.id
          ? { ...item, tiles: cleanedTiles, updatedAt: new Date().toISOString() }
          : item
      ),
    }))
    toast.success("Legacy Extension data cleared for this project.")
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey
      if (isCmdOrCtrl && event.key.toLowerCase() === "s") {
        event.preventDefault()
        commitAndSaveSelectedTile()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [commitAndSaveSelectedTile])

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
              {isDev ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDatasetImportOpen(true)}
                >
                  Import Project Data (DEV)
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const canContinueToDetection = project.pdfAssetIds.length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Catalogue Builder</h2>
          <p className="text-sm text-muted-foreground">
            Manage tiles for your catalogue project.
          </p>
        </div>
        {projectBar}
      </div>
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
            <Button type="button" variant="outline" onClick={confirmClearAll}>
              Clear All Tiles
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  Project Dataset
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setDatasetUploadOpen(true)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {project.dataset ? "Upload/Replace Dataset" : "Upload Dataset"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDatasetDetailsOpen(true)}
                  disabled={!project.dataset}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  View Dataset Details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDatasetClearOpen(true)}
                  disabled={!project.dataset}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Dataset
                </DropdownMenuItem>
                {isDev ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearLegacyExtensionData}>
                      <Eraser className="mr-2 h-4 w-4" />
                      Clear legacy Extension data (DEV)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportProjectData}>
                      <Upload className="mr-2 h-4 w-4" />
                      Export Project Data (DEV)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDatasetImportOpen(true)}>
                      <FileText className="mr-2 h-4 w-4" />
                      Import Project Data (DEV)
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Tiles</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={missingTilesCount === 0}
                    onClick={() => setShowMissingOnly((prev) => !prev)}
                  >
                    {showMissingOnly ? "Show all" : "Show missing only"}
                  </Button>
                </div>
                <TileList
                  tiles={displayTiles}
                  selectedTileId={selectedTileId}
                  tileThumbUrls={tileThumbUrls}
                  onSelect={handleSelectTile}
                />
              </div>
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
                            </div>
                            <Card>
                              <CardHeader className="py-4">
                                <CardTitle className="text-sm">Tile Details</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <div className="space-y-2">
                                  <Label htmlFor="tile-title">Title</Label>
                                  <Input
                                    id="tile-title"
                                    value={draftTitle}
                                    onChange={(event) => {
                                      setDraftTitle(event.target.value)
                                      setDraftTitleEditedManually(true)
                                    }}
                                    placeholder="Tile title"
                                  />
                                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                    <span>
                                      Brand: {selectedTile.offer?.brand?.label ?? "-"}
                                    </span>
                                    <span>
                                      % Off: {selectedTile.offer?.percentOff?.raw ?? "-"}
                                    </span>
                                    <span>
                                      Detected Brands:{" "}
                                      {detectedBrands.length > 0 ? detectedBrands.join(", ") : "-"}
                                    </span>
                                  </div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label htmlFor="tile-status">Status</Label>
                                    <select
                                      id="tile-status"
                                      value={draftStatus}
                                      onChange={(event) => setDraftStatus(event.target.value as TileStatus)}
                                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    >
                                      <option value="todo">To do</option>
                                      <option value="in_progress">In progress</option>
                                      <option value="done">Done</option>
                                      <option value="needs_review">Needs review</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Final Dynamic Link</Label>
                                    <TooltipProvider delayDuration={200}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs text-muted-foreground flex items-center overflow-hidden">
                                            <span className="truncate font-mono">
                                              {activeOutput || "—"}
                                            </span>
                                          </div>
                                        </TooltipTrigger>
                                        {activeOutput ? (
                                          <TooltipContent className="max-w-[420px] break-all">
                                            {activeOutput}
                                          </TooltipContent>
                                        ) : null}
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="tile-notes">Notes</Label>
                                  <Textarea
                                    id="tile-notes"
                                    value={draftNotes}
                                    onChange={(event) => setDraftNotes(event.target.value)}
                                    placeholder="Notes for this tile"
                                    className="min-h-[120px]"
                                  />
                                </div>
                              </CardContent>
                            </Card>
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
                      <div className="space-y-2">
                        <Label>Dynamic Link Builder</Label>
                        <DynamicLinkBuilder
                          ref={linkBuilderRef}
                          mode="embedded"
                          hideHistory
                          hideAdpack
                          initialState={draftLinkState}
                          onChange={setDraftLinkState}
                          onOutputChange={setDraftLinkOutput}
                          scope={project?.region ?? "AU"}
                          dataset={datasetMeta}
                          onOpenDatasetPanel={() => setDatasetUploadOpen(true)}
                          facetSelectedBrands={draftFacetBrands}
                          facetSelectedArticleTypes={draftFacetArticleTypes}
                          onFacetSelectedBrandsChange={setDraftFacetBrands}
                          onFacetSelectedArticleTypesChange={setDraftFacetArticleTypes}
                          facetExcludedPluIds={draftFacetExcludedPluIds}
                          onFacetExcludedPluIdsChange={setDraftFacetExcludedPluIds}
                          facetExcludePercentEnabled={draftFacetExcludePercentEnabled}
                          onFacetExcludePercentEnabledChange={setDraftFacetExcludePercentEnabled}
                          detectedBrands={detectedBrands}
                          detectedOfferPercent={selectedTile.offer?.percentOff?.value}
                          liveLinkUrl={draftLiveCapturedUrl}
                          onLiveLinkChange={setDraftLiveCapturedUrl}
                          liveLinkEditable={extensionStatus !== "available"}
                          liveLinkInputRef={liveLinkInputRef}
                          previewUrlValue={previewUrl}
                          onPreviewUrlChange={(value) => {
                            setDraftLiveCapturedUrl(value)
                            setDraftActiveLinkMode("live")
                            setDraftUserHasChosenMode(true)
                          }}
                          activeLinkMode={draftActiveLinkMode}
                          onActiveLinkModeChange={(mode) => {
                            setDraftActiveLinkMode(mode)
                            setDraftUserHasChosenMode(true)
                          }}
                          isPluAvailable={isPluAvailable}
                          isFacetAvailable={isFacetAvailable}
                          isLiveAvailable={isLiveAvailable}
                          outputOverride={activeOutput}
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
                          previewStatusText={
                            extensionStatus === "available"
                              ? "Extension enabled"
                              : "Extension not installed - manual paste required"
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
                                          computeOutputForMode(nextState, draftActiveLinkMode, facetQuery)
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
                          onExtractedPluFlagsChange={setDraftExtractedFlags}
                        />
                        <Dialog open={captureDialogOpen} onOpenChange={setCaptureDialogOpen}>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Apply captured link?</DialogTitle>
                              <DialogDescription>
                                This can overwrite current manual link settings to build a dynamic link.
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setCaptureDialogOpen(false)
                                  setPendingCapturedUrl(null)
                                  setDraftActiveLinkMode("live")
                                  setDraftUserHasChosenMode(true)
                                }}
                              >
                                Capture only
                              </Button>
                              <Button
                                type="button"
                                onClick={() => {
                                  if (!pendingCapturedUrl) {
                                    setCaptureDialogOpen(false)
                                    setPendingCapturedUrl(null)
                                    return
                                  }
                                  const { nextState, didConvert, warnings } =
                                    convertCapturedUrlToBuilderState(
                                      pendingCapturedUrl,
                                      draftLinkState
                                    )
                                  if (didConvert) {
                                    setDraftLinkState(nextState)
                                    setDraftLinkOutput(
                                      computeOutputForMode(
                                        nextState,
                                        draftActiveLinkMode,
                                        facetQuery
                                      )
                                    )
                                    setDraftLinkSource("manual")
                                    const nextPluCount = nextState.plus.filter((plu) => plu.trim().length > 0).length
                                    const nextFacetQuery = buildFacetQueryFromSelections(
                                      draftFacetBrands,
                                      draftFacetArticleTypes
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
                              >
                                Convert to Dynamic
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label>Offer Debug</Label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setOfferDebugOpen((prev) => !prev)}
                          >
                            {offerDebugOpen ? "Hide" : "Show"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={reExtractOfferForSelected}
                            disabled={!selectedTile.extractedText}
                          >
                            Re-extract Offer
                          </Button>
                        </div>
                      </div>
                      {offerDebugOpen ? (
                        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                          <div className="space-y-1">
                            <div>
                              <span className="font-medium">Title:</span>{" "}
                              {selectedTile.offer?.title ?? "-"}
                            </div>
                            <div>
                              <span className="font-medium">Brand:</span>{" "}
                              {selectedTile.offer?.brand?.label ?? "-"}
                            </div>
                            <div>
                              <span className="font-medium">Details:</span>{" "}
                              {selectedTile.offer?.productDetails ?? "-"}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label>Debug: Extracted Text</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setOfferTextDebugOpen((prev) => !prev)}
                        >
                          {offerTextDebugOpen ? "Hide" : "Show"}
                        </Button>
                      </div>
                      {offerTextDebugOpen ? (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            Offer updated:{" "}
                            {selectedTile.offerUpdatedAt
                              ? new Date(selectedTile.offerUpdatedAt).toLocaleString()
                              : "-"}
                          </div>
                          {selectedTile.extractedText ||
                          selectedTile.offer?.source?.rawText ? (
                            <Textarea
                              readOnly
                              value={
                                selectedTile.extractedText ??
                                selectedTile.offer?.source?.rawText ??
                                ""
                              }
                              className="min-h-[120px] text-xs"
                            />
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              No extracted text stored for this tile.
                            </div>
                          )}
                          {selectedTile.offer?.source?.cleanedText ? (
                            <Textarea
                              readOnly
                              value={selectedTile.offer.source.cleanedText}
                              className="min-h-[80px] text-xs"
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
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

      {isDev ? (
        <Dialog open={datasetImportOpen} onOpenChange={setDatasetImportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Project Data (DEV)</DialogTitle>
              <DialogDescription>
                DEV tool – imports into local storage on this machine.
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
      ) : null}

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





