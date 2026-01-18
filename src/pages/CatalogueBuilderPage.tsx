import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
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
import { Info } from "lucide-react"
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
import { toast } from "sonner"
import DynamicLinkBuilder from "@/tools/link-builder/DynamicLinkBuilder"
import { BRAND_OPTIONS } from "@/data/brands"
import {
  createProject,
  loadProjectsState,
  saveProjectsState,
  updateTile,
} from "@/tools/catalogue-builder/catalogueProjectsStorage"
import { clearImagesForProject, getImage, putImage } from "@/tools/catalogue-builder/imageStore"
import { deleteAssetsForProject, getAsset, putAsset } from "@/lib/assetStore"
import PdfTileDetectionPage from "@/pages/PdfTileDetectionPage"
import { extractTextFromRect, loadPdfDocument, type PdfRect } from "@/tools/catalogue-builder/pdfTextExtract"
import { parseOfferText } from "@/lib/extraction/parseOfferText"
import { extractPlusFromPdfText } from "@/lib/extraction/pluUtils"
 
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
    category: null,
    brand: null,
    extension: "",
    plus: Array.from({ length: MAX_PLUS_FIELDS }, () => ""),
  }
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
  const [tileThumbUrls, setTileThumbUrls] = useState<Record<string, string>>({})
  const tileThumbUrlsRef = useRef<Record<string, string>>({})
  const [selectedColorUrl, setSelectedColorUrl] = useState<string | null>(null)
  const [pdfExtractRunning, setPdfExtractRunning] = useState(false)
  const [showMissingOnly, setShowMissingOnly] = useState(false)
  const [pdfAssetNames, setPdfAssetNames] = useState<Record<string, string>>({})
  const [offerDebugOpen, setOfferDebugOpen] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const isUploadingImagesRef = useRef(false)
  const lastUploadSignatureRef = useRef<string | null>(null)

  const project = useMemo(() => {
    return (
      projectsState.projects.find(
        (item) => item.id === projectsState.activeProjectId
      ) ?? null
    )
  }, [projectsState])

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
    setProjectsState((prev) => ({
      ...prev,
      activeProjectId: nextId,
    }))
  }

  function upsertProject(updated: CatalogueProject) {
    setProjectsState((prev) => ({
      ...prev,
      projects: prev.projects.map((item) =>
        item.id === updated.id ? updated : item
      ),
    }))
  }

  function addProject(newProject: CatalogueProject) {
    setProjectsState((prev) => ({
      activeProjectId: newProject.id,
      projects: [...prev.projects, newProject],
    }))
  }

  function deleteProject(projectId: string) {
    setProjectsState((prev) => {
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
  const missingTilesCount = tiles.filter(
    (tile) => tile.pdfMappingStatus === "missing"
  ).length
  const displayTiles = showMissingOnly
    ? tiles.filter((tile) => tile.pdfMappingStatus === "missing")
    : tiles
  const detectionSummary = useMemo(() => {
    if (!project) return []
    const detectionState = project.pdfDetection as {
      byPdfAssetId?: Record<string, PdfExportEntry>
      export?: PdfExportEntry[]
    }
    const exportEntries = getExportSpreadOrder(detectionState.export ?? [])
    return exportEntries.map((entry, index) => {
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
  }, [project, pdfAssetNames])
  const selectedTile = useMemo(
    () => tiles.find((tile) => tile.id === selectedTileId) ?? null,
    [tiles, selectedTileId]
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
    const previousUrls = tileThumbUrlsRef.current
    Object.values(previousUrls).forEach((url) => URL.revokeObjectURL(url))
    tileThumbUrlsRef.current = {}
    setTileThumbUrls({})

    if (!project) return () => undefined
    const currentProject = project

    async function loadThumbs() {
      const next: Record<string, string> = {}
      for (const tile of currentProject.tiles) {
        if (!tile.imageKey) continue
        const blob = await getImage(tile.imageKey)
        if (!blob) continue
        const url = URL.createObjectURL(blob)
        next[tile.id] = url
      }
      if (cancelled) {
        Object.values(next).forEach((url) => URL.revokeObjectURL(url))
        return
      }
      tileThumbUrlsRef.current = next
      setTileThumbUrls(next)
    }

    void loadThumbs()

    return () => {
      cancelled = true
      const currentUrls = tileThumbUrlsRef.current
      Object.values(currentUrls).forEach((url) => URL.revokeObjectURL(url))
      tileThumbUrlsRef.current = {}
    }
  }, [project?.id, project?.tiles])

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
      return
    }
    setDraftTitle(selectedTile.title ?? "")
    setDraftTitleEditedManually(selectedTile.titleEditedManually ?? false)
    setDraftStatus(selectedTile.status)
    setDraftNotes(selectedTile.notes ?? "")
    setDraftLinkState(selectedTile.linkBuilderState ?? createEmptyLinkBuilderState())
    setDraftLinkOutput(selectedTile.dynamicLink ?? "")
    setDraftExtractedFlags(selectedTile.extractedPluFlags ?? createEmptyExtractedFlags())
  }, [selectedTile])

  useEffect(() => {
    let cancelled = false
    let colorUrl: string | null = null

    setSelectedColorUrl(null)

    async function loadSelectedImages() {
      if (!selectedTile) return
      if (selectedTile.imageKey) {
        const colorBlob = await getImage(selectedTile.imageKey)
        if (colorBlob && !cancelled) {
          colorUrl = URL.createObjectURL(colorBlob)
          setSelectedColorUrl(colorUrl)
        }
      }
    }

    void loadSelectedImages()

    return () => {
      cancelled = true
      if (colorUrl) URL.revokeObjectURL(colorUrl)
    }
  }, [
    selectedTile?.id,
    selectedTile?.imageKey,
  ])

  function buildUploadSignature(files: File[]) {
    return files
      .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      .join("|")
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
          linkBuilderState: createEmptyLinkBuilderState(),
          extractedPluFlags: createEmptyExtractedFlags(),
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

  function saveSelectedTile() {
    if (!project || !selectedTile) return
    const updated = updateTile(project, selectedTile.id, {
      title: draftTitle.trim() || undefined,
      titleEditedManually: draftTitleEditedManually,
      status: draftStatus,
      notes: draftNotes.trim() || undefined,
      dynamicLink: draftLinkOutput.trim() || undefined,
      linkBuilderState: draftLinkState,
      extractedPluFlags: draftExtractedFlags,
    })
    upsertProject(updated)
  }

  function reExtractOfferForSelected() {
    if (!project || !selectedTile) return
    if (!selectedTile.extractedText) {
      toast.error("No extracted text available for this tile.")
      return
    }
    const offer = parseOfferText(selectedTile.extractedText, BRAND_OPTIONS)
    const shouldSetTitle = !selectedTile.title || !selectedTile.titleEditedManually
    const nextTitle = shouldSetTitle ? offer.title ?? selectedTile.title : selectedTile.title
    const updated = updateTile(project, selectedTile.id, {
      offer,
      title: nextTitle,
      titleEditedManually: shouldSetTitle ? false : selectedTile.titleEditedManually,
    })
    upsertProject(updated)
    toast.success("Offer extracted.")
  }

  function selectTileByOffset(offset: number) {
    if (!selectedTile) return
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
        const offer = parseOfferText(text, BRAND_OPTIONS)
        const shouldSetTitle = !tile.title || !tile.titleEditedManually
        const nextTitle = shouldSetTitle ? offer.title ?? tile.title : tile.title
        return {
          offer,
          extractedText: text,
          title: nextTitle,
          titleEditedManually: shouldSetTitle ? false : tile.titleEditedManually,
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey
      if (isCmdOrCtrl && event.key.toLowerCase() === "s") {
        event.preventDefault()
        saveSelectedTile()
        return
      }
      const isEnter = event.key === "Enter"
      const isNextShortcut = isCmdOrCtrl && event.key.toLowerCase() === "enter"
      if (isEnter || isNextShortcut) {
        const target = event.target as HTMLElement | null
        const tag = target?.tagName?.toLowerCase()
        if (tag === "textarea") return
        event.preventDefault()
        saveSelectedTile()
        selectTileByOffset(1)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    project,
    selectedTile,
    draftTitle,
    draftStatus,
    draftNotes,
    draftLinkOutput,
    draftLinkState,
    draftExtractedFlags,
    tiles,
  ])

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
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const canContinueToDetection = project.pdfAssetIds.length > 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Catalogue Builder</h2>
        <p className="text-sm text-muted-foreground">
          Manage tiles for your catalogue project.
        </p>
      </div>
      {projectBar}
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
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{project.name}</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setProjectStage("pdf-detect")}
              >
                Back to PDF detection
              </Button>
            </div>
          </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Tiles: <span className="font-medium text-foreground">{project.tiles.length}</span>
            </div>
            {project.tiles.length > 0 ? (
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
              </div>
            ) : null}
          </div>
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
                <div className="space-y-2">
                  {displayTiles.map((tile) => {
                    const isSelected = tile.id === selectedTileId
                    const mappingInfo = formatMappingInfo(tile.originalFileName ?? tile.id)
                    return (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() => setSelectedTileId(tile.id)}
                        className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                          isSelected
                            ? "border-primary bg-muted"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {tileThumbUrls[tile.id] ? (
                              <img
                                src={tileThumbUrls[tile.id]}
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
                                    {`Spread ${tile.mappedSpreadNumber} • ${tile.mappedPdfFilename ?? "PDF"} • ${tile.mappedHalf ?? "?"} • box ${tile.mappedBoxIndex ?? "?"}`}
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
                            {tile.title}
                          </div>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                {selectedTile ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{selectedTile.id}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedColorUrl ? (
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
                      ) : (
                        <p className="text-sm text-muted-foreground">No image for this tile.</p>
                      )}
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
                      </div>
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
                        <Label>Dynamic Link Builder</Label>
                        <DynamicLinkBuilder
                          mode="embedded"
                          hideHistory
                          hideAdpack
                          initialState={draftLinkState}
                          onChange={setDraftLinkState}
                          onOutputChange={setDraftLinkOutput}
                          extractedPluFlags={draftExtractedFlags}
                          onExtractedPluFlagsChange={setDraftExtractedFlags}
                        />
                      </div>
                    <div className="space-y-2">
                      <Label htmlFor="tile-notes">Notes</Label>
                      <Textarea
                        id="tile-notes"
                        value={draftNotes}
                        onChange={(event) => setDraftNotes(event.target.value)}
                        placeholder="Notes for this tile"
                      />
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
                              {selectedTile.offer?.title ?? "—"}
                            </div>
                            <div>
                              <span className="font-medium">Percent:</span>{" "}
                              {selectedTile.offer?.percentOff?.raw ?? "—"}
                            </div>
                            <div>
                              <span className="font-medium">Brand:</span>{" "}
                              {selectedTile.offer?.brand?.label ?? "—"}
                            </div>
                            <div>
                              <span className="font-medium">Price:</span>{" "}
                              {selectedTile.offer?.price?.raw ?? "—"}
                              {selectedTile.offer?.price?.qualifier
                                ? ` (${selectedTile.offer?.price?.qualifier})`
                                : ""}
                            </div>
                            <div>
                              <span className="font-medium">Save:</span>{" "}
                              {selectedTile.offer?.save?.raw ?? "—"}
                            </div>
                            <div>
                              <span className="font-medium">Details:</span>{" "}
                              {selectedTile.offer?.productDetails ?? "—"}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" onClick={saveSelectedTile}>
                        Save (Ctrl+S)
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          saveSelectedTile()
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
    </div>
  )
}

