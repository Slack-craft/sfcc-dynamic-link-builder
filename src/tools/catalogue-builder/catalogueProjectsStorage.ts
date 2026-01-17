import type { CatalogueProject, Region, Tile } from "./catalogueTypes"

export type CatalogueProjectsState = {
  activeProjectId: string | null
  projects: CatalogueProject[]
}

const STORAGE_KEY = "sca_catalogue_projects_v1"

function isProject(value: unknown): value is CatalogueProject {
  if (!value || typeof value !== "object") return false
  const project = value as CatalogueProject
  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    (project.region === "AU" || project.region === "NZ") &&
    typeof project.createdAt === "string" &&
    typeof project.updatedAt === "string" &&
    Array.isArray(project.tiles) &&
    Array.isArray(project.tileImageIds) &&
    Array.isArray(project.pdfIds) &&
    typeof project.detectionMaps === "object"
  )
}

export function loadProjectsState(): CatalogueProjectsState {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { activeProjectId: null, projects: [] }
  try {
    const parsed = JSON.parse(raw) as CatalogueProjectsState
    if (!parsed || !Array.isArray(parsed.projects)) {
      return { activeProjectId: null, projects: [] }
    }
    const projects = parsed.projects.filter(isProject)
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
    createdAt: now,
    updatedAt: now,
    tileImageIds: [],
    pdfIds: [],
    detectionMaps: {},
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
