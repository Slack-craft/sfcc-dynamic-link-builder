import type { PdfExportEntry } from "@/tools/catalogue-builder/catalogueTypes"

export function getExportSpreadOrder(entries: PdfExportEntry[]) {
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

export function getFirstPageExport(entry: PdfExportEntry) {
  if (Array.isArray(entry.pages)) {
    return entry.pages[0]
  }
  const keys = Object.keys(entry.pages)
  const firstKey = keys[0]
  return firstKey ? entry.pages[firstKey] : undefined
}

export function findRectById(entries: PdfExportEntry[], rectId: string) {
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
