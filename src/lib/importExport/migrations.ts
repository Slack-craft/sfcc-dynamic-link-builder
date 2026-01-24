import type { CatalogueProject, Tile } from "@/tools/catalogue-builder/catalogueTypes"
import type { ProjectExportManifest } from "@/lib/devProjectTransfer"

export const CURRENT_SCHEMA_VERSION = 1

type RawManifest = Partial<ProjectExportManifest> & {
  schemaVersion?: number
}

function normalizeTile(tile: Tile): Tile {
  const safeFacet = tile.facetBuilder ?? {
    selectedBrands: [],
    selectedArticleTypes: [],
  }
  return {
    ...tile,
    facetBuilder: {
      selectedBrands: safeFacet.selectedBrands ?? [],
      selectedArticleTypes: safeFacet.selectedArticleTypes ?? [],
      excludedPluIds: safeFacet.excludedPluIds ?? [],
      excludePercentMismatchesEnabled:
        safeFacet.excludePercentMismatchesEnabled ?? false,
    },
    imageUpdatedSinceExtraction: tile.imageUpdatedSinceExtraction ?? false,
    userHasChosenMode: tile.userHasChosenMode ?? false,
  }
}

export function migrateImportPayload(payload: unknown): ProjectExportManifest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid import payload.")
  }

  const raw = payload as RawManifest
  const schemaVersion = raw.schemaVersion ?? 0

  if (!raw.project || !raw.assets) {
    throw new Error("Import is missing required project data.")
  }

  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error("Unsupported export schema.")
  }

  if (schemaVersion === 0) {
    const project = raw.project as CatalogueProject
    const migratedProject: CatalogueProject = {
      ...project,
      hasRunMassExtractFromPdf: project.hasRunMassExtractFromPdf ?? false,
      tiles: (project.tiles ?? []).map((tile) => {
        const normalized = normalizeTile(tile)
        delete (normalized as Record<string, unknown>).extension
        delete (normalized as Record<string, unknown>).extensionQuery
        delete (normalized as Record<string, unknown>).lastViewedPreview
        delete (normalized as Record<string, unknown>).previewCapture
        delete (normalized as Record<string, unknown>).liveLinkUrl
        return normalized
      }),
    }

    return {
      ...raw,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: raw.exportedAt ?? new Date().toISOString(),
      project: migratedProject,
      assets: raw.assets ?? [],
      dataset: raw.dataset,
    } as ProjectExportManifest
  }

  return raw as ProjectExportManifest
}
