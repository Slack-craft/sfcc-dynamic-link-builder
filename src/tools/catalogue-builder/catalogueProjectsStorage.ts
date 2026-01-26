import type { CatalogueProject, Region, Tile } from "./catalogueTypes"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"

export type CatalogueProjectsState = {
  activeProjectId: string | null
  projects: CatalogueProject[]
}

const STORAGE_KEY = "sca_catalogue_projects_v1"
const PROJECTS_MIGRATED_KEY = "sca_projects_migrated_v1"

function normalizeProject(value: unknown): CatalogueProject | null {
  if (!value || typeof value !== "object") return null
  const project = value as CatalogueProject & {
    tileImageIds?: string[]
    pdfIds?: string[]
    dataset?: CatalogueProject["dataset"]
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
  const tileMatches =
    project.tileMatches && typeof project.tileMatches === "object"
      ? project.tileMatches
      : {}
  const dataset =
    project.dataset && typeof project.dataset === "object" ? project.dataset : null
  const tiles = project.tiles.map((tile) => {
    if (!tile || typeof tile !== "object") return tile
    const linkState = tile.linkBuilderState
    if (!linkState || typeof linkState !== "object") return tile
    if (!("extension" in linkState)) return tile
    const { extension: _legacyExtension, ...rest } = linkState as LinkBuilderState & {
      extension?: string
    }
    return { ...tile, linkBuilderState: rest }
  })

  return {
    id: project.id,
    name: project.name,
    region: project.region,
    stage,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    imageAssetIds,
    pdfAssetIds,
    dataset,
    detectionMaps:
      project.detectionMaps && typeof project.detectionMaps === "object"
        ? project.detectionMaps
        : {},
    pdfDetection:
      project.pdfDetection && typeof project.pdfDetection === "object"
        ? project.pdfDetection
        : {},
    tileMatches,
    tiles,
  }
}

async function loadProjectsStateFromLocalStorage(): Promise<CatalogueProjectsState> {
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
    const legacyState = { activeProjectId, projects }
    void migrateProjectsToIdbIfNeeded(legacyState)
    return legacyState
  } catch {
    return { activeProjectId: null, projects: [] }
  }
}

export async function loadProjectsState(): Promise<CatalogueProjectsState> {
  try {
    const { listProjects } = await import("@/lib/assetStore")
    const idbProjects = await listProjects()
    if (idbProjects.length > 0) {
      const storedActive = localStorage.getItem("sca_active_project_id")
      const activeProjectId =
        idbProjects.find((project) => project.id === storedActive)?.id ??
        idbProjects[0]?.id ??
        null
      return { activeProjectId, projects: idbProjects }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[storage] failed to load projects from IndexedDB", error)
    }
  }
  return loadProjectsStateFromLocalStorage()
}

export function saveProjectsState(state: CatalogueProjectsState): void {
  // IndexedDB for heavy payloads; localStorage for metadata only.
  if (state.activeProjectId) {
    localStorage.setItem("sca_active_project_id", state.activeProjectId)
  } else {
    localStorage.removeItem("sca_active_project_id")
  }
  void (async () => {
    try {
      const { putProject } = await import("@/lib/assetStore")
      for (const project of state.projects) {
        await putProject(project)
      }
      if (localStorage.getItem(STORAGE_KEY)) {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[storage] failed to persist projects to IndexedDB", error)
      }
    }
  })()
}

async function migrateProjectsToIdbIfNeeded(state: CatalogueProjectsState): Promise<void> {
  if (localStorage.getItem(PROJECTS_MIGRATED_KEY) === "true") return
  if (!state.projects || state.projects.length === 0) return
  try {
    const { putProject } = await import("@/lib/assetStore")
    for (const project of state.projects) {
      await putProject(project)
    }
    localStorage.setItem(PROJECTS_MIGRATED_KEY, "true")
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[storage] project migration failed", error)
    }
  }
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
    hasRunMassExtractFromPdf: false,
    imageAssetIds: [],
    pdfAssetIds: [],
    dataset: null,
    detectionMaps: {},
    pdfDetection: {},
    tileMatches: {},
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
