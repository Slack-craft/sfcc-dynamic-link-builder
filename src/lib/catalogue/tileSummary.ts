import type { Tile, TileSummary } from "@/tools/catalogue-builder/catalogueTypes"

export function toTileSummary(detail: Tile): TileSummary {
  return {
    id: detail.id,
    originalFileName: detail.originalFileName,
    imageKey: detail.imageKey,
    status: detail.status,
    title: detail.title,
    pdfMappingStatus: detail.pdfMappingStatus,
    pdfMappingReason: detail.pdfMappingReason,
    mappedPdfFilename: detail.mappedPdfFilename,
    mappedSpreadNumber: detail.mappedSpreadNumber,
    mappedHalf: detail.mappedHalf,
    mappedBoxIndex: detail.mappedBoxIndex,
    updatedAt: detail.offerUpdatedAt,
  }
}

export function mergeSummaryIntoDetail(detail: Tile, summary?: TileSummary): Tile {
  if (!summary) return detail
  return {
    ...detail,
    id: summary.id,
    originalFileName: summary.originalFileName,
    imageKey: summary.imageKey,
    status: summary.status,
    title: summary.title,
    pdfMappingStatus: summary.pdfMappingStatus,
    pdfMappingReason: summary.pdfMappingReason,
    mappedPdfFilename: summary.mappedPdfFilename,
    mappedSpreadNumber: summary.mappedSpreadNumber,
    mappedHalf: summary.mappedHalf,
    mappedBoxIndex: summary.mappedBoxIndex,
  }
}
