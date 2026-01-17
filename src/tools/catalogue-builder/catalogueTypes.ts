import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"

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
  extractedPluFlags?: boolean[]
  originalFileName?: string
  linkBuilderState?: LinkBuilderState
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

export type CatalogueProject = {
  id: string
  name: string
  region: Region
  stage: ProjectStage
  createdAt: string
  updatedAt: string
  imageAssetIds: string[]
  pdfAssetIds: string[]
  detectionMaps: DetectionMaps
  pdfDetection: PdfDetectionState
  tiles: Tile[]
}
