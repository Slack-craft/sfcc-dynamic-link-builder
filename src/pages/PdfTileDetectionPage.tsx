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
      ctx.strokeRect(box.x, box.y, box.width, box.height)
      ctx.fillText(`${index + 1}`, box.x + 4, box.y + 14)
    })

    const selected =
      selectedRectIndex !== null ? current[selectedRectIndex] : null
    const hovered =
      hoverRectIndex !== null ? current[hoverRectIndex] : null

    if (hovered) {
      ctx.save()
      ctx.strokeStyle = "#f59e0b"
      ctx.lineWidth = 3
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)"
      ctx.fillRect(hovered.x, hovered.y, hovered.width, hovered.height)
      ctx.strokeRect(hovered.x, hovered.y, hovered.width, hovered.height)
      ctx.restore()
    }

    if (selected) {
      ctx.save()
      ctx.strokeStyle = "#22c55e"
      ctx.lineWidth = 4
      ctx.fillStyle = "rgba(34, 197, 94, 0.18)"
      ctx.fillRect(selected.x, selected.y, selected.width, selected.height)
      ctx.strokeRect(selected.x, selected.y, selected.width, selected.height)
      ctx.restore()
    }
  }

  useEffect(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    const raf = requestAnimationFrame(() => drawOverlay(boxes))
    return () => cancelAnimationFrame(raf)
  }, [boxes, hoverRectIndex, selectedRectIndex])

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
      const inX = x >= box.x && x <= box.x + box.width
      const inY = y >= box.y && y <= box.y + box.height
      if (inX && inY) {
        const area = box.width * box.height
        if (area < hitArea) {
          hitArea = area
          hitIndex = index
        }
      }
    })

    if (hitIndex !== null) {
      setSelectedRectIndex(hitIndex)
      const el = listItemRefs.current.get(hitIndex)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" })
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
      setHoverRectIndex(null)
      setSelectedRectIndex(null)
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
      setHoverRectIndex(null)
      setSelectedRectIndex(null)
    } catch {
      toast.error("Failed to render page.")
    } finally {
      setRendering(false)
    }
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
                        #{box.index + 1} x={Math.round(box.x)} y={Math.round(box.y)} w=
                        {Math.round(box.width)} h={Math.round(box.height)} area=
                        {Math.round(box.area)} (
                        {pageArea > 0
                          ? `${((box.area / pageArea) * 100).toFixed(2)}%`
                          : "0.00%"}
                        )
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
