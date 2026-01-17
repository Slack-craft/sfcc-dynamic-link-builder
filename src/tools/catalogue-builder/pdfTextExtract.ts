import * as pdfjsLib from "pdfjs-dist"
import "pdfjs-dist/build/pdf.worker.min.mjs"

import type { PDFDocumentProxy, PDFPageProxy, TextItem } from "pdfjs-dist/types/src/display/api"
import type { PageViewport } from "pdfjs-dist/types/src/display/display_utils"

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

export type PdfRect = {
  xPdf: number
  yPdf: number
  wPdf: number
  hPdf: number
}

type ViewportRect = {
  x: number
  y: number
  w: number
  h: number
}

export async function loadPdfDocument(blob: Blob): Promise<PDFDocumentProxy> {
  const buffer = await blob.arrayBuffer()
  return pdfjsLib.getDocument({ data: buffer }).promise
}

function toViewportRect(rect: PdfRect, viewport: PageViewport): ViewportRect {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
    rect.xPdf,
    rect.yPdf,
    rect.xPdf + rect.wPdf,
    rect.yPdf + rect.hPdf,
  ])
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const right = Math.max(x1, x2)
  const bottom = Math.max(y1, y2)
  return { x: left, y: top, w: right - left, h: bottom - top }
}

function rectsOverlap(a: ViewportRect, b: ViewportRect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function getTextItemRect(item: TextItem, viewport: PageViewport): ViewportRect {
  const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
  const x = tx[4]
  const y = tx[5]
  const w = item.width * viewport.scale
  const h = item.height * viewport.scale
  return { x, y: y - h, w, h }
}

function isTextItem(item: unknown): item is TextItem {
  return typeof (item as TextItem).str === "string"
}

export async function extractTextFromRect(
  page: PDFPageProxy,
  rect: PdfRect
): Promise<string> {
  const viewport = page.getViewport({ scale: 1 })
  const target = toViewportRect(rect, viewport)
  const content = await page.getTextContent()
  const parts: string[] = []
  for (const item of content.items) {
    if (!isTextItem(item)) continue
    const itemRect = getTextItemRect(item, viewport)
    if (rectsOverlap(itemRect, target)) {
      parts.push(item.str)
    }
  }
  return parts.join(" ").trim()
}
