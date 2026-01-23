import { GlobalWorkerOptions, Util, getDocument } from "pdfjs-dist"
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  TextContent,
} from "pdfjs-dist/types/src/display/api"
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

export type MatchRect = {
  x: number
  y: number
  width: number
  height: number
}

export type MatchResult = {
  rect: MatchRect
  score: number
}

export async function loadPdfDocument(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const doc = await getDocument({ data }).promise
  return doc
}

export async function renderPdfPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number
) {
  const viewport = page.getViewport({ scale })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas 2D context not available")
  }
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return viewport
}

function toGrayscaleBuffer(
  sourceCanvas: HTMLCanvasElement,
  scale: number
): { data: Uint8Array; width: number; height: number } {
  const width = Math.max(1, Math.floor(sourceCanvas.width * scale))
  const height = Math.max(1, Math.floor(sourceCanvas.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas 2D context not available")
  }
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(sourceCanvas, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const buffer = new Uint8Array(width * height)
  const data = imageData.data
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    buffer[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return { data: buffer, width, height }
}

async function tileBlobToGrayscale(
  tile: Blob,
  scale: number
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const bmp = await createImageBitmap(tile)
  const width = Math.max(1, Math.floor(bmp.width * scale))
  const height = Math.max(1, Math.floor(bmp.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    bmp.close?.()
    throw new Error("Canvas 2D context not available")
  }
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(bmp, 0, 0, width, height)
  bmp.close?.()
  const imageData = ctx.getImageData(0, 0, width, height)
  const buffer = new Uint8Array(width * height)
  const data = imageData.data
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    buffer[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return { data: buffer, width, height }
}

function sadScore(
  page: Uint8Array,
  pageW: number,
  tile: Uint8Array,
  tileW: number,
  tileH: number,
  startX: number,
  startY: number
) {
  let sum = 0
  for (let y = 0; y < tileH; y += 1) {
    const pageRow = (startY + y) * pageW + startX
    const tileRow = y * tileW
    for (let x = 0; x < tileW; x += 1) {
      const diff = page[pageRow + x] - tile[tileRow + x]
      sum += diff < 0 ? -diff : diff
    }
  }
  return sum
}

function searchBestMatch(
  page: Uint8Array,
  pageW: number,
  pageH: number,
  tile: Uint8Array,
  tileW: number,
  tileH: number,
  step: number,
  bounds?: { x: number; y: number; width: number; height: number }
) {
  const maxX = (bounds ? bounds.x + bounds.width : pageW) - tileW
  const maxY = (bounds ? bounds.y + bounds.height : pageH) - tileH
  const startX = bounds ? bounds.x : 0
  const startY = bounds ? bounds.y : 0
  let bestScore = Number.POSITIVE_INFINITY
  let bestX = startX
  let bestY = startY
  for (let y = startY; y <= maxY; y += step) {
    for (let x = startX; x <= maxX; x += step) {
      const score = sadScore(page, pageW, tile, tileW, tileH, x, y)
      if (score < bestScore) {
        bestScore = score
        bestX = x
        bestY = y
      }
    }
  }
  return { x: bestX, y: bestY, score: bestScore }
}

export async function matchTileInPage(
  pageCanvas: HTMLCanvasElement,
  tileBlob: Blob
): Promise<MatchResult> {
  const coarseScale = 0.25
  const refineScale = 0.5
  const coarsePage = toGrayscaleBuffer(pageCanvas, coarseScale)
  const coarseTile = await tileBlobToGrayscale(tileBlob, coarseScale)
  const coarse = searchBestMatch(
    coarsePage.data,
    coarsePage.width,
    coarsePage.height,
    coarseTile.data,
    coarseTile.width,
    coarseTile.height,
    3
  )

  const refinePage = toGrayscaleBuffer(pageCanvas, refineScale)
  const refineTile = await tileBlobToGrayscale(tileBlob, refineScale)
  const coarseX = Math.round((coarse.x / coarseScale) * refineScale)
  const coarseY = Math.round((coarse.y / coarseScale) * refineScale)
  const searchRadius = Math.round(refineTile.width * 0.5)
  const bounds = {
    x: Math.max(0, coarseX - searchRadius),
    y: Math.max(0, coarseY - searchRadius),
    width: Math.min(refinePage.width, coarseX + searchRadius) - Math.max(0, coarseX - searchRadius),
    height:
      Math.min(refinePage.height, coarseY + searchRadius) - Math.max(0, coarseY - searchRadius),
  }
  const refined = searchBestMatch(
    refinePage.data,
    refinePage.width,
    refinePage.height,
    refineTile.data,
    refineTile.width,
    refineTile.height,
    2,
    bounds
  )

  const scaleBack = 1 / refineScale
  const rect = {
    x: Math.round(refined.x * scaleBack),
    y: Math.round(refined.y * scaleBack),
    width: Math.round(refineTile.width * scaleBack),
    height: Math.round(refineTile.height * scaleBack),
  }
  const normalizedScore = refined.score / (refineTile.width * refineTile.height)
  return { rect, score: normalizedScore }
}

export async function extractTextInRect(
  page: PDFPageProxy,
  viewport: { transform: number[] },
  rect: MatchRect
) {
  const content: TextContent = await page.getTextContent()
  const pieces: string[] = []
  for (const item of content.items) {
    if (!("str" in item)) continue
    const tx = Util.transform(viewport.transform, item.transform)
    const x = tx[4]
    const y = tx[5]
    const width = item.width ? item.width : 0
    const height = Math.hypot(tx[2], tx[3])
    const box = { x, y: y - height, width, height }
    const inX = box.x + box.width >= rect.x && box.x <= rect.x + rect.width
    const inY = box.y + box.height >= rect.y && box.y <= rect.y + rect.height
    if (inX && inY) {
      pieces.push(item.str)
    }
  }
  return pieces.join(" ")
}

export function extractPlusFromText(text: string) {
  const matches = text.match(/\b\d{5,8}\b/g) ?? []
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const value of matches) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    ordered.push(trimmed)
  }
  const sixDigit = ordered.filter((candidate) => candidate.length === 6)
  return sixDigit.length > 0 ? sixDigit : ordered
}
