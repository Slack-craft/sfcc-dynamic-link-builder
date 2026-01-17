import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { detectTilesInCanvas, type DetectedBox } from "@/tools/catalogue-builder/pdfTileDetect"
import { loadOpenCv } from "@/lib/loadOpenCv"
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api"
import * as pdfjsLib from "pdfjs-dist"
import "pdfjs-dist/build/pdf.worker.min.mjs"

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

export default function PdfTileDetectionPage() {
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [pdfStatus, setPdfStatus] = useState("")
  const [pdfName, setPdfName] = useState("")
  const [cannyLow, setCannyLow] = useState(50)
  const [cannyHigh, setCannyHigh] = useState(150)
  const [minAreaPercent, setMinAreaPercent] = useState(1)
  const [dilateIterations, setDilateIterations] = useState(2)
  const [boxes, setBoxes] = useState<DetectedBox[]>([])
  const [rectPaddingPx, setRectPaddingPx] = useState(10)
  const [rectConfigs, setRectConfigs] = useState<
    Record<number, { include: boolean; paddingOverride?: number; orderIndex?: number }>
  >({})
  const [orderingMode, setOrderingMode] = useState(false)
  const [currentOrderCounter, setCurrentOrderCounter] = useState(1)
  const [overlayCursor, setOverlayCursor] = useState("default")
  const [detecting, setDetecting] = useState(false)
  const [opencvStatus, setOpenCvStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [opencvError, setOpenCvError] = useState<string | null>(null)
  const [pageRendered, setPageRendered] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [hoverRectIndex, setHoverRectIndex] = useState<number | null>(null)
  const [selectedRectIndex, setSelectedRectIndex] = useState<number | null>(null)
  const [orderingFinished, setOrderingFinished] = useState(false)

  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const listItemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const pdfDocMapRef = useRef<Map<string, PDFDocumentProxy>>(new Map())
  const isSyncingRef = useRef(false)
  const isAutoDetectingRef = useRef(false)
  const resizeStateRef = useRef<{
    index: number
    handle: string
    startX: number
    startY: number
    rect: DetectedBox
  } | null>(null)
  const wasResizingRef = useRef(false)

  type RectConfig = { include: boolean; paddingOverride?: number; orderIndex?: number }
  type PageData = {
    boxes: DetectedBox[]
    rectConfigs: Record<number, RectConfig>
    orderingFinished?: boolean
    currentOrderCounter?: number
    rectPaddingPx?: number
  }
  type PdfEntry = {
    id: string
    name: string
    pageCount: number
    selectedPage: number
    pages: Record<number, PageData>
  }

  const STORAGE_KEY = "sca_pdf_tile_detection_v1"
  const [pdfs, setPdfs] = useState<PdfEntry[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed as PdfEntry[]
    } catch {
      return []
    }
  })
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>(
    () => pdfs[0]?.id ?? null
  )

  const areaList = useMemo(
    () =>
      boxes.map((box, index) => ({
        index,
        ...box,
      })),
    [boxes]
  )

  const orderedIncluded = useMemo(() => {
    const included = boxes
      .map((box, index) => ({
        box,
        index,
        cy: box.y + box.height / 2,
      }))
      .filter(({ index }) => rectConfigs[index]?.include ?? true)
    if (included.length === 0) return []

    const manual = included
      .filter(({ index }) => typeof rectConfigs[index]?.orderIndex === "number")
      .map((item) => ({
        ...item,
        order: rectConfigs[item.index]?.orderIndex as number,
      }))
      .sort((a, b) => a.order - b.order)

    if (manual.length > 0) {
      return manual
    }

    const heights = included.map((item) => item.box.height).sort((a, b) => a - b)
    const medianHeight =
      heights.length % 2 === 1
        ? heights[Math.floor(heights.length / 2)]
        : (heights[heights.length / 2 - 1] + heights[heights.length / 2]) / 2
    const rowTolerance = medianHeight * 0.4

    const sortedByCy = [...included].sort((a, b) => a.cy - b.cy)
    const rows: { cy: number; items: typeof sortedByCy }[] = []
    for (const item of sortedByCy) {
      const row = rows[rows.length - 1]
      if (!row || Math.abs(item.cy - row.cy) > rowTolerance) {
        rows.push({ cy: item.cy, items: [item] })
      } else {
        row.items.push(item)
        row.cy = row.items.reduce((sum, current) => sum + current.cy, 0) / row.items.length
      }
    }

    const flattened: typeof sortedByCy = []
    rows.forEach((row) => {
      row.items.sort((a, b) => a.box.x - b.box.x)
      flattened.push(...row.items)
    })

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[PDF Detect] Row grouping", {
        rowTolerance,
        rows: rows.map((row) => row.items.map((item) => item.index)),
      })
    }

    return flattened.map((item, order) => ({
      ...item,
      order: order + 1,
    }))
  }, [boxes, rectConfigs])

  const pageArea = useMemo(() => {
    const canvas = pdfCanvasRef.current
    if (!canvas) return 0
    return canvas.width * canvas.height
  }, [pageRendered, boxes.length])

  async function handlePdfChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return
    const newEntries: PdfEntry[] = []
    for (const file of files) {
      console.log("PDF selected", file.name, file.size)
      try {
        const buffer = await file.arrayBuffer()
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise
        const id = crypto.randomUUID()
        pdfDocMapRef.current.set(id, doc)
        newEntries.push({
          id,
          name: file.name,
          pageCount: doc.numPages,
          selectedPage: 1,
          pages: {},
        })
      } catch {
        toast.error(`Failed to load PDF: ${file.name}`)
      }
    }

    if (newEntries.length > 0) {
      setPdfs((prev) => [...prev, ...newEntries])
      if (!selectedPdfId) {
        const first = newEntries[0]
        setSelectedPdfId(first.id)
        pdfRef.current = pdfDocMapRef.current.get(first.id) ?? null
        setPageCount(first.pageCount)
        setPageNumber(1)
        setPdfName(first.name)
        setBoxes([])
        setRectConfigs({})
        setRectPaddingPx(10)
        setCurrentOrderCounter(1)
        setOrderingMode(false)
        setOrderingFinished(false)
      }
      setPdfStatus(`PDFs loaded: ${newEntries.length}`)
    }

    event.target.value = ""
  }

  async function renderPage() {
    const pdf = pdfRef.current
    const canvas = pdfCanvasRef.current
    if (!pdf || !canvas) {
      throw new Error("PDF not loaded")
    }
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.8 })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      throw new Error("Canvas 2D context not available")
    }
    await page.render({ canvasContext: ctx, viewport }).promise
    const overlay = overlayCanvasRef.current
    if (overlay) {
      overlay.width = canvas.width
      overlay.height = canvas.height
      const ctx = overlay.getContext("2d")
      if (ctx) {
        ctx.clearRect(0, 0, overlay.width, overlay.height)
      }
    }
    setPageRendered(true)
  }

  function getPaddedRect(box: DetectedBox, padding: number) {
    const canvas = pdfCanvasRef.current
    const maxW = canvas?.width ?? 0
    const maxH = canvas?.height ?? 0
    const x = Math.max(0, box.x - padding)
    const y = Math.max(0, box.y - padding)
    const width = Math.min(maxW - x, box.width + padding * 2)
    const height = Math.min(maxH - y, box.height + padding * 2)
    return { x, y, width, height }
  }

  function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.fillStyle = "#ffffff"
    ctx.strokeStyle = "#111827"
    ctx.lineWidth = 1
    ctx.fillRect(x - size / 2, y - size / 2, size, size)
    ctx.strokeRect(x - size / 2, y - size / 2, size, size)
  }

  function getHandleRects(box: DetectedBox) {
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

  function drawOverlay(current: DetectedBox[]) {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const ctx = overlay.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    ctx.strokeStyle = "#ef4444"
    ctx.lineWidth = 2
    ctx.font = "12px sans-serif"
    ctx.fillStyle = "#ef4444"
    current.forEach((box, index) => {
      if (!(rectConfigs[index]?.include ?? true)) return
      const padding = rectConfigs[index]?.paddingOverride ?? rectPaddingPx
      const padded = getPaddedRect(box, padding)
      const order = rectConfigs[index]?.orderIndex
      ctx.strokeStyle = order ? "#2563eb" : "#ef4444"
      ctx.lineWidth = order ? 3 : 2
      ctx.strokeRect(padded.x, padded.y, padded.width, padded.height)
      ctx.fillStyle = order ? "#2563eb" : "#ef4444"
      ctx.fillText(`${order ?? index + 1}`, padded.x + 4, padded.y + 14)
      if (order) {
        ctx.save()
        ctx.fillStyle = "rgba(37, 99, 235, 0.85)"
        ctx.font = "bold 20px sans-serif"
        const label = `${order}`
        const textWidth = ctx.measureText(label).width
        ctx.fillText(
          label,
          padded.x + padded.width / 2 - textWidth / 2,
          padded.y + padded.height / 2 + 8
        )
        ctx.restore()
      }
    })

    const selected =
      selectedRectIndex !== null ? current[selectedRectIndex] : null
    const hovered =
      hoverRectIndex !== null ? current[hoverRectIndex] : null

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
        ctx.lineWidth = 4
        ctx.fillStyle = "rgba(34, 197, 94, 0.18)"
        ctx.fillRect(padded.x, padded.y, padded.width, padded.height)
        ctx.strokeRect(padded.x, padded.y, padded.width, padded.height)
        ctx.restore()
      }
    }

    if (!orderingMode && selected) {
      const handles = getHandleRects(selected)
      handles.forEach((handle) => {
        drawHandle(ctx, handle.x, handle.y, handle.size)
      })
    }
  }

  useEffect(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const raf = requestAnimationFrame(() => drawOverlay(boxes))
    return () => cancelAnimationFrame(raf)
  }, [boxes, hoverRectIndex, selectedRectIndex, rectPaddingPx, rectConfigs])

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
      const padding = rectConfigs[index]?.paddingOverride ?? rectPaddingPx
      const padded = getPaddedRect(box, padding)
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
      if (orderingMode) {
        const current = rectConfigs[hitIndex]
        if (current?.include ?? true) {
          if (current?.orderIndex === undefined) {
            setRectConfigs((prev) => ({
              ...prev,
              [hitIndex]: { ...prev[hitIndex], include: true, orderIndex: currentOrderCounter },
            }))
            setCurrentOrderCounter((prev) => prev + 1)
          }
        }
      } else {
        setSelectedRectIndex(hitIndex)
        const el = listItemRefs.current.get(hitIndex)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" })
        }
      }
    }
  }

  function getCanvasPoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const overlay = overlayCanvasRef.current
    if (!overlay) return null
    const rect = overlay.getBoundingClientRect()
    const scaleX = overlay.width / rect.width
    const scaleY = overlay.height / rect.height
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  function findHandleAtPoint(point: { x: number; y: number }) {
    if (selectedRectIndex === null) return null
    const box = boxes[selectedRectIndex]
    if (!box) return null
    const handles = getHandleRects(box)
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
    if (orderingMode) return
    if (selectedRectIndex === null) return
    const point = getCanvasPoint(event)
    if (!point) return
    const handle = findHandleAtPoint(point)
    if (!handle) return
    const rect = boxes[selectedRectIndex]
    resizeStateRef.current = {
      index: selectedRectIndex,
      handle: handle.key,
      startX: point.x,
      startY: point.y,
      rect: { ...rect },
    }
    setOverlayCursor(handle.cursor)
  }

  function handleOverlayMouseMove(event: React.MouseEvent<HTMLCanvasElement>) {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const point = getCanvasPoint(event)
    if (!point) return

    const resizing = resizeStateRef.current
    if (resizing) {
      const minSize = 40
      const canvas = pdfCanvasRef.current
      const maxW = canvas?.width ?? 0
      const maxH = canvas?.height ?? 0
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

      setBoxes((prev) => {
        const next = [...prev]
        const target = next[resizing.index]
        if (!target) return prev
        next[resizing.index] = { ...target, x, y, width, height }
        return next
      })
      wasResizingRef.current = true
      return
    }

    if (orderingMode) {
      setOverlayCursor("default")
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
  }

  async function handleDetectTiles() {
    if (!pdfRef.current) {
      toast.error("Upload a PDF first.")
      return
    }
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
      const detected = await detectTilesInCanvas(canvas, {
        cannyLow,
        cannyHigh,
        minAreaPercent,
        dilateIterations,
      })
      setBoxes(detected)
      setRectConfigs(
        Object.fromEntries(
          detected.map((_, index) => [index, { include: true }])
        )
      )
      setHoverRectIndex(null)
      setSelectedRectIndex(null)
      setCurrentOrderCounter(1)
      setOrderingMode(false)
      setOrderingFinished(false)
      drawOverlay(detected)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Tile detection failed."
      toast.error(message)
    } finally {
      setDetecting(false)
    }
  }

  async function runAutoDetectIfNeeded(entry: PdfEntry | null) {
    if (!pageRendered) return
    if (!entry) return
    if (detecting || rendering) return
    if (isAutoDetectingRef.current) return

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

  async function handleRenderPage() {
    if (!pdfRef.current) {
      toast.error("Upload a PDF first.")
      return
    }
    setRendering(true)
    try {
      await renderPage()
      setBoxes([])
      setRectConfigs({})
      setHoverRectIndex(null)
      setSelectedRectIndex(null)
      setCurrentOrderCounter(1)
      setOrderingMode(false)
      setOrderingFinished(false)
    } catch {
      toast.error("Failed to render page.")
    } finally {
      setRendering(false)
    }
  }

  function handleToggleInclude(index: number, include: boolean) {
    setRectConfigs((prev) => ({
      ...prev,
      [index]: {
        include,
        paddingOverride: prev[index]?.paddingOverride,
        orderIndex: prev[index]?.orderIndex,
      },
    }))
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

  function toggleOrderingMode() {
    if (orderingMode) {
      setOrderingMode(false)
      return
    }
    const hasIncluded = boxes.some((_, index) => rectConfigs[index]?.include ?? true)
    if (!hasIncluded) {
      toast.error("No included rectangles to order.")
      return
    }
    setOrderingMode(true)
  }

  function handleUndoOrder() {
    const entries = Object.entries(rectConfigs)
      .map(([key, value]) => ({ index: Number(key), orderIndex: value.orderIndex }))
      .filter((item) => typeof item.orderIndex === "number") as { index: number; orderIndex: number }[]
    if (entries.length === 0) return
    const max = entries.reduce((acc, item) => (item.orderIndex > acc.orderIndex ? item : acc))
    setRectConfigs((prev) => ({
      ...prev,
      [max.index]: { ...prev[max.index], orderIndex: undefined },
    }))
    setCurrentOrderCounter(max.orderIndex)
  }

  function handleResetOrder() {
    setRectConfigs((prev) => {
      const next: typeof prev = {}
      for (const [key, value] of Object.entries(prev)) {
        next[Number(key)] = { ...value, orderIndex: undefined }
      }
      return next
    })
    setCurrentOrderCounter(1)
    setOrderingFinished(false)
  }

  function handleFinishOrdering() {
    setOrderingMode(false)
    setOrderingFinished(true)
  }

  function handleCommitDetected() {
    const canvas = pdfCanvasRef.current
    const pageW = canvas?.width ?? 0
    const pageH = canvas?.height ?? 0
    const committed = orderedIncluded.map((item) => {
      const padding = rectConfigs[item.index]?.paddingOverride ?? rectPaddingPx
      const padded = getPaddedRect(item.box, padding)
      return {
        page: pageNumber,
        x: padded.x,
        y: padded.y,
        width: padded.width,
        height: padded.height,
        order: item.order,
        areaPercent: pageW && pageH ? padded.width * padded.height / (pageW * pageH) : 0,
      }
    })
    console.log("Committed detected tiles", committed)
  }

  function clearPdfState() {
    setPdfs([])
    setSelectedPdfId(null)
    pdfRef.current = null
    pdfDocMapRef.current.clear()
    setPageCount(1)
    setPageNumber(1)
    setBoxes([])
    setRectConfigs({})
    setRectPaddingPx(10)
    setCurrentOrderCounter(1)
    setOrderingMode(false)
    setOrderingFinished(false)
    setHoverRectIndex(null)
    setSelectedRectIndex(null)
    setPageRendered(false)
    setPdfStatus("")
    setPdfName("")
    localStorage.removeItem(STORAGE_KEY)
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
  }

  async function handleSelectPdf(entry: PdfEntry) {
    syncCurrentPdfState()
    setSelectedPdfId(entry.id)
    const doc = pdfDocMapRef.current.get(entry.id)
    pdfRef.current = doc ?? null
    setPdfName(entry.name)
    setPageCount(entry.pageCount)
    setPageNumber(entry.selectedPage)
    loadPageState(entry, entry.selectedPage)
    try {
      await renderPage()
      drawOverlay(entry.pages[entry.selectedPage]?.boxes ?? [])
    } catch {
      toast.error("Failed to render page.")
    }
  }

  function syncCurrentPdfState() {
    if (!selectedPdfId) return
    if (isSyncingRef.current) return
    setPdfs((prev) =>
      prev.map((entry) => {
        if (entry.id !== selectedPdfId) return entry
        const pageData: PageData = {
          boxes,
          rectConfigs,
          orderingFinished,
          currentOrderCounter,
          rectPaddingPx,
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
    setBoxes(data?.boxes ?? [])
    setRectConfigs(data?.rectConfigs ?? {})
    setRectPaddingPx(data?.rectPaddingPx ?? 10)
    setCurrentOrderCounter(data?.currentOrderCounter ?? 1)
    setOrderingFinished(data?.orderingFinished ?? false)
    setOrderingMode(false)
    setHoverRectIndex(null)
    setSelectedRectIndex(null)
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
    orderingFinished,
    currentOrderCounter,
    pageNumber,
    selectedPdfId,
  ])

  useEffect(() => {
    const toPersist = pdfs.map(({ id, name, pageCount, selectedPage, pages }) => ({
      id,
      name,
      pageCount,
      selectedPage,
      pages,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist))
  }, [pdfs])

  const selectedPdfEntry = useMemo(
    () => pdfs.find((entry) => entry.id === selectedPdfId) ?? null,
    [pdfs, selectedPdfId]
  )

  useEffect(() => {
    void runAutoDetectIfNeeded(selectedPdfEntry)
  }, [pageRendered, selectedPdfId, pageNumber, selectedPdfEntry?.pages])

  const isPageOrdered = useMemo(() => {
    if (orderingFinished) return true
    const includedIndexes = boxes
      .map((_, index) => index)
      .filter((index) => rectConfigs[index]?.include ?? true)
    if (includedIndexes.length === 0) return false
    return includedIndexes.every((index) => rectConfigs[index]?.orderIndex !== undefined)
  }, [boxes, rectConfigs, orderingFinished])

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
          <CardTitle>Detection Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Catalogue PDF</Label>
                <Input type="file" accept="application/pdf" multiple onChange={handlePdfChange} />
                {pdfStatus ? (
                  <p className="text-xs text-muted-foreground">{pdfStatus}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>PDF list</Label>
                <div className="max-h-[180px] overflow-auto rounded-md border border-border bg-background p-2 text-xs">
                  {pdfs.length === 0 ? (
                    <div className="text-muted-foreground">No PDFs loaded.</div>
                  ) : (
                    pdfs.map((entry) => {
                      const pageData = entry.pages[entry.selectedPage]
                      const detected = (pageData?.boxes?.length ?? 0) > 0
                      const includedIndexes = (pageData?.boxes ?? [])
                        .map((_, index) => index)
                        .filter((index) => pageData?.rectConfigs?.[index]?.include ?? true)
                      const ordered =
                        pageData?.orderingFinished ||
                        (includedIndexes.length > 0 &&
                          includedIndexes.every(
                            (index) => pageData?.rectConfigs?.[index]?.orderIndex !== undefined
                          ))
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
                            {detected ? "Detected" : "No detections"}  {" "}
                            {ordered ? "Ordered" : "Not ordered"}
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
                    setPageNumber(Number(event.target.value))
                    setPageRendered(false)
                    if (selectedPdfEntry) {
                      loadPageState(selectedPdfEntry, Number(event.target.value))
                    }
                  }}
                />
              </div>
              <Button type="button" variant="outline" onClick={handleRenderPage} disabled={rendering}>
                {rendering ? "Rendering..." : "Render Page"}
              </Button>
              <Button type="button" variant="outline" onClick={handleLoadOpenCv}>
                Load OpenCV
              </Button>
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
                <div className="text-xs text-muted-foreground">Current: {rectPaddingPx}px</div>
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
              <Button type="button" onClick={handleDetectTiles} disabled={detecting || !pageRendered}>
                {detecting ? "Detecting..." : "Re-detect tiles"}
              </Button>
              <div className="text-xs text-muted-foreground">
                Page status: {boxes.length > 0 ? "Detected" : "No detections"}  {" "}
                {isPageOrdered ? "Ordered" : "Not ordered"}
              </div>
              <Button type="button" variant="secondary" onClick={handleCommitDetected} disabled={orderedIncluded.length === 0}>
                Commit detected tiles
              </Button>
              <Button type="button" variant={orderingMode ? "default" : "outline"} onClick={toggleOrderingMode}>
                {orderingMode ? "Exit Ordering Mode" : "Enable Ordering Mode"}
              </Button>
              {orderingMode ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Click included tiles on the canvas to assign order.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={handleUndoOrder}>
                      Undo last
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={handleResetOrder}>
                      Reset order
                    </Button>
                    <Button type="button" size="sm" onClick={handleFinishOrdering}>
                      Finish ordering
                    </Button>
                  </div>
                </div>
              ) : null}
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
            <div className="space-y-3">
              <div className="relative max-h-[520px] overflow-auto rounded-md border border-border bg-muted/20 p-2">
                <div className="relative inline-block">
                  <canvas ref={pdfCanvasRef} className="block" />
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute left-0 top-0"
                    style={{ cursor: overlayCursor }}
                    onClick={handleOverlayClick}
                    onMouseDown={handleOverlayMouseDown}
                    onMouseMove={handleOverlayMouseMove}
                    onMouseUp={handleOverlayMouseUp}
                    onMouseLeave={handleOverlayMouseUp}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Detected boxes</Label>
                <div className="max-h-[220px] overflow-auto rounded-md border border-border bg-background p-2 text-xs">
                  {areaList.length === 0 ? (
                    <div className="text-muted-foreground">No boxes detected.</div>
                  ) : (
                    areaList.map((box) => (
                      <div
                        key={`${box.index}-${box.x}-${box.y}`}
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
                        onClick={() => setSelectedRectIndex(box.index)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={rectConfigs[box.index]?.include ?? true}
                              onChange={(event) =>
                                handleToggleInclude(box.index, event.target.checked)
                              }
                              disabled={orderingMode}
                            />
                            Include
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => adjustPadding(box.index, 5)}
                            disabled={orderingMode}
                          >
                            +5px
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => adjustPadding(box.index, -5)}
                            disabled={orderingMode}
                          >
                            -5px
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => resetPadding(box.index)}
                            disabled={orderingMode}
                          >
                            Reset
                          </Button>
                        </div>
                        <div>
                          #{box.index + 1} Order #
                          {orderedIncluded.find((item) => item.index === box.index)?.order ?? "-"} x=
                          {Math.round(box.x)} y={Math.round(box.y)} w={Math.round(box.width)} h=
                          {Math.round(box.height)} area={Math.round(box.area)} (
                        {pageArea > 0
                          ? `${((box.area / pageArea) * 100).toFixed(2)}%`
                          : "0.00%"}
                        )
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

