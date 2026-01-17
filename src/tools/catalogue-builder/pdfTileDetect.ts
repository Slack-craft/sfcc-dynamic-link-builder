export type OpenCvModule = any

export type TileDetectParams = {
  cannyLow: number
  cannyHigh: number
  minAreaPercent: number
  dilateIterations: number
}

export type DetectedBox = {
  x: number
  y: number
  width: number
  height: number
  area: number
}

export async function detectTilesInCanvas(
  canvas: HTMLCanvasElement,
  params: TileDetectParams
): Promise<DetectedBox[]> {
  const { loadOpenCv } = await import("@/lib/loadOpenCv")
  await loadOpenCv()
  const cv = window.cv
  console.log("cv ready?", !!cv, "imread?", !!cv?.imread)
  if (!cv || !cv.imread) {
    throw new Error("OpenCV not ready: cv.imread missing")
  }
  const src = cv.imread(canvas)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U)
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0)
    cv.Canny(blurred, edges, params.cannyLow, params.cannyHigh)
    cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), params.dilateIterations)
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const boxes: DetectedBox[] = []
    const pageArea = canvas.width * canvas.height
    const minArea = Math.max(1, Math.floor((params.minAreaPercent / 100) * pageArea))
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i)
      const rect = cv.boundingRect(contour)
      const area = rect.width * rect.height
      if (area < minArea) continue
      if (rect.width < 30 || rect.height < 30) continue
      if (rect.width / rect.height > 10 || rect.height / rect.width > 10) continue
      boxes.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        area,
      })
    }
    return boxes.sort((a, b) => b.area - a.area)
  } finally {
    src.delete()
    gray.delete()
    blurred.delete()
    edges.delete()
    kernel.delete()
    contours.delete()
    hierarchy.delete()
  }
}
