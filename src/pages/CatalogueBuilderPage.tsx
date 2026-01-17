import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
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
import { createWorker } from "tesseract.js"
import {
  createProject,
  loadProjectsState,
  saveProjectsState,
  updateTile,
} from "@/tools/catalogue-builder/catalogueProjectsStorage"
import { clearImagesForProject, getImage, putImage } from "@/tools/catalogue-builder/imageStore"
import { deleteAssetsForProject, putAsset } from "@/lib/assetStore"
import PdfTileDetectionPage from "@/pages/PdfTileDetectionPage"
 
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
const PLU_REGEX = /\b(?:\d\s*){5,8}\b/g
const MAX_PLUS_FIELDS = 20
const OCR_CONFIDENCE_MIN = 60
const OCR_SCALE = 3
const OCR_SMOOTHING = true

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

function normalizeOcrText(text: string) {
  return text.replace(/[0-9OIlS ]+/g, (match) => {
    if (!/\d/.test(match)) return match
    const normalized = match
      .replace(/[Oo]/g, "0")
      .replace(/[Il]/g, "1")
      .replace(/S/g, "5")
    return normalized.replace(/\s+/g, "")
  })
}

function extractPluCandidates(
  text: string,
  words?: { text: string; confidence: number }[]
) {
  const reject = new Set(["2025", "2026", "2027"])
  const seen = new Set<string>()
  const strong: string[] = []
  const weak: string[] = []

  function pushCandidate(value: string, confidence: number) {
    const trimmed = value.replace(/\s+/g, "").trim()
    if (!trimmed || reject.has(trimmed) || seen.has(trimmed)) return
    seen.add(trimmed)
    if (confidence >= OCR_CONFIDENCE_MIN) {
      strong.push(trimmed)
    } else {
      weak.push(trimmed)
    }
  }

  const sourceTokens =
    words && words.length > 0
      ? words.map((word) => ({
          text: normalizeOcrText(word.text ?? ""),
          confidence: Number.isFinite(word.confidence) ? word.confidence : 0,
        }))
      : [{ text: normalizeOcrText(text), confidence: 0 }]

  for (const token of sourceTokens) {
    const matches = token.text.match(PLU_REGEX) ?? []
    for (const match of matches) {
      pushCandidate(match, token.confidence)
    }
  }

  const strongSix = strong.filter((candidate) => candidate.length === 6)
  const strongFallback = strongSix.length > 0 ? strongSix : strong
  const finalStrong = strongFallback.filter(
    (candidate) => candidate.length >= 5 && candidate.length <= 8
  )
  const finalWeak = weak.filter(
    (candidate) => candidate.length >= 5 && candidate.length <= 8
  )

  return {
    candidates: finalStrong,
    weakSuggestions: finalStrong.length === 0 ? finalWeak : [],
  }
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

async function upscaleForOcr(source: Blob, scale = OCR_SCALE) {
  const bmp = await createImageBitmap(source)
  const srcW = bmp.width
  const srcH = bmp.height
  if (!srcW || !srcH) {
    bmp.close?.()
    throw new Error("Invalid OCR source dimensions")
  }
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.floor(srcW * scale))
  canvas.height = Math.max(1, Math.floor(srcH * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    bmp.close?.()
    return source
  }
  ctx.imageSmoothingEnabled = OCR_SMOOTHING
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const hist = new Array(256).fill(0)
    let minLum = 255
    let maxLum = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      hist[lum] += 1
      if (lum < minLum) minLum = lum
      if (lum > maxLum) maxLum = lum
      data[i] = lum
      data[i + 1] = lum
      data[i + 2] = lum
    }
    const totalPixels = data.length / 4
    const lowCut = Math.floor(totalPixels * 0.05)
    const highCut = Math.floor(totalPixels * 0.95)
    let cumulative = 0
    let low = minLum
    let high = maxLum
    for (let i = 0; i < hist.length; i += 1) {
      cumulative += hist[i]
      if (cumulative >= lowCut) {
        low = i
        break
      }
    }
    cumulative = 0
    for (let i = hist.length - 1; i >= 0; i -= 1) {
      cumulative += hist[i]
      if (cumulative >= totalPixels - highCut) {
        high = i
        break
      }
    }
    if (low >= high) {
      low = minLum
      high = maxLum
    }
    const range = high - low || 1
    for (let i = 0; i < data.length; i += 4) {
      const lum = data[i]
      const stretched = Math.max(0, Math.min(255, Math.round(((lum - low) / range) * 255)))
      const blended = Math.round(stretched * 0.7 + lum * 0.3)
      data[i] = blended
      data[i + 1] = blended
      data[i + 2] = blended
    }
  ctx.putImageData(imageData, 0, 0)
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? source), "image/png")
  })
}

