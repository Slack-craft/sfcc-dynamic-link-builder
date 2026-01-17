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
  extractedPLUs?: string[]
  extractedPluFlags?: boolean[]
  originalFileName?: string
  linkBuilderState?: LinkBuilderState
  imageKey?: string
  grayImageKey?: string
  ocrImageKey?: string
  ocrSuggestions?: string[]
  image?: TileImageRef
}

export type CatalogueProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  tiles: Tile[]
}
