import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Eye, EyeOff } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
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
import { detectTilesInCanvas } from "@/tools/catalogue-builder/pdfTileDetect"
import { loadOpenCv } from "@/lib/loadOpenCv"
import { deleteAsset, getAsset, listAssets, putAsset, putAssetRecord } from "@/lib/assetStore"
import {
  loadProjectsState,
  saveProjectsState,
} from "@/tools/catalogue-builder/catalogueProjectsStorage"
import type { CatalogueProject } from "@/tools/catalogue-builder/catalogueTypes"
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api"
import type { PageViewport } from "pdfjs-dist/types/src/display/display_utils"
import * as pdfjsLib from "pdfjs-dist"
import "pdfjs-dist/build/pdf.worker.min.mjs"

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

type PdfTileDetectionPageProps = {
  project?: CatalogueProject
  onProjectChange?: (project: CatalogueProject) => void
}

const isDev = false

const SHOW_EXPORT_SUMMARY = false
const SHOW_DETECTED_BOXES = false

export default function PdfTileDetectionPage({
  project: externalProject,
  onProjectChange,
}: PdfTileDetectionPageProps) {
  const [projectsState, setProjectsState] = useState({
    activeProjectId: null,
    projects: [],
  })

  useEffect(() => {
    let cancelled = false
    async function loadProjects() {
      const state = await loadProjectsState()
      if (cancelled) return
      setProjectsState(state)
    }
    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [])
  const activeProject = useMemo(() => {
    return (
      projectsState.projects.find(
        (item) => item.id === projectsState.activeProjectId
      ) ?? null
    )
  }, [projectsState])
  const currentProject = externalProject ?? activeProject

  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [pdfStatus, setPdfStatus] = useState("")
  const [cannyLow, setCannyLow] = useState(50)
  const [cannyHigh, setCannyHigh] = useState(150)
  const [minAreaPercent, setMinAreaPercent] = useState(1)
  const [dilateIterations, setDilateIterations] = useState(2)
  type PdfBox = {
    rectId: string
    pageNumber: number
    xPdf: number
    yPdf: number
    wPdf: number
    hPdf: number
    areaPdf: number
  }

  const [boxes, setBoxes] = useState<PdfBox[]>([])
  const [rectPaddingPx, setRectPaddingPx] = useState(10)
  const [rectConfigs, setRectConfigs] = useState<
    Record<number, { include: boolean; paddingOverride?: number; orderIndex?: number }>
  >({})
  const [overlayCursor, setOverlayCursor] = useState("default")
  const [detecting, setDetecting] = useState(false)
  const [opencvStatus, setOpenCvStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [opencvError, setOpenCvError] = useState<string | null>(null)
  const [pageRendered, setPageRendered] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [hoverRectIndex, setHoverRectIndex] = useState<number | null>(null)
  const [selectedRectIndex, setSelectedRectIndex] = useState<number | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [replacePdfOpen, setReplacePdfOpen] = useState(false)
  const [viewportCssSize, setViewportCssSize] = useState({ width: 0, height: 0 })
  const [showAllImages, setShowAllImages] = useState(false)
  const [showMatched, setShowMatched] = useState(false)
  const [imageAssets, setImageAssets] = useState<
    { assetId: string; name: string; url: string; spreadNumber: number | null }[]
  >([])

  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderHostRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<PageViewport | null>(null)
  const pageSizeRef = useRef<{ width: number; height: number } | null>(null)
  const renderTaskRef = useRef<any | null>(null)
  const renderTokenRef = useRef(0)
  const detectTokenRef = useRef(0)
  const persistTimerRef = useRef<number | null>(null)
  const hydrationDoneRef = useRef(false)
  const listItemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const pdfDocMapRef = useRef<Map<string, PDFDocumentProxy>>(new Map())
  const isSyncingRef = useRef(false)
  const isAutoDetectingRef = useRef(false)
  const resizeStateRef = useRef<{
    index: number
    handle: string
    startX: number
    startY: number
    rect: { x: number; y: number; width: number; height: number }
  } | null>(null)
  const wasResizingRef = useRef(false)
  const drawStateRef = useRef<{
    start: { x: number; y: number }
    current: { x: number; y: number }
  } | null>(null)
  const lastPdfIdRef = useRef<string | null>(null)
  const skipAutoDetectRef = useRef(false)
  const replacePdfInputRef = useRef<HTMLInputElement | null>(null)

  function selectRectIndex(next: number | null, reason: string) {
    setSelectedRectIndex((prev) => {
      if (prev !== next && (import.meta as any).env?.DEV) {
        // eslint-disable-next-line no-console
        console.log("[selectRect]", { reason, prev, next, stack: new Error().stack })
      }
      return next
    })
  }

  type RectConfig = { include: boolean; paddingOverride?: number; orderIndex?: number }
  type PageData = {
    boxes: PdfBox[]
    rectConfigs: Record<number, RectConfig>
    rectPaddingPx?: number
    pageWidth?: number
    pageHeight?: number
  }
  type PdfEntry = {
    id: string
    name: string
    pageCount: number
    selectedPage: number
    pages: Record<number, PageData>
    fileId?: string
    missing?: boolean
  }

  const [pdfs, setPdfs] = useState<PdfEntry[]>([])
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>(null)

  const tileMatches = currentProject?.tileMatches ?? {}

  function updateActiveProject(updater: (project: CatalogueProject) => CatalogueProject) {
    if (externalProject && onProjectChange) {
      const updated = updater(externalProject)
      onProjectChange(updated)
      return
    }
    setProjectsState((prev) => {
      const project = prev.projects.find(
        (item) => item.id === prev.activeProjectId
      )
      if (!project) return prev
      const updated = updater(project)
      const projects = prev.projects.map((item) =>
        item.id === updated.id ? updated : item
      )
      const next = { ...prev, projects }
      saveProjectsState(next)
      return next
    })
  }

  function getFirstUnmatchedIndex() {
    for (let i = 0; i < boxes.length; i += 1) {
      if (!(rectConfigs[i]?.include ?? true)) continue
      const rectId = boxes[i]?.rectId
      if (!rectId) continue
      if (tileMatches[rectId]) continue
      return i
    }
    return null
  }

  const areaList = useMemo(
    () =>
      boxes.map((box, index) => ({
        index,
        ...box,
      })),
    [boxes]
  )

  const displayRects = useMemo(() => {
    const withIndex = areaList.map((item) => ({
      ...item,
      include: rectConfigs[item.index]?.include ?? true,
      orderIndex: rectConfigs[item.index]?.orderIndex,
    }))
    const hasManualOrder = withIndex.some(
      (item) => item.include && typeof item.orderIndex === "number"
    )
    if (!hasManualOrder) return withIndex
    return [...withIndex].sort((a, b) => {
      const aOrdered = typeof a.orderIndex === "number" && a.include
      const bOrdered = typeof b.orderIndex === "number" && b.include
      if (aOrdered && bOrdered) {
        return (a.orderIndex as number) - (b.orderIndex as number)
      }
      if (aOrdered) return -1
      if (bOrdered) return 1
      return a.index - b.index
    })
  }, [areaList, rectConfigs])

  function pdfRectToCanvasRect(rect: PdfBox, viewport: PageViewport) {
    const [x1, y1] = viewport.convertToViewportPoint(rect.xPdf, rect.yPdf)
    const [x2, y2] = viewport.convertToViewportPoint(
      rect.xPdf + rect.wPdf,
      rect.yPdf + rect.hPdf
    )
    const x = Math.min(x1, x2)
    const y = Math.min(y1, y2)
    return { x, y, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
  }

  function canvasRectToPdfRect(
    rect: { x: number; y: number; width: number; height: number },
    viewport: PageViewport
  ) {
    const [x1, y1] = viewport.convertToPdfPoint(rect.x, rect.y)
    const [x2, y2] = viewport.convertToPdfPoint(rect.x + rect.width, rect.y + rect.height)
    const xPdf = Math.min(x1, x2)
    const yPdf = Math.min(y1, y2)
    return { xPdf, yPdf, wPdf: Math.abs(x2 - x1), hPdf: Math.abs(y2 - y1) }
  }

  function parsePageNumberFromName(fileName: string) {
    const match = fileName.match(/P(\d{2})/i)
    if (!match) return null
    const value = Number.parseInt(match[1], 10)
    return Number.isFinite(value) && value > 0 ? value : null
  }

  function parseImageSpreadNumber(fileName: string) {
    const match = fileName.match(/-p(\d{1,2})-/i)
    if (!match) return null
    const imgPage = Number.parseInt(match[1], 10)
    if (!Number.isFinite(imgPage) || imgPage <= 0) return null
    return Math.ceil(imgPage / 2)
  }

  function createRectId() {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
    return `rect-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  function ensureRectIds(source: PdfBox[]) {
    let changed = false
    const next = source.map((box) => {
      if (box.rectId) return box
      changed = true
      return { ...box, rectId: createRectId() }
    })
    return changed ? next : source
  }

  function normalizePages(pages?: Record<number, PageData>) {
    if (!pages) return {}
    let changed = false
    const next: Record<number, PageData> = {}
    Object.entries(pages).forEach(([key, value]) => {
      const rects = ensureRectIds(value.boxes ?? [])
      if (rects !== value.boxes) {
        changed = true
        next[Number(key)] = { ...value, boxes: rects }
      } else {
        next[Number(key)] = value
      }
    })
    return changed ? next : pages
  }

  const orderedIncluded = useMemo(() => {
    const included = boxes
      .map((box, index) => ({
        box,
        index,
      }))
      .filter(({ index }) => rectConfigs[index]?.include ?? true)
    if (included.length === 0) return []

    const sorted = [...included].sort((a, b) => {
      if (a.box.yPdf !== b.box.yPdf) return a.box.yPdf - b.box.yPdf
      return a.box.xPdf - b.box.xPdf
    })

    return sorted.map((item, order) => ({
      ...item,
      order: order + 1,
    }))
  }, [boxes, rectConfigs])

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    async function loadImages() {
      if (!currentProject) {
        setImageAssets([])
        return
      }
      const allowed = new Set(currentProject.imageAssetIds ?? [])
      if (allowed.size === 0) {
        setImageAssets([])
        return
      }
      const assets = await listAssets(currentProject.id, "image")
      const entries = assets.filter((asset) => allowed.has(asset.assetId))
      const next = entries.map((asset) => {
        const url = URL.createObjectURL(asset.blob)
        urls.push(url)
        return {
          assetId: asset.assetId,
          name: asset.name,
          url,
          spreadNumber: parseImageSpreadNumber(asset.name),
        }
      })
      if (!cancelled) {
        setImageAssets(next)
      } else {
        urls.forEach((url) => URL.revokeObjectURL(url))
      }
    }
    void loadImages()
    return () => {
      cancelled = true
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [currentProject?.id, currentProject?.imageAssetIds])

  const pageArea = useMemo(() => {
    const size = pageSizeRef.current
    if (!size) return 0
    return size.width * size.height
  }, [pageRendered, boxes.length])

  async function handlePdfChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return
    if (!currentProject) {
      toast.error("Select a project first.")
      event.target.value = ""
      return
    }
    const newEntries: PdfEntry[] = []
    const newPdfIds: string[] = []
    for (const file of files) {
      console.log("PDF selected", file.name, file.size)
      try {
        const fileId = await putAsset(currentProject.id, "pdf", file.name, file)
        newPdfIds.push(fileId)
        const buffer = await file.arrayBuffer()
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise
        const pageNumberFromName = parsePageNumberFromName(file.name)
        pdfDocMapRef.current.set(fileId, doc)
        newEntries.push({
          id: fileId,
          name: file.name,
          pageCount: doc.numPages,
          selectedPage: pageNumberFromName ?? 1,
          pages: {},
          fileId,
        })
      } catch {
        toast.error(`Failed to load PDF: ${file.name}`)
      }
    }

    if (newEntries.length > 0) {
      setPdfs((prev) => [...prev, ...newEntries])
      updateActiveProject((project) => {
        const nextPdfIds = Array.from(
          new Set([...(project.pdfAssetIds ?? []), ...newPdfIds])
        )
        return {
          ...project,
          pdfAssetIds: nextPdfIds,
          updatedAt: new Date().toISOString(),
        }
      })
      if (!selectedPdfId) {
        const first = newEntries[0]
        setSelectedPdfId(first.id)
        pdfRef.current = pdfDocMapRef.current.get(first.id) ?? null
        setPageCount(first.pageCount)
        setPageNumber(first.selectedPage)
        setBoxes([])
        setRectConfigs({})
        setRectPaddingPx(10)
      }
      setPdfStatus(`PDFs loaded: ${newEntries.length}`)
    }

    event.target.value = ""
  }

  async function handleReplacePdf(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !currentProject || !selectedPdfEntry) return
    await putAssetRecord({
      assetId: selectedPdfEntry.id,
      projectId: currentProject.id,
      type: "pdf",
      name: file.name,
      blob: file,
      createdAt: Date.now(),
    })
    const buffer = await file.arrayBuffer()
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise
    pdfDocMapRef.current.set(selectedPdfEntry.id, doc)
    setPdfs((prev) =>
      prev.map((entry) =>
        entry.id === selectedPdfEntry.id
          ? {
              ...entry,
              name: file.name,
              pageCount: doc.numPages,
              selectedPage: Math.min(entry.selectedPage, doc.numPages),
            }
          : entry
      )
    )
    if (selectedPdfId === selectedPdfEntry.id) {
      pdfRef.current = doc
      const nextPage = Math.min(pageNumber, doc.numPages)
      setPageCount(doc.numPages)
      setPageNumber(nextPage)
      setPageRendered(false)
      skipAutoDetectRef.current = true
      await renderPage(nextPage)
    }
    toast.success("PDF replaced (rectangles and matches preserved).")
  }

  async function renderPage(targetPage?: number) {
    try {
      renderTaskRef.current?.cancel()
    } catch {
      // ignore cancel errors
    }
    renderTaskRef.current = null
    const token = ++renderTokenRef.current
    const pdf = pdfRef.current
    const canvas = pdfCanvasRef.current
    if (!pdf || !canvas) {
      throw new Error("PDF not loaded")
    }
    const requestedPage = targetPage ?? pageNumber
    const safePage = Math.min(Math.max(requestedPage, 1), pdf.numPages)
    const page = await pdf.getPage(safePage)
    const baseViewport = page.getViewport({ scale: 1 })
    const MAX_RENDER_H = 850
    const maxWidth = 1100
    const host = renderHostRef.current
    const availableWidth = host?.clientWidth ?? baseViewport.width
    const availableHeight = Math.min(MAX_RENDER_H, baseViewport.height)
    const targetWidth = Math.min(availableWidth, maxWidth, baseViewport.width)
    const scaleW = targetWidth / baseViewport.width
    const scaleH = availableHeight / baseViewport.height
    const scale = Math.max(0.25, Math.min(2, scaleW, scaleH))
    const viewport = page.getViewport({ scale })
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    setViewportCssSize({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) })
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("Canvas 2D context not available")
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const task = page.render({ canvasContext: ctx, viewport, canvas })
    renderTaskRef.current = task
    await task.promise
    if (token !== renderTokenRef.current) return
    viewportRef.current = viewport
    if (Array.isArray(page.view)) {
      const [x1, y1, x2, y2] = page.view
      pageSizeRef.current = { width: x2 - x1, height: y2 - y1 }
    }
    const overlay = overlayCanvasRef.current
    if (overlay) {
      overlay.width = canvas.width
      overlay.height = canvas.height
      const ctx = overlay.getContext("2d")
      if (ctx) {
        overlay.style.width = canvas.style.width
        overlay.style.height = canvas.style.height
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, viewport.width, viewport.height)
      }
    }
    setPageRendered(true)
    drawOverlay(boxes)
  }

  function getPaddedRect(box: PdfBox, padding: number) {
    const viewport = viewportRef.current
    if (!viewport) return { x: 0, y: 0, width: 0, height: 0 }
    const maxW = viewport.width
    const maxH = viewport.height
    const canvasRect = pdfRectToCanvasRect(box, viewport)
    const x = Math.max(0, canvasRect.x - padding)
    const y = Math.max(0, canvasRect.y - padding)
    const width = Math.min(maxW - x, canvasRect.width + padding * 2)
    const height = Math.min(maxH - y, canvasRect.height + padding * 2)
    return { x, y, width, height }
  }

  function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.fillStyle = "#ffffff"
    ctx.strokeStyle = "#111827"
    ctx.lineWidth = 1
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
    ctx.strokeRect(x - size / 2, y - size / 2, size, size)
  }

  function getHandleRects(box: { x: number; y: number; width: number; height: number }) {
    const size = 8
    const x1 = box.x
    const y1 = box.y
    const x2 = box.x + box.width
    const y2 = box.y + box.height
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    return [
      { key: "nw", x: x1, y: y1, size, cursor: "nwse-resize" },
      { key: "ne", x: x2, y: y1, size, cursor: "nesw-resize" },
      { key: "sw", x: x1, y: y2, size, cursor: "nesw-resize" },
      { key: "se", x: x2, y: y2, size, cursor: "nwse-resize" },
      { key: "n", x: cx, y: y1, size, cursor: "ns-resize" },
      { key: "s", x: cx, y: y2, size, cursor: "ns-resize" },
      { key: "w", x: x1, y: cy, size, cursor: "ew-resize" },
      { key: "e", x: x2, y: cy, size, cursor: "ew-resize" },
    ]
  }

  function drawOverlay(current: PdfBox[]) {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const ctx = overlay.getContext("2d")
    if (!ctx) return
    const viewport = viewportRef.current
    if (!viewport) return
    ctx.clearRect(0, 0, viewport.width, viewport.height)
    const baseStroke = "#7c3aed"
    const baseLineWidth = 2.5
    ctx.font = "12px sans-serif"
    current.forEach((box, index) => {
      if (!(rectConfigs[index]?.include ?? true)) return
      const padding = rectConfigs[index]?.paddingOverride ?? rectPaddingPx
      const padded = getPaddedRect(box, padding)
      const isMatched = Boolean(tileMatches[box.rectId])
      ctx.strokeStyle = baseStroke
      ctx.lineWidth = baseLineWidth
      ctx.strokeRect(padded.x, padded.y, padded.width, padded.height)
      ctx.fillStyle = isMatched ? "#16a34a" : baseStroke
      ctx.fillText(`${index + 1}`, padded.x + 4, padded.y + 14)
    })

    const selected = selectedRectIndex !== null ? current[selectedRectIndex] : null
    const hovered = hoverRectIndex !== null ? current[hoverRectIndex] : null

    if (hovered) {
      if (rectConfigs[hoverRectIndex!]?.include ?? true) {
        const padding = rectConfigs[hoverRectIndex!]?.paddingOverride ?? rectPaddingPx
        const padded = getPaddedRect(hovered, padding)
        ctx.save()
        ctx.strokeStyle = "#f59e0b"
        ctx.lineWidth = 3
        ctx.fillStyle = "rgba(245, 158, 11, 0.15)"
        ctx.fillRect(padded.x, padded.y, padded.width, padded.height)
        ctx.strokeRect(padded.x, padded.y, padded.width, padded.height)
        ctx.restore()
      }
    }

    if (selected) {
      if (rectConfigs[selectedRectIndex!]?.include ?? true) {
        const padding = rectConfigs[selectedRectIndex!]?.paddingOverride ?? rectPaddingPx
        const padded = getPaddedRect(selected, padding)
        ctx.save()
        ctx.strokeStyle = "#22c55e"
        ctx.lineWidth = 4.5
        ctx.fillStyle = "rgba(34, 197, 94, 0.18)"
        ctx.fillRect(padded.x, padded.y, padded.width, padded.height)
        ctx.strokeRect(padded.x, padded.y, padded.width, padded.height)
        ctx.restore()
      }
    }

    if (selected) {
      const canvasRect = pdfRectToCanvasRect(selected, viewport)
      const handles = getHandleRects(canvasRect)
      handles.forEach((handle) => {
        drawHandle(ctx, handle.x, handle.y, handle.size)
      })
    }

    if (drawStateRef.current) {
      const { start, current } = drawStateRef.current
      const x = Math.min(start.x, current.x)
      const y = Math.min(start.y, current.y)
      const width = Math.abs(current.x - start.x)
      const height = Math.abs(current.y - start.y)
      ctx.save()
      ctx.strokeStyle = "#0ea5e9"
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(x, y, width, height)
      ctx.restore()
    }
  }

  useEffect(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const raf = requestAnimationFrame(() => drawOverlay(boxes))
    return () => cancelAnimationFrame(raf)
  }, [boxes, hoverRectIndex, selectedRectIndex, rectPaddingPx, rectConfigs, tileMatches])

  function assignMatch(rectId: string, imageId: string) {
    if (!currentProject) return
    if (tileMatches[rectId] === imageId) return
    if (Object.values(tileMatches).includes(imageId)) return
    const nextMatches: Record<string, string> = {
      ...(currentProject.tileMatches ?? {}),
    }
    nextMatches[rectId] = imageId
    updateActiveProject((project) => ({
      ...project,
      tileMatches: nextMatches,
      updatedAt: new Date().toISOString(),
    }))
  }

  function clearMatch(rectId: string) {
    if (!currentProject) return
    if (!tileMatches[rectId]) return
    updateActiveProject((project) => {
      const nextMatches = { ...(project.tileMatches ?? {}) }
      delete nextMatches[rectId]
      return {
        ...project,
        tileMatches: nextMatches,
        updatedAt: new Date().toISOString(),
      }
    })
  }

  function handleOverlayClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (wasResizingRef.current) {
      wasResizingRef.current = false
      return
    }
    const overlay = overlayCanvasRef.current
    if (!overlay || boxes.length === 0) return
    const rect = overlay.getBoundingClientRect()
    const scaleX = overlay.width / rect.width
    const scaleY = overlay.height / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY

    let hitIndex: number | null = null
    let hitArea = Number.POSITIVE_INFINITY
    boxes.forEach((box, index) => {
      if (!(rectConfigs[index]?.include ?? true)) return
      const basePadding = rectConfigs[index]?.paddingOverride ?? rectPaddingPx
      const hitPadding = Math.max(basePadding, 6)
      const padded = getPaddedRect(box, hitPadding)
      const inX = x >= padded.x && x <= padded.x + padded.width
      const inY = y >= padded.y && y <= padded.y + padded.height
      if (inX && inY) {
        const area = padded.width * padded.height
        if (area < hitArea) {
          hitArea = area
          hitIndex = index
        }
      }
    })

    if (hitIndex !== null) {
      selectRectIndex(hitIndex, "overlay-click")
    }
  }

  function handleOverlayContextMenu(event: React.MouseEvent<HTMLCanvasElement>) {
    const overlay = overlayCanvasRef.current
    if (!overlay || boxes.length === 0) return
    const point = getCanvasPoint(event)
    if (!point) return

    let hitIndex: number | null = null
    let hitArea = Number.POSITIVE_INFINITY
    boxes.forEach((box, index) => {
      if (!(rectConfigs[index]?.include ?? true)) return
      const basePadding = rectConfigs[index]?.paddingOverride ?? rectPaddingPx
      const hitPadding = Math.max(basePadding, 6)
      const padded = getPaddedRect(box, hitPadding)
      const inX = point.x >= padded.x && point.x <= padded.x + padded.width
      const inY = point.y >= padded.y && point.y <= padded.y + padded.height
      if (inX && inY) {
        const area = padded.width * padded.height
        if (area < hitArea) {
          hitArea = area
          hitIndex = index
        }
      }
    })

    if (hitIndex === null) return
    event.preventDefault()
    const rectId = boxes[hitIndex]?.rectId
    if (!rectId) return
    if (event.ctrlKey) {
      const nextInclude = !(rectConfigs[hitIndex]?.include ?? true)
      handleToggleInclude(hitIndex, nextInclude)
      return
    }
    if (tileMatches[rectId]) {
      clearMatch(rectId)
    }
  }

  function getCanvasPoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const overlay = overlayCanvasRef.current
    if (!overlay) return null
    const rect = overlay.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function findHandleAtPoint(point: { x: number; y: number }) {
    if (selectedRectIndex === null) return null
    const box = boxes[selectedRectIndex]
    if (!box) return null
    const viewport = viewportRef.current
    if (!viewport) return null
    const canvasRect = pdfRectToCanvasRect(box, viewport)
    const handles = getHandleRects(canvasRect)
    for (const handle of handles) {
      const half = handle.size / 2
      const inX = point.x >= handle.x - half && point.x <= handle.x + half
      const inY = point.y >= handle.y - half && point.y <= handle.y + half
      if (inX && inY) {
        return handle
      }
    }
    return null
  }

  function handleOverlayMouseDown(event: React.MouseEvent<HTMLCanvasElement>) {
    if (event.shiftKey) {
      const point = getCanvasPoint(event)
      if (!point) return
      drawStateRef.current = {
        start: point,
        current: point,
      }
      setOverlayCursor("crosshair")
      return
    }
    if (selectedRectIndex === null) return
    const point = getCanvasPoint(event)
    if (!point) return
    const handle = findHandleAtPoint(point)
    if (!handle) return
    const rect = boxes[selectedRectIndex]
    const viewport = viewportRef.current
    if (!viewport) return
    const canvasRect = pdfRectToCanvasRect(rect, viewport)
    resizeStateRef.current = {
      index: selectedRectIndex,
      handle: handle.key,
      startX: point.x,
      startY: point.y,
      rect: { ...canvasRect },
    }
    setOverlayCursor(handle.cursor)
  }

  function handleOverlayMouseMove(event: React.MouseEvent<HTMLCanvasElement>) {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const point = getCanvasPoint(event)
    if (!point) return

    if (drawStateRef.current) {
      drawStateRef.current.current = point
      setOverlayCursor("crosshair")
      drawOverlay(boxes)
      return
    }

    const resizing = resizeStateRef.current
    if (resizing) {
      const minSize = 40
      const viewport = viewportRef.current
      if (!viewport) return
      const maxW = viewport.width
      const maxH = viewport.height
      const dx = point.x - resizing.startX
      const dy = point.y - resizing.startY
      let { x, y, width, height } = resizing.rect

      if (resizing.handle.includes("n")) {
        y = Math.min(y + dy, y + height - minSize)
        height = height - dy
      }
      if (resizing.handle.includes("s")) {
        height = Math.max(minSize, height + dy)
      }
      if (resizing.handle.includes("w")) {
        x = Math.min(x + dx, x + width - minSize)
        width = width - dx
      }
      if (resizing.handle.includes("e")) {
        width = Math.max(minSize, width + dx)
      }

      x = Math.max(0, Math.min(x, maxW - minSize))
      y = Math.max(0, Math.min(y, maxH - minSize))
      width = Math.min(width, maxW - x)
      height = Math.min(height, maxH - y)

      const pdfRect = canvasRectToPdfRect({ x, y, width, height }, viewport)
      setBoxes((prev) => {
        const next = [...prev]
        const target = next[resizing.index]
        if (!target) return prev
        next[resizing.index] = {
          ...target,
          ...pdfRect,
          areaPdf: pdfRect.wPdf * pdfRect.hPdf,
        }
        return next
      })
      wasResizingRef.current = true
      return
    }

    const handle = findHandleAtPoint(point)
    setOverlayCursor(handle?.cursor ?? "default")
  }

  function handleOverlayMouseUp() {
    if (resizeStateRef.current) {
      resizeStateRef.current = null
      setOverlayCursor("default")
    }
    if (drawStateRef.current) {
      const viewport = viewportRef.current
      const { start, current } = drawStateRef.current
      drawStateRef.current = null
      setOverlayCursor("default")
      if (!viewport) return
      const x = Math.min(start.x, current.x)
      const y = Math.min(start.y, current.y)
      const width = Math.abs(current.x - start.x)
      const height = Math.abs(current.y - start.y)
      if (width < 10 || height < 10) return
      const pdfRect = canvasRectToPdfRect({ x, y, width, height }, viewport)
      const rectId = createRectId()
      setBoxes((prev) => {
        const nextIndex = prev.length
        setRectConfigs((prevConfigs) => ({
          ...prevConfigs,
          [nextIndex]: { include: true },
        }))
        selectRectIndex(nextIndex, "draw-create")
        return [
          ...prev,
          {
            rectId,
            pageNumber,
            ...pdfRect,
            areaPdf: pdfRect.wPdf * pdfRect.hPdf,
          },
        ]
      })
    }
  }

  async function handleDetectTiles() {
    if (!pdfRef.current) {
      toast.error("Upload a PDF first.")
      return
    }
    const token = ++detectTokenRef.current
    setDetecting(true)
    try {
      await loadOpenCv()
      if (!pageRendered) {
        await renderPage()
      }
      const canvas = pdfCanvasRef.current
      if (!canvas) {
        throw new Error("PDF canvas missing")
      }
      const viewport = viewportRef.current
      if (!viewport) {
        throw new Error("Viewport not ready")
      }
      const detected = await detectTilesInCanvas(canvas, {
        cannyLow,
        cannyHigh,
        minAreaPercent,
        dilateIterations,
      })
      const dpr = window.devicePixelRatio || 1
      if (token !== detectTokenRef.current) return
      const converted = detected.map((rect) => {
        const cssRect = {
          x: rect.x / dpr,
          y: rect.y / dpr,
          width: rect.width / dpr,
          height: rect.height / dpr,
        }
        const pdfRect = canvasRectToPdfRect(cssRect, viewport)
        return {
          rectId: createRectId(),
          pageNumber,
          ...pdfRect,
          areaPdf: pdfRect.wPdf * pdfRect.hPdf,
        }
      })
      setBoxes(converted)
      setRectConfigs(
        Object.fromEntries(
          converted.map((_, index) => [index, { include: true }])
        )
      )
      setHoverRectIndex(null)
      drawOverlay(converted)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Tile detection failed."
      if (token === detectTokenRef.current) {
        toast.error(message)
      }
    } finally {
      if (token === detectTokenRef.current) {
        setDetecting(false)
      }
    }
  }

  async function runAutoDetectIfNeeded(entry: PdfEntry | null) {
    if (!pageRendered) return
    if (!entry) return
    if (detecting || rendering) return
    if (isAutoDetectingRef.current) return
    if (skipAutoDetectRef.current) {
      skipAutoDetectRef.current = false
      return
    }

    const pageData = entry.pages[entry.selectedPage]
    if (pageData && pageData.boxes && pageData.boxes.length > 0) return

    isAutoDetectingRef.current = true
    try {
      await handleDetectTiles()
    } finally {
      isAutoDetectingRef.current = false
    }
  }

  async function handleLoadOpenCv() {
    setOpenCvStatus("loading")
    setOpenCvError(null)
    try {
      await loadOpenCv()
      setOpenCvStatus("ready")
    } catch (error) {
      setOpenCvStatus("failed")
      setOpenCvError(error instanceof Error ? error.message : "Failed to load OpenCV")
      throw error
    }
  }

  async function handleRenderPage(targetPage?: number) {
    if (!pdfRef.current) {
      toast.error("Upload a PDF first.")
      return
    }
    setRendering(true)
    try {
      await renderPage(targetPage)
      setBoxes([])
      setRectConfigs({})
      setHoverRectIndex(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      const isCancelled =
        message.toLowerCase().includes("cancel") ||
        (error as { name?: string }).name === "RenderingCancelledException"
      if (!isCancelled) {
        toast.error("Failed to render page.")
      }
    } finally {
      setRendering(false)
    }
  }

  async function goToPage(nextPage: number) {
    if (!selectedPdfEntry) return
    const clamped = Math.min(Math.max(nextPage, 1), selectedPdfEntry.pageCount)
    setPageNumber(clamped)
    setPageRendered(false)
    loadPageState(selectedPdfEntry, clamped)
    await handleRenderPage(clamped)
  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName?.toLowerCase()
      return tag === "input" || tag === "textarea" || el.isContentEditable
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return
      if (isTypingTarget(event.target)) return
      if (selectedRectIndex === null) return
      const nextInclude = !(rectConfigs[selectedRectIndex]?.include ?? true)
      handleToggleInclude(selectedRectIndex, nextInclude)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedRectIndex, rectConfigs])

  function handleToggleInclude(index: number, include: boolean) {
    setRectConfigs((prev) => ({
      ...prev,
      [index]: {
        include,
        paddingOverride: prev[index]?.paddingOverride,
        orderIndex: prev[index]?.orderIndex,
      },
    }))
    if (!include) {
      const rectId = boxes[index]?.rectId
      if (rectId && tileMatches[rectId]) {
        clearMatch(rectId)
      }
    }
  }

  function adjustPadding(index: number, delta: number) {
    setRectConfigs((prev) => {
      const current = prev[index]?.paddingOverride ?? rectPaddingPx
      const nextValue = Math.max(0, Math.min(200, current + delta))
      return {
        ...prev,
        [index]: { include: prev[index]?.include ?? true, paddingOverride: nextValue },
      }
    })
  }

  function resetPadding(index: number) {
    setRectConfigs((prev) => ({
      ...prev,
      [index]: {
        include: prev[index]?.include ?? true,
        orderIndex: prev[index]?.orderIndex,
      },
    }))
  }

  function handleCommitDetected() {
    const pageSize = pageSizeRef.current
    const viewport = viewportRef.current
    if (!viewport || !pageSize) return
    const committed = orderedIncluded.map((item) => {
      const padding = rectConfigs[item.index]?.paddingOverride ?? rectPaddingPx
      const padded = getPaddedRect(item.box, padding)
      const pdfRect = canvasRectToPdfRect(padded, viewport)
      return {
        page: pageNumber,
        x: pdfRect.xPdf,
        y: pdfRect.yPdf,
        width: pdfRect.wPdf,
        height: pdfRect.hPdf,
        order: item.order,
        areaPercent:
          pageSize.width && pageSize.height
            ? (pdfRect.wPdf * pdfRect.hPdf) / (pageSize.width * pageSize.height)
            : 0,
      }
    })
    console.log("Committed detected tiles", committed)
  }

  function parseSpreadNumber(name: string | undefined) {
    if (!name) return null
    const match = name.match(/(?:^|\s|-)P(\d{1,2})(?:\D|$)/i)
    if (!match) return null
    const value = Number(match[1])
    return Number.isFinite(value) ? value : null
  }

  function buildExportMap() {
    return pdfs.map((entry, index) => {
      const pageKeys = Object.keys(entry.pages)
      const firstKey = pageKeys[0]
      const data = firstKey ? entry.pages[Number(firstKey)] : undefined
      const boxes = data
        ? data.boxes.map((box, index) => ({
            rectId: box.rectId,
            xPdf: box.xPdf,
            yPdf: box.yPdf,
            wPdf: box.wPdf,
            hPdf: box.hPdf,
            include: data.rectConfigs[index]?.include ?? true,
            orderIndex: data.rectConfigs[index]?.orderIndex,
            matchedImageId: tileMatches[box.rectId] ?? null,
          }))
        : []
      return {
        pdfId: entry.id,
        filename: entry.name,
        spreadNumber: parseSpreadNumber(entry.name) ?? index + 1,
        pages: {
          "1": {
            pageNumber: 1,
            pageWidth: data?.pageWidth,
            pageHeight: data?.pageHeight,
            boxes,
          },
        },
      }
    })
  }

  function buildExportByPdfAssetId() {
    const map: Record<string, ReturnType<typeof buildExportMap>[number]> = {}
    const entries = buildExportMap()
    for (const entry of entries) {
      map[entry.pdfId] = entry
    }
    return map
  }

  function handleFinishDetection() {
    if (!currentProject) return
    const exportMap = buildExportMap()
    const exportByPdfAssetId = buildExportByPdfAssetId()
    updateActiveProject((project) => ({
      ...project,
      pdfDetection: {
        ...(project.pdfDetection ?? {}),
        export: exportMap,
        byPdfAssetId: exportByPdfAssetId,
      },
      stage: "catalogue",
      updatedAt: new Date().toISOString(),
    }))
  }

  async function clearPdfState() {
    if (!currentProject) return
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    hydrationDoneRef.current = false
    detectTokenRef.current += 1
    try {
      renderTaskRef.current?.cancel()
    } catch {
      // ignore cancel errors
    }
    renderTaskRef.current = null
    setPdfs([])
    setSelectedPdfId(null)
    pdfRef.current = null
    pdfDocMapRef.current.clear()
    setPageCount(1)
    setPageNumber(1)
    setBoxes([])
    setRectConfigs({})
    setRectPaddingPx(10)
    setHoverRectIndex(null)
    selectRectIndex(null, "clear:reset-selection")
    setPageRendered(false)
    setPdfStatus("")
    updateActiveProject((project) => ({
      ...project,
      pdfAssetIds: [],
      pdfDetection: {},
      updatedAt: new Date().toISOString(),
    }))
    const pdfAssets = await listAssets(currentProject.id, "pdf")
    await Promise.all(pdfAssets.map((asset) => deleteAsset(asset.assetId)))
    const canvas = pdfCanvasRef.current
    if (canvas) {
      const ctx = canvas.getContext("2d")
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    const overlay = overlayCanvasRef.current
    if (overlay) {
      const ctx = overlay.getContext("2d")
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height)
    }
    hydrationDoneRef.current = true
  }

  async function handleSelectPdf(entry: PdfEntry) {
    syncCurrentPdfState()
    setSelectedPdfId(entry.id)
    const doc = pdfDocMapRef.current.get(entry.id)
    if (!doc) {
      toast.error("PDF data not loaded. Please re-upload the PDF.")
      return
    }
    pdfRef.current = doc ?? null
    setPageCount(entry.pageCount)
    setPageNumber(entry.selectedPage)
    loadPageState(entry, entry.selectedPage)
    try {
      const safePage = Math.min(Math.max(entry.selectedPage, 1), doc.numPages)
      await renderPage(safePage)
      drawOverlay(entry.pages[safePage]?.boxes ?? [])
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      const isCancelled =
        message.toLowerCase().includes("cancel") ||
        (error as { name?: string }).name === "RenderingCancelledException"
      if (!isCancelled) {
        toast.error("Failed to render page.")
      }
    }
  }

  function syncCurrentPdfState() {
    if (!hydrationDoneRef.current) return
    if (!selectedPdfId) return
    if (isSyncingRef.current) return
    setPdfs((prev) =>
      prev.map((entry) => {
        if (entry.id !== selectedPdfId) return entry
        const pageData: PageData = {
          boxes,
          rectConfigs,
          rectPaddingPx,
          pageWidth: pageSizeRef.current?.width,
          pageHeight: pageSizeRef.current?.height,
        }
        return {
          ...entry,
          selectedPage: pageNumber,
          pages: {
            ...entry.pages,
            [pageNumber]: pageData,
          },
        }
      })
    )
  }

  function loadPageState(entry: PdfEntry, page: number) {
    isSyncingRef.current = true
    const data = entry.pages[page]
    const nextBoxes = data?.boxes ? ensureRectIds(data.boxes) : []
    setBoxes(nextBoxes)
    setRectConfigs(data?.rectConfigs ?? {})
    setRectPaddingPx(data?.rectPaddingPx ?? 10)
    setHoverRectIndex(null)
    setPageRendered(false)
    queueMicrotask(() => {
      isSyncingRef.current = false
    })
  }

  useEffect(() => {
    if (!selectedPdfId) return
    syncCurrentPdfState()
  }, [
    boxes,
    rectConfigs,
    rectPaddingPx,
    pageNumber,
    selectedPdfId,
  ])

  useEffect(() => {
    if (!hydrationDoneRef.current) return
    if (!currentProject) return
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
    }
    persistTimerRef.current = window.setTimeout(() => {
      const toPersist = pdfs.map(({ id, name, pageCount, selectedPage, pages, fileId }) => ({
        id,
        name,
        pageCount,
        selectedPage,
        pages,
        fileId,
      }))
      updateActiveProject((project) => ({
        ...project,
        pdfDetection: {
          ...(project.pdfDetection ?? {}),
          pdfs: toPersist,
        },
        updatedAt: new Date().toISOString(),
      }))
      persistTimerRef.current = null
    }, 300)
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current)
      }
    }
  }, [pdfs, currentProject?.id])

  useEffect(() => {
    let cancelled = false
    async function hydrateProject() {
      hydrationDoneRef.current = false
      pdfRef.current = null
      pdfDocMapRef.current.clear()
      setPdfs([])
      setSelectedPdfId(null)
      if (!currentProject) {
        hydrationDoneRef.current = true
        return
      }
      const detectionState = (currentProject.pdfDetection ?? {}) as {
        pdfs?: PdfEntry[]
      }
      const existingEntries = Array.isArray(detectionState.pdfs)
        ? detectionState.pdfs
        : []
      const existingByFileId = new Map<string, PdfEntry>()
      existingEntries.forEach((entry) => {
        if (entry.fileId) {
          existingByFileId.set(entry.fileId, entry)
        }
      })
      const hydrated: PdfEntry[] = []
      for (const assetId of currentProject.pdfAssetIds) {
        const existing = existingByFileId.get(assetId)
        try {
          const stored = await getAsset(assetId)
          if (!stored || stored.type !== "pdf") {
            hydrated.push({
              id: assetId,
              name: existing?.name ?? stored?.name ?? "Missing PDF",
              pageCount: existing?.pageCount ?? 1,
              selectedPage: existing?.selectedPage ?? 1,
              pages: normalizePages(existing?.pages),
              fileId: assetId,
              missing: true,
            })
            continue
          }
          const buffer = await stored.blob.arrayBuffer()
          const doc = await pdfjsLib.getDocument({ data: buffer }).promise
          pdfDocMapRef.current.set(assetId, doc)
          const pageNumberFromName = parsePageNumberFromName(stored.name)
          hydrated.push({
            id: assetId,
            name: stored.name,
            pageCount: doc.numPages,
            selectedPage: existing?.selectedPage ?? pageNumberFromName ?? 1,
            pages: normalizePages(existing?.pages),
            fileId: assetId,
            missing: false,
          })
        } catch {
          hydrated.push({
            id: assetId,
            name: existing?.name ?? "Missing PDF",
            pageCount: existing?.pageCount ?? 1,
            selectedPage: existing?.selectedPage ?? 1,
            pages: normalizePages(existing?.pages),
            fileId: assetId,
            missing: true,
          })
        }
      }
      if (cancelled) return
      setPdfs(hydrated)
      const first = hydrated[0]
      if (first) {
        setSelectedPdfId(first.id)
        if (pdfDocMapRef.current.has(first.id)) {
          await handleSelectPdf(first)
        }
      }
      hydrationDoneRef.current = true
    }
    void hydrateProject()
    return () => {
      cancelled = true
    }
  }, [currentProject?.id, currentProject?.pdfAssetIds])

  const selectedPdfEntry = useMemo(
    () => pdfs.find((entry) => entry.id === selectedPdfId) ?? null,
    [pdfs, selectedPdfId]
  )

  const rectIdByImageId = useMemo(() => {
    const map = new Map<string, string>()
    boxes.forEach((box) => {
      const imageId = tileMatches[box.rectId]
      if (imageId) {
        map.set(imageId, box.rectId)
      }
    })
    return map
  }, [boxes, tileMatches])

  const currentSpreadNumber = useMemo(() => {
    if (!selectedPdfEntry) return null
    return parseSpreadNumber(selectedPdfEntry.name)
  }, [selectedPdfEntry])

  const visibleImages = useMemo(() => {
    if (showAllImages || !currentSpreadNumber) return imageAssets
    return imageAssets.filter((asset) => asset.spreadNumber === currentSpreadNumber)
  }, [imageAssets, showAllImages, currentSpreadNumber])

  const sortedVisibleImages = useMemo(() => {
    return [...visibleImages].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    )
  }, [visibleImages])

  const filteredImages = useMemo(() => {
    if (showMatched) return sortedVisibleImages
    return sortedVisibleImages.filter((image) => !rectIdByImageId.has(image.assetId))
  }, [showMatched, sortedVisibleImages, rectIdByImageId])

  const matchedCount = useMemo(() => {
    return sortedVisibleImages.filter((image) => rectIdByImageId.has(image.assetId)).length
  }, [sortedVisibleImages, rectIdByImageId])

  const hasUnmatchedRect = useMemo(() => {
    return boxes.some((box, index) => {
      if (!(rectConfigs[index]?.include ?? true)) return false
      return !tileMatches[box.rectId]
    })
  }, [boxes, rectConfigs, tileMatches])

  useEffect(() => {
    if (!selectedPdfId) return
    if (lastPdfIdRef.current === selectedPdfId) return
    lastPdfIdRef.current = selectedPdfId
    if (boxes.length === 0) return
    const nextIndex = getFirstUnmatchedIndex()
    if (nextIndex === null) return
    selectRectIndex(nextIndex, "pdf-change:first-unmatched")
  }, [selectedPdfId, boxes, rectConfigs, tileMatches])

  useEffect(() => {
    void runAutoDetectIfNeeded(selectedPdfEntry)
  }, [pageRendered, selectedPdfId, pageNumber, selectedPdfEntry?.pages])

  useEffect(() => {
    const host = renderHostRef.current
    if (!host) return
    const observer = new ResizeObserver(() => {
      if (!pdfRef.current || !pageRendered) return
      void renderPage(pageNumber)
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [pageNumber, pageRendered])

  const selectedPdfIndex = useMemo(
    () => (selectedPdfId ? pdfs.findIndex((entry) => entry.id === selectedPdfId) : -1),
    [pdfs, selectedPdfId]
  )

  const detectionSummary = useMemo(() => {
    if (!currentProject) return []
    const detectionState = currentProject.pdfDetection as {
      byPdfAssetId?: Record<string, {
        pdfId: string
        filename?: string
        spreadNumber?: number
        pages: Record<string, {
          pageNumber: number
          pageWidth?: number
          pageHeight?: number
          boxes: Array<{ include?: boolean; orderIndex?: number }>
        }>
      }>
      export?: Array<{
        pdfId: string
        filename?: string
        spreadNumber?: number
        pages: Record<string, {
          pageNumber: number
          pageWidth?: number
          pageHeight?: number
          boxes: Array<{ include?: boolean; orderIndex?: number }>
        }>
      }>
    }
    return currentProject.pdfAssetIds.map((assetId, index) => {
      const entry =
        detectionState.byPdfAssetId?.[assetId] ??
        detectionState.export?.find((item) => item.pdfId === assetId)
      const pageKeys = entry ? Object.keys(entry.pages ?? {}) : []
      const pages = entry?.pages ?? {}
      const boxes = Object.values(pages).flatMap((page) => page.boxes ?? [])
      const included = boxes.filter((box) => box.include ?? true)
      const ordered = included.filter((box) => Number.isFinite(box.orderIndex))
      const hasSize = Object.values(pages).some(
        (page) => Number.isFinite(page.pageWidth) && Number.isFinite(page.pageHeight)
      )
      const name =
        pdfs.find((pdf) => pdf.id === assetId)?.name ??
        entry?.filename ??
        `PDF ${index + 1}`
      return {
        assetId,
        name,
        spreadNumber: entry?.spreadNumber,
        exportPresent: Boolean(entry),
        totalCount: boxes.length,
        includedCount: included.length,
        orderedCount: ordered.length,
        hasSize,
        pageKeys,
      }
    })
  }, [currentProject, pdfs])

  async function goToPdfByIndex(index: number) {
    if (hasUnmatchedRect) {
      const nextIndex = getFirstUnmatchedIndex()
      if (nextIndex !== null) {
        selectRectIndex(nextIndex, "nav-guard:first-unmatched")
      }
      return
    }
    const entry = pdfs[index]
    if (!entry) return
    await handleSelectPdf(entry)
  }

  function downloadDetectionExport() {
    if (!currentProject) return
    const payload = {
      projectId: currentProject.id,
      projectName: currentProject.name,
      pdfDetection: currentProject.pdfDetection ?? {},
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${currentProject.name || "catalogue"}-pdf-detection.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  if (!currentProject) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">PDF Tile Detection (POC)</h2>
        <p className="text-sm text-muted-foreground">
          Select a project to view its PDF detection data.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">PDF Tile Detection (POC)</h2>
        <p className="text-sm text-muted-foreground">
          Detect tile rectangles directly from a PDF page image.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Detection Controls</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {hasUnmatchedRect ? (
                <div className="flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Unmatched rects — review or remove
                </div>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => goToPdfByIndex(selectedPdfIndex - 1)}
                disabled={selectedPdfIndex <= 0}
              >
                Previous Page
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => goToPdfByIndex(selectedPdfIndex + 1)}
                disabled={selectedPdfIndex < 0 || selectedPdfIndex >= pdfs.length - 1}
              >
                Next Page
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setAdvancedOpen((prev) => !prev)}
                title={advancedOpen ? "Hide advanced settings" : "Show advanced settings"}
                aria-label={advancedOpen ? "Hide advanced settings" : "Show advanced settings"}
              >
                {advancedOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {SHOW_EXPORT_SUMMARY ? (
          <Card className="mb-4">
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
                Project: <span className="text-foreground">{currentProject.name}</span> ({currentProject.id})
              </div>
              <div className="text-muted-foreground">
                PDFs: <span className="text-foreground">{currentProject.pdfAssetIds.length}</span>
              </div>
              {isDev && detectionSummary.length > 0 ? (
                <div className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">Spread Index Audit</div>
                  {(() => {
                    const sorted = [...detectionSummary].sort((a, b) => {
                      const aNum = a.spreadNumber ?? Number.POSITIVE_INFINITY
                      const bNum = b.spreadNumber ?? Number.POSITIVE_INFINITY
                      return aNum - bNum
                    })
                    const numbers = sorted
                      .map((row) => row.spreadNumber)
                      .filter((value): value is number => typeof value === "number")
                    const duplicates = numbers.filter(
                      (value, index, arr) => arr.indexOf(value) !== index
                    )
                    const max = numbers.length > 0 ? Math.max(...numbers) : 0
                    const gaps = []
                    for (let i = 1; i <= max; i += 1) {
                      if (!numbers.includes(i)) gaps.push(i)
                    }
                    return (
                      <>
                        <div className="mt-1">
                          {sorted.map((row) => (
                            <div key={row.assetId}>
                              #{row.spreadNumber ?? "?"} → {row.name} → {row.assetId} | Included{" "}
                              {row.includedCount} | Ordered {row.orderedCount}
                            </div>
                          ))}
                        </div>
                        {duplicates.length > 0 ? (
                          <div className="mt-2 text-destructive">
                            Duplicates: {Array.from(new Set(duplicates)).join(", ")}
                          </div>
                        ) : null}
                        {gaps.length > 0 ? (
                          <div className="text-destructive">Gaps: {gaps.join(", ")}</div>
                        ) : null}
                      </>
                    )
                  })()}
                </div>
              ) : null}
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
                          Export: {row.exportPresent ? "yes" : "no"} | Spread:{" "}
                          {row.spreadNumber ?? "?"} | Total: {row.totalCount} | Included: {row.includedCount} | Ordered:{" "}
                          {row.orderedCount} | Page size: {row.hasSize ? "yes" : "no"} | keys:{" "}
                          {row.pageKeys.length ? row.pageKeys.join(",") : "none"}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          ) : null}
          <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr_360px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Catalogue PDF</Label>
                <Input type="file" accept="application/pdf" multiple onChange={handlePdfChange} />
                {pdfStatus ? (
                  <p className="text-xs text-muted-foreground">{pdfStatus}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>PDF list</Label>
                  <AlertDialog open={replacePdfOpen} onOpenChange={setReplacePdfOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!selectedPdfEntry}
                      >
                        Replace PDF
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Replace PDF file?</AlertDialogTitle>
                        <AlertDialogDescription>
                          <div className="space-y-2">
                            <div>This will replace the PDF for this slot.</div>
                            <div>All existing rectangles and tile matches will be preserved.</div>
                            <div>If the new PDF layout differs, rectangle alignment may need adjustment.</div>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            setReplacePdfOpen(false)
                            replacePdfInputRef.current?.click()
                          }}
                        >
                          Replace PDF
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Input
                    ref={replacePdfInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={handleReplacePdf}
                    className="hidden"
                  />
                </div>
                <div className="max-h-[180px] overflow-auto rounded-md border border-border bg-background p-2 text-xs">
                  {pdfs.length === 0 ? (
                    <div className="text-muted-foreground">No PDFs loaded.</div>
                  ) : (
                    pdfs.map((entry) => {
                      const pageData = entry.pages[entry.selectedPage]
                      const includedRects = (pageData?.boxes ?? [])
                        .map((box, index) => ({
                          rectId: box.rectId,
                          include: pageData?.rectConfigs?.[index]?.include ?? true,
                        }))
                        .filter((item) => item.include)
                      const matchedRects = includedRects.filter(
                        (item) => item.rectId && tileMatches[item.rectId]
                      )
                      const unmatchedCount = includedRects.length - matchedRects.length
                      const exportPresent = Boolean(
                        (currentProject?.pdfDetection as { byPdfAssetId?: Record<string, unknown> })
                          ?.byPdfAssetId?.[entry.id]
                      )
                      const statusLabel =
                        includedRects.length === 0
                          ? "No tiles"
                          : unmatchedCount === 0
                          ? "Matched"
                          : "Unmatched"
                      return (
                        <div
                          key={entry.id}
                          className={`cursor-pointer rounded px-2 py-1 ${
                            selectedPdfId === entry.id ? "bg-emerald-100" : "hover:bg-muted"
                          }`}
                          onClick={() => handleSelectPdf(entry)}
                        >
                          <div className="font-medium">{entry.name}</div>
                          <div className="text-muted-foreground">
                            {entry.pageCount} pages   Page {entry.selectedPage}  {" "}
                            Export: {exportPresent ? "yes" : "no"} | Total: {pageData?.boxes?.length ?? 0} | Included: {includedRects.length} | Matched: {matchedRects.length} | Unmatched: {unmatchedCount} | {statusLabel}
                            {entry.missing ? " • Missing file" : ""}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive">
                      Clear PDFs
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all PDF uploads?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove all uploaded PDFs and detection data from this tool.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={clearPdfState}>
                        Clear PDFs
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="space-y-2">
                <Label>Page number</Label>
                <Input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={pageNumber}
                  onChange={(event) => {
                    const nextPage = Number(event.target.value)
                    void goToPage(nextPage)
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRenderPage()}
                disabled={rendering}
              >
                {rendering ? "Rendering..." : "Render Page"}
              </Button>
              <Button type="button" variant="outline" onClick={handleLoadOpenCv}>
                Load OpenCV
              </Button>
              {advancedOpen ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Box padding (px)</Label>
                    <Input
                      type="range"
                      min={0}
                      max={40}
                      step={1}
                      value={rectPaddingPx}
                      onChange={(event) => setRectPaddingPx(Number(event.target.value))}
                    />
                    <div className="text-xs text-muted-foreground">
                      Current: {rectPaddingPx}px
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Canny low</Label>
                    <Input
                      type="number"
                      min={1}
                      max={255}
                      value={cannyLow}
                      onChange={(event) => setCannyLow(Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Canny high</Label>
                    <Input
                      type="number"
                      min={1}
                      max={255}
                      value={cannyHigh}
                      onChange={(event) => setCannyHigh(Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Min area (%)</Label>
                    <Input
                      type="number"
                      min={0.1}
                      max={20}
                      step={0.1}
                      value={minAreaPercent}
                      onChange={(event) => setMinAreaPercent(Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dilate iterations</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={dilateIterations}
                      onChange={(event) => setDilateIterations(Number(event.target.value))}
                    />
                  </div>
                </div>
              ) : null}
              <Button type="button" onClick={handleDetectTiles} disabled={detecting || !pageRendered}>
                {detecting ? "Detecting..." : "Re-detect tiles"}
              </Button>
              <div className="text-xs text-muted-foreground">
                Page status: {boxes.length > 0 ? "Detected" : "No detections"}{" "}
                {hasUnmatchedRect ? "Unmatched" : "Matched"}
              </div>
              <Button type="button" variant="secondary" onClick={handleCommitDetected} disabled={orderedIncluded.length === 0}>
                Commit detected tiles
              </Button>
              <Button type="button" onClick={handleFinishDetection} disabled={pdfs.length === 0}>
                Finish detection
              </Button>
              <p className="text-xs text-muted-foreground">
                OpenCV:{" "}
                {opencvStatus === "loading"
                  ? "Loading..."
                  : opencvStatus === "ready"
                  ? "Ready"
                  : opencvStatus === "failed"
                  ? `Failed: ${opencvError ?? "error"}`
                  : "Not loaded"}
              </p>
            </div>
            <div className="space-y-3 min-w-0 max-w-[100vh] mx-auto w-full">
              <div className="relative w-full min-w-0 rounded-md border border-border bg-muted/20 p-2">
                <div ref={renderHostRef} className="w-full flex justify-center">
                  <div
                    className="relative"
                    style={{
                      width: `${viewportCssSize.width}px`,
                      height: `${viewportCssSize.height}px`,
                    }}
                  >
                    <canvas ref={pdfCanvasRef} className="absolute left-0 top-0 block" />
                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute left-0 top-0 block"
                      style={{ cursor: overlayCursor }}
                      onClick={handleOverlayClick}
                      onContextMenu={handleOverlayContextMenu}
                      onMouseDown={handleOverlayMouseDown}
                      onMouseMove={handleOverlayMouseMove}
                      onMouseUp={handleOverlayMouseUp}
                      onMouseLeave={handleOverlayMouseUp}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <Card className="flex max-h-[850px] flex-col">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>Match Tiles</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowAllImages((prev) => !prev)}
                      >
                        {showAllImages ? "Show current spread" : "Show all images"}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setShowMatched((prev) => !prev)}
                        title={showMatched ? "Hide matched" : "Show matched"}
                        aria-label={showMatched ? "Hide matched" : "Show matched"}
                      >
                        {showMatched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex max-h-[850px] flex-1 flex-col gap-3 overflow-y-auto">
                  <p className="text-xs text-muted-foreground">
                    Select a rectangle, then click a tile image to assign. Right-click a rect to clear.
                  </p>
                  <div className="text-[11px] text-muted-foreground">
                    Showing {filteredImages.length} of {sortedVisibleImages.length} (
                    {matchedCount} matched)
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {filteredImages.length === 0 ? (
                      <div className="col-span-full text-xs text-muted-foreground">
                        No images for this spread.
                      </div>
                    ) : (
                      filteredImages.map((image) => {
                        const rectId = rectIdByImageId.get(image.assetId)
                        const matchedIndex = rectId
                          ? boxes.findIndex((box) => box.rectId === rectId)
                          : -1
                        const isMatched = rectId !== undefined
                        return (
                          <button
                            key={image.assetId}
                            type="button"
                            className={`flex flex-col items-start gap-1 rounded-md border px-2 py-2 text-left text-xs transition-opacity ${
                              isMatched ? "border-emerald-500 bg-emerald-50" : "border-border hover:bg-muted"
                            }`}
                            onClick={() => {
                              const matchedRectId = Object.entries(tileMatches).find(
                                ([, imageId]) => imageId === image.assetId
                              )?.[0]
                              if (matchedRectId) {
                                const matchedIdx = boxes.findIndex((box) => box.rectId === matchedRectId)
                                if (matchedIdx >= 0) {
                                  selectRectIndex(matchedIdx, "tile-click:matched-select")
                                }
                                return
                              }
                              const selected = selectedRectIndex !== null ? boxes[selectedRectIndex] : null
                              const selectedInclude =
                                selectedRectIndex !== null
                                  ? rectConfigs[selectedRectIndex]?.include ?? true
                                  : false
                              if (!selected || !selectedInclude) {
                                toast.message("Select a rect first")
                                return
                              }
                              assignMatch(selected.rectId, image.assetId)
                            }}
                          >
                            <img
                              src={image.url}
                              alt={image.name}
                              className="h-28 w-full rounded object-contain bg-muted"
                            />
                            <div className="w-full truncate">{image.name}</div>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge variant={isMatched ? "default" : "outline"}>
                                {isMatched ? "Matched" : "Unmatched"}
                              </Badge>
                              {matchedIndex >= 0 ? (
                                <Badge variant="secondary">Rect {matchedIndex + 1}</Badge>
                              ) : null}
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
              {SHOW_DETECTED_BOXES ? (
                <div className="space-y-2">
                  <Label>Detected boxes</Label>
                  <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-background p-2 text-xs">
                    {displayRects.length === 0 ? (
                      <div className="text-muted-foreground">No boxes detected.</div>
                    ) : (
                      displayRects.map((box) => (
                        <div
                          key={`${box.index}-${box.xPdf}-${box.yPdf}`}
                          ref={(el) => {
                            if (el) listItemRefs.current.set(box.index, el)
                          }}
                          className={`cursor-pointer rounded px-2 py-1 ${
                            selectedRectIndex === box.index
                              ? "bg-emerald-100"
                              : hoverRectIndex === box.index
                              ? "bg-amber-100"
                              : "hover:bg-muted"
                          }`}
                          onMouseEnter={() => setHoverRectIndex(box.index)}
                          onMouseLeave={() => setHoverRectIndex(null)}
                        onClick={() => selectRectIndex(box.index, "list-click")}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={rectConfigs[box.index]?.include ?? true}
                                onChange={(event) =>
                                  handleToggleInclude(box.index, event.target.checked)
                                }
                              />
                              Include
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => adjustPadding(box.index, 5)}
                            >
                              +5px
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => adjustPadding(box.index, -5)}
                            >
                              -5px
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => resetPadding(box.index)}
                            >
                              Reset
                            </Button>
                          </div>
                          <div>
                            #{box.index + 1} x={Math.round(box.xPdf)} y={Math.round(box.yPdf)} w=
                            {Math.round(box.wPdf)} h={Math.round(box.hPdf)} area=
                            {Math.round(box.areaPdf)} (
                          {pageArea > 0
                            ? `${((box.areaPdf / pageArea) * 100).toFixed(2)}%`
                            : "0.00%"}
                          )
                          </div>
                          {tileMatches[boxes[box.index]?.rectId ?? ""] ? (
                            <div className="text-muted-foreground">
                              Matched image: {tileMatches[boxes[box.index]?.rectId ?? ""]}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


