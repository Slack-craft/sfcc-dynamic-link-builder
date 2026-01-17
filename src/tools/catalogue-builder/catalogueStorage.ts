import type { CatalogueProject, Tile } from "./catalogueTypes"

const STORAGE_KEY = "sca_catalogue_builder_project_v1"

function isCatalogueProject(value: unknown): value is CatalogueProject {
  if (!value || typeof value !== "object") return false
  const project = value as CatalogueProject
  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    (project.region === "AU" || project.region === "NZ") &&
    (project.stage === "setup" ||
      project.stage === "pdf-detect" ||
      project.stage === "catalogue") &&
    typeof project.createdAt === "string" &&
    typeof project.updatedAt === "string" &&
    Array.isArray(project.imageAssetIds) &&
    Array.isArray(project.pdfAssetIds) &&
    typeof project.detectionMaps === "object" &&
    typeof project.pdfDetection === "object" &&
    Array.isArray(project.tiles)
  )
}

export function loadProject(): CatalogueProject | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return isCatalogueProject(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveProject(project: CatalogueProject): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
}

export function newProject(name: string): CatalogueProject {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    region: "AU",
    stage: "catalogue",
    createdAt: now,
    updatedAt: now,
    imageAssetIds: [],
    pdfAssetIds: [],
    detectionMaps: {},
    pdfDetection: {},
    tiles: [],
  }
}

export function updateTile(
  project: CatalogueProject,
  tileId: string,
  patch: Partial<Tile>
): CatalogueProject {
  const index = project.tiles.findIndex((tile) => tile.id === tileId)
  if (index === -1) return project

  const updatedTiles = project.tiles.map((tile) =>
    tile.id === tileId ? { ...tile, ...patch } : tile
  )

  return {
    ...project,
    tiles: updatedTiles,
    updatedAt: new Date().toISOString(),
  }
}