async function getBitmapSize(blob: Blob) {
  const bmp = await createImageBitmap(blob)
  const size = { width: bmp.width, height: bmp.height }
  bmp.close?.()
  return size
}

async function recognizeWithFallback(
  worker: Awaited<ReturnType<typeof createWorker>>,
  blob: Blob
) {
  try {
    return await worker.recognize(blob)
  } catch {
    const url = URL.createObjectURL(blob)
    try {
      return await worker.recognize(url)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

async function deleteImagesForProject(projectId: string) {
  await clearImagesForProject(projectId)
}

function buildPlusFromCandidates(candidates: string[]) {
  const plus = Array.from({ length: MAX_PLUS_FIELDS }, (_, i) => candidates[i] ?? "")
  const extractedFlags = Array.from({ length: MAX_PLUS_FIELDS }, (_, i) => i < candidates.length)
  return { plus, extractedFlags }
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
  const [projectsState, setProjectsState] = useState(() => loadProjectsState())
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectRegion, setNewProjectRegion] = useState<Region>("AU")
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
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
  const [selectedGrayUrl, setSelectedGrayUrl] = useState<string | null>(null)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrStatus, setOcrStatus] = useState("")
  const [ocrAllRunning, setOcrAllRunning] = useState(false)
  const [ocrAllStatus, setOcrAllStatus] = useState("")
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

  async function getOcrImageBlobForTile(
    tile: Tile
  ): Promise<{ blob: Blob; used: "gray" | "color" } | null> {
    if (tile.grayImageKey) {
      const grayBlob = await getImage(tile.grayImageKey)
      if (grayBlob) {
        return { blob: grayBlob, used: "gray" }
      }
    }
    if (tile.imageKey) {
      const colorBlob = await getImage(tile.imageKey)
      if (colorBlob) {
        return { blob: colorBlob, used: "color" }
      }
    }
    return null
  }

  async function configureOcrWorker(worker: Awaited<ReturnType<typeof createWorker>>) {
    try {
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789",
        classify_bln_numeric_mode: "1",
        tessedit_pageseg_mode: "6",
      })
    } catch {
      // Ignore parameter errors to keep OCR running.
    }
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

  useEffect(() => {
    let cancelled = false
    const previousUrls = tileThumbUrlsRef.current
    Object.values(previousUrls).forEach((url) => URL.revokeObjectURL(url))
    tileThumbUrlsRef.current = {}
    setTileThumbUrls({})

    if (!project) return () => undefined

    async function loadThumbs() {
      const next: Record<string, string> = {}
      for (const tile of project.tiles) {
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
      setDraftStatus("todo")
      setDraftNotes("")
      setDraftLinkState(createEmptyLinkBuilderState())
      setDraftLinkOutput("")
      setDraftExtractedFlags(createEmptyExtractedFlags())
      return
    }
    setDraftTitle(selectedTile.title ?? "")
    setDraftStatus(selectedTile.status)
    setDraftNotes(selectedTile.notes ?? "")
    setDraftLinkState(selectedTile.linkBuilderState ?? createEmptyLinkBuilderState())
    setDraftLinkOutput(selectedTile.dynamicLink ?? "")
    setDraftExtractedFlags(selectedTile.extractedPluFlags ?? createEmptyExtractedFlags())
  }, [selectedTile])

  useEffect(() => {
    let cancelled = false
    let colorUrl: string | null = null
    let grayUrl: string | null = null

    setSelectedColorUrl(null)
    setSelectedGrayUrl(null)

    async function loadSelectedImages() {
      if (!selectedTile) return
      if (selectedTile.imageKey) {
        const colorBlob = await getImage(selectedTile.imageKey)
        if (colorBlob && !cancelled) {
          colorUrl = URL.createObjectURL(colorBlob)
          setSelectedColorUrl(colorUrl)
        }
      }
      if (selectedTile.grayImageKey) {
        const grayBlob = await getImage(selectedTile.grayImageKey)
        if (grayBlob && !cancelled) {
          grayUrl = URL.createObjectURL(grayBlob)
          setSelectedGrayUrl(grayUrl)
        }
      }
    }

    void loadSelectedImages()

    return () => {
      cancelled = true
      if (colorUrl) URL.revokeObjectURL(colorUrl)
      if (grayUrl) URL.revokeObjectURL(grayUrl)
    }
  }, [
    selectedTile?.id,
    selectedTile?.imageKey,
    selectedTile?.grayImageKey,
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
          extractedPLUs: undefined,
          extractedPluFlags: undefined,
          linkBuilderState: createEmptyLinkBuilderState(),
          imageKey: colorKey,
          grayImageKey: undefined,
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
      if (import.meta.env.DEV) {
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
      status: draftStatus,
      notes: draftNotes.trim() || undefined,
      dynamicLink: draftLinkOutput.trim() || undefined,
      linkBuilderState: draftLinkState,
      extractedPluFlags: draftExtractedFlags,
    })
    upsertProject(updated)
  }

  async function runOcr() {
    if (!project || !selectedTile || ocrRunning) return
    const source = await getOcrImageBlobForTile(selectedTile)
    if (!source) return
    setOcrRunning(true)
    setOcrStatus("Preparing OCR...")
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null
    try {
      worker = await createWorker("eng")
      await configureOcrWorker(worker)
      const processedBlob = await upscaleForOcr(source.blob)
      const size = await getBitmapSize(processedBlob)
      console.log(
        `[OCR] tile=${selectedTile.id} source=${source.used} size=${size.width}x${size.height}`
      )
      if (size.width < 50 || size.height < 50) {
        toast.warning(
          `Skipped OCR for tile ${selectedTile.id}: OCR image too small (${size.width}x${size.height}).`
        )
        return
      }
      setOcrStatus(`Recognising (${source.used === "gray" ? "greyscale" : "colour"})...`)
      const { data } = await recognizeWithFallback(worker, processedBlob)

      setOcrStatus("Parsing results...")
      const text = data.text ?? ""
      const { candidates, weakSuggestions } = extractPluCandidates(text, data.words)

      if (candidates.length > 0) {
        const { plus, extractedFlags } = buildPlusFromCandidates(candidates)
        const baseState = selectedTile.linkBuilderState ?? createEmptyLinkBuilderState()
        const updated = updateTile(project, selectedTile.id, {
          extractedPLUs: candidates,
          extractedPluFlags: extractedFlags,
          ocrSuggestions: undefined,
          linkBuilderState: {
            ...baseState,
            plus,
          },
        })
        upsertProject(updated)
      } else if (weakSuggestions.length > 0) {
        const updated = updateTile(project, selectedTile.id, {
          ocrSuggestions: weakSuggestions,
        })
        upsertProject(updated)
        toast.message("OCR uncertain. Suggestions saved.")
      } else {
        toast.message("No PLU candidates found.")
      }
      setOcrStatus("Done")
    } catch (error) {
      toast.error("OCR failed. Check local OCR assets and try again.")
    } finally {
      if (worker) {
        await worker.terminate().catch(() => undefined)
      }
      setOcrRunning(false)
      setOcrStatus("")
    }
  }
 
  async function runOcrForAllTiles() {
    if (!project || ocrAllRunning) return
    const tilesWithImages = project.tiles.filter(
      (tile) => tile.grayImageKey || tile.imageKey
    )
    if (tilesWithImages.length === 0) return

    setOcrAllRunning(true)
    setOcrAllStatus("Preparing OCR...")

    let totalPluCount = 0
    let updatedTilesCount = 0
    let skippedTilesCount = 0
    let uncertainTilesCount = 0
    let failedTilesCount = 0
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null

    try {
      worker = await createWorker("eng")
      await configureOcrWorker(worker)
      const updatedTiles = [...project.tiles]

      for (let i = 0; i < updatedTiles.length; i += 1) {
        const tile = updatedTiles[i]
        try {
          const source = await getOcrImageBlobForTile(tile)
          if (!source) {
            skippedTilesCount += 1
            continue
          }

          const processedBlob = await upscaleForOcr(source.blob)
          const size = await getBitmapSize(processedBlob)
          console.log(
            `[OCR] tile=${tile.id} source=${source.used} size=${size.width}x${size.height}`
          )
          if (size.width < 50 || size.height < 50) {
            toast.warning(
              `Skipped OCR for tile ${tile.id}: OCR image too small (${size.width}x${size.height}).`
            )
            skippedTilesCount += 1
            continue
          }

          setOcrAllStatus(
            `Recognising ${tile.id} (${i + 1}/${updatedTiles.length}) (${source.used === "gray" ? "greyscale" : "colour"})...`
          )

          const { data } = await recognizeWithFallback(worker, processedBlob)
          const { candidates, weakSuggestions } = extractPluCandidates(
            data.text ?? "",
            data.words
          )
          if (candidates.length > 0) {
            const { plus, extractedFlags } = buildPlusFromCandidates(candidates)
            const baseState = tile.linkBuilderState ?? createEmptyLinkBuilderState()
            updatedTiles[i] = {
              ...tile,
              extractedPLUs: candidates,
              extractedPluFlags: extractedFlags,
              ocrSuggestions: undefined,
              linkBuilderState: {
                ...baseState,
                plus,
              },
            }
            totalPluCount += candidates.length
            updatedTilesCount += 1
          } else if (weakSuggestions.length > 0) {
            updatedTiles[i] = {
              ...tile,
              ocrSuggestions: weakSuggestions,
            }
            uncertainTilesCount += 1
          }
        } catch (error) {
          failedTilesCount += 1
        }
      }

      const updatedProject: CatalogueProject = {
        ...project,
        tiles: updatedTiles,
        updatedAt: new Date().toISOString(),
      }
      upsertProject(updatedProject)
      toast.success(
        `OCR complete: ${totalPluCount} PLUs across ${updatedTilesCount} tiles. Skipped ${skippedTilesCount}.`
      )
      if (uncertainTilesCount > 0) {
        toast.message(`OCR uncertain on ${uncertainTilesCount} tile(s). Suggestions saved.`)
      }
      if (failedTilesCount > 0) {
        toast.message(`OCR failed on ${failedTilesCount} tile(s).`)
      }
      setOcrAllStatus("Done")
    } catch (error) {
      toast.error("OCR failed. Check local OCR assets and try again.")
    } finally {
      if (worker) {
        await worker.terminate().catch(() => undefined)
      }
      setOcrAllRunning(false)
      setOcrAllStatus("")
    }
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
                <Button type="button" onClick={runOcrForAllTiles} disabled={ocrAllRunning}>
                  Extract PLUs (All Tiles)
                </Button>
                {ocrAllRunning ? (
                  <span className="text-xs text-muted-foreground">{ocrAllStatus || "Processing..."}</span>
                ) : null}
                <Button type="button" variant="outline" onClick={confirmReplaceAll}>
                  Replace All Images
                </Button>
                <Button type="button" variant="outline" onClick={confirmClearAll}>
                  Clear All Tiles
                </Button>
              </div>
            ) : null}
          </div>
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
                <div className="text-xs font-medium uppercase text-muted-foreground">Tiles</div>
                <div className="space-y-2">
                  {project.tiles.map((tile) => {
                    const isSelected = tile.id === selectedTileId
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
                          <span className="text-xs uppercase text-muted-foreground">{tile.status}</span>
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
                      {selectedColorUrl || selectedGrayUrl ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase text-muted-foreground">
                              Colour
                            </div>
                            {selectedColorUrl ? (
                              <div className="w-full overflow-hidden rounded-md border border-border bg-muted/50 p-3">
                                <img
                                  src={selectedColorUrl}
                                  alt={selectedTile.originalFileName}
                                  className="max-h-[360px] w-full h-auto rounded-md object-contain"
                                />
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No colour preview available.
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase text-muted-foreground">
                              Greyscale
                            </div>
                            {selectedGrayUrl ? (
                              <div className="w-full overflow-hidden rounded-md border border-border bg-muted/50 p-3">
                                <img
                                  src={selectedGrayUrl}
                                  alt={`${selectedTile.originalFileName} greyscale`}
                                  className="max-h-[360px] w-full h-auto rounded-md object-contain"
                                />
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                No greyscale preview yet.
                              </p>
                            )}
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
                          onChange={(event) => setDraftTitle(event.target.value)}
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
                    {selectedTile.imageKey || selectedTile.grayImageKey ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="outline" onClick={runOcr} disabled={ocrRunning}>
                            Extract PLUs
                          </Button>
                          {ocrRunning ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                              <span>{ocrStatus || "Processing..."}</span>
                            </div>
                          ) : selectedTile.extractedPLUs?.length ? (
                            <span className="text-xs text-muted-foreground">
                              {selectedTile.extractedPLUs.length} PLU(s) extracted
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
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

