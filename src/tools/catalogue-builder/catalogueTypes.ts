import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"
import type { OfferExtraction } from "@/types/offer"

export type TileStatus = "todo" | "in_progress" | "done" | "needs_review"

export type TileImageRef = {
  id: string
}

export type Tile = {
  id: string
  title?: string
  tileNumber?: string
  status: TileStatus
  dynamicLink?: string
  notes?: string
  extractedText?: string
  extractedPluFlags?: boolean[]
  offer?: OfferExtraction
  offerUpdatedAt?: number
  titleEditedManually?: boolean
  pdfMappingStatus?: "missing"
  pdfMappingReason?: string
  mappedPdfFilename?: string
  mappedSpreadNumber?: number
  mappedHalf?: "left" | "right"
  mappedBoxIndex?: number
  originalFileName?: string
  linkBuilderState?: LinkBuilderState
  facetBuilder?: {
    selectedBrands: string[]
    selectedArticleTypes: string[]
    excludedPluIds?: string[]
  }
  linkSource?: "manual" | "live"
  liveCapturedUrl?: string | null
  imageKey?: string
  image?: TileImageRef
}

export type Region = "AU" | "NZ"

export type ProjectStage = "setup" | "pdf-detect" | "catalogue"

export type DetectionMaps = Record<
  string,
  Record<string, { x: number; y: number; width: number; height: number; order: number }[]>
>

export type PdfDetectionState = Record<string, unknown>

export type ProjectDatasetMeta = {
  id: string
  filename: string
  rowCount: number
  headers: string[]
  loadedAt: string
}

export type CatalogueProject = {
  id: string
  name: string
  region: Region
  stage: ProjectStage
  createdAt: string
  updatedAt: string
  imageAssetIds: string[]
  pdfAssetIds: string[]
  dataset?: ProjectDatasetMeta | null
  detectionMaps: DetectionMaps
  pdfDetection: PdfDetectionState
  tileMatches: Record<string, string>
  tiles: Tile[]
}
