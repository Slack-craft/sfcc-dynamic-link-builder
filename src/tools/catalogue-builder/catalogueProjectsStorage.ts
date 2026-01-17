import type { CatalogueProject, Region, Tile } from "./catalogueTypes"

export type CatalogueProjectsState = {
  activeProjectId: string | null
  projects: CatalogueProject[]
}

const STORAGE_KEY = "sca_catalogue_projects_v1"

function normalizeProject(value: unknown): CatalogueProject | null {
  if (!value || typeof value !== "object") return null
  const project = value as CatalogueProject & {
    tileImageIds?: string[]
    pdfIds?: string[]
  }
  if (
    typeof project.id !== "string" ||
    typeof project.name !== "string" ||
    (project.region !== "AU" && project.region !== "NZ") ||
    typeof project.createdAt !== "string" ||
    typeof project.updatedAt !== "string" ||
    !Array.isArray(project.tiles)
  ) {
    return null
  }

  const stage =
    project.stage === "setup" ||
    project.stage === "pdf-detect" ||
    project.stage === "catalogue"
      ? project.stage
      : "catalogue"
  const imageAssetIds = Array.isArray(project.imageAssetIds)
    ? project.imageAssetIds
    : Array.isArray(project.tileImageIds)
      ? project.tileImageIds
      : []
  const pdfAssetIds = Array.isArray(project.pdfAssetIds)
    ? project.pdfAssetIds
    : Array.isArray(project.pdfIds)
      ? project.pdfIds
      : []

  return {
    id: project.id,
    name: project.name,
    region: project.region,
    stage,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    imageAssetIds,
    pdfAssetIds,
    detectionMaps:
      project.detectionMaps && typeof project.detectionMaps === "object"
        ? project.detectionMaps
        : {},
    pdfDetection:
      project.pdfDetection && typeof project.pdfDetection === "object"
        ? project.pdfDetection
        : {},
    tiles: project.tiles,
  }
}

export function loadProjectsState(): CatalogueProjectsState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { activeProjectId: null, projects: [] }
  try {
    const parsed = JSON.parse(raw) as CatalogueProjectsState
    if (!parsed || !Array.isArray(parsed.projects)) {
      return { activeProjectId: null, projects: [] }
    }
    const projects = parsed.projects
      .map((item) => normalizeProject(item))
      .filter((item): item is CatalogueProject => item !== null)
    const activeProjectId =
      typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : null
    return { activeProjectId, projects }
  } catch {
    return { activeProjectId: null, projects: [] }
  }
}

export function saveProjectsState(state: CatalogueProjectsState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function createProject(name: string, region: Region): CatalogueProject {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    region,
    stage: "setup",
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
