export function sanitizeTileId(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return "tile"
  const sanitized = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
  return sanitized || "tile"
}

export function stripExtension(filename: string) {
  return filename.replace(/\.[^/.]+$/, "")
}

export function parseTileMapping(fileName: string) {
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

export function formatMappingInfo(fileName: string) {
  const mapping = parseTileMapping(fileName)
  if (!mapping) return "p?? box??"
  const pageLabel = String(mapping.imgPage).padStart(2, "0")
  const boxLabel = String(mapping.boxOrder).padStart(2, "0")
  return `p${pageLabel} box${boxLabel}`
}

export function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}
