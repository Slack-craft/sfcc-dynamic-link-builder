import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
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
  const [pdfName, setPdfName] = useState("")
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [pdfStatus, setPdfStatus] = useState("")
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
  const [detecting, setDetecting] = useState(false)
  const [opencvStatus, setOpenCvStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle")
  const [opencvError, setOpenCvError] = useState<string | null>(null)
  const [pageRendered, setPageRendered] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [hoverRectIndex, setHoverRectIndex] = useState<number | null>(null)
  const [selectedRectIndex, setSelectedRectIndex] = useState<number | null>(null)

  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const listItemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

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
    const file = event.target.files?.[0]
    if (!file) return
    console.log("PDF selected", file.name, file.size)
    try {
      const buffer = await file.arrayBuffer()
      const doc = await pdfjsLib.getDocument({ data: buffer }).promise
      pdfRef.current = doc
      setPdfName(file.name)
      setPageCount(doc.numPages)
      setPageNumber(1)
      setBoxes([])
      setPageRendered(false)
      setPdfStatus(`PDF loaded: ${doc.numPages} pages`)
    } catch {
      setPdfStatus("PDF failed to load")
      toast.error("Failed to load PDF.")
    } finally {
      event.target.value = ""
    }
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
      ctx.fillText(`${index + 1}`, padded.x + 4, padded.y + 14)
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
  }

  useEffect(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const raf = requestAnimationFrame(() => drawOverlay(boxes))
    return () => cancelAnimationFrame(raf)
  }, [boxes, hoverRectIndex, selectedRectIndex, rectPaddingPx, rectConfigs])

  function handleOverlayClick(event: React.MouseEvent<HTMLCanvasElement>) {
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
      drawOverlay(detected)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Tile detection failed."
      toast.error(message)
    } finally {
      setDetecting(false)
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
  }

  function handleFinishOrdering() {
    setOrderingMode(false)
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
                <Input type="file" accept="application/pdf" onChange={handlePdfChange} />
                {pdfName ? (
                  <p className="text-xs text-muted-foreground">{pdfName}</p>
                ) : null}
                {pdfStatus ? (
                  <p className="text-xs text-muted-foreground">{pdfStatus}</p>
                ) : null}
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
                {detecting ? "Detecting..." : "Detect tiles"}
              </Button>
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
                    onClick={handleOverlayClick}
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
