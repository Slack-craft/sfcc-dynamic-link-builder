import type { Region, Tile } from "@/tools/catalogue-builder/catalogueTypes"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"
import { slugifyLabel } from "@/lib/catalogue/format"
import { MAX_PLUS_FIELDS, buildIdFilter } from "@/lib/catalogue/plu"

export function isBrandPath(pathname: string) {
  return /^\/brands\/[^/]+$/i.test(pathname)
}

export function getBrandStub(pathname: string) {
  const match = pathname.match(/^\/brands\/([^/]+)/i)
  return match?.[1] ?? ""
}

export function getPreviewBasePathFromState(state: LinkBuilderState) {
  const previewPathOverride = state.previewPathOverride ?? ""
  let derivedPath = previewPathOverride
  if (!derivedPath && state.brand) {
    derivedPath = `/brands/${slugifyLabel(state.brand.label)}`
  }
  if (!derivedPath && state.category?.value === "catalogue-onsale") {
    derivedPath = "/catalogue-out-now"
  }
  return derivedPath
}

export function buildDynamicOutputFromState(state: LinkBuilderState, derivedQuery = "") {
  const cleanedPLUs = state.plus.map((p) => p.trim()).filter((p) => p.length > 0)

  if (cleanedPLUs.length === 1 && !derivedQuery) {
    return `$Url('Product-Show','pid','${cleanedPLUs[0]}')$`
  }

  const baseValue = state.category?.value ?? state.brand?.value ?? ""
  if (!baseValue) {
    if (cleanedPLUs.length > 1 || derivedQuery) {
      return "Select a Category or Brand to generate the base link."
    }
    return "Select a Category or Brand, or enter one PLU to generate a Product link."
  }

  let built = `$Url('Search-Show','cgid','${baseValue}')$`
  if (derivedQuery) {
    built += derivedQuery
    return built
  }
  if (cleanedPLUs.length > 1) {
    built += buildIdFilter(cleanedPLUs)
    return built
  }
  return built
}

export function buildPreviewUrlFromState(
  state: LinkBuilderState,
  scope?: Region,
  derivedQuery = "",
  ignorePlu = false
) {
  const domain =
    scope === "NZ"
      ? "https://staging.supercheapauto.co.nz"
      : "https://staging.supercheapauto.com.au"

  const cleanedPLUs = state.plus.map((p) => p.trim()).filter((p) => p.length > 0)
  const isSinglePlu = !ignorePlu && cleanedPLUs.length === 1
  const isMultiPlu = !ignorePlu && cleanedPLUs.length > 1

  if (isSinglePlu) {
    return `${domain}/p/sca-product/${cleanedPLUs[0]}.html`
  }

  if (isMultiPlu) {
    const derivedPath = getPreviewBasePathFromState(state)
    if (derivedPath) {
      return `${domain}${derivedPath}${buildIdFilter(cleanedPLUs)}`
    }
    return `${domain}${buildIdFilter(cleanedPLUs)}`
  }

  const derivedPath = getPreviewBasePathFromState(state)

  if (derivedPath) {
    return `${domain}${derivedPath}${derivedQuery}`
  }

  if (derivedQuery) {
    return `${domain}${derivedQuery}`
  }

  return domain
}

export function createEmptyLinkBuilderState(): LinkBuilderState {
  return {
    category: { label: "Catalog", value: "catalogue-onsale" },
    brand: null,
    plus: Array.from({ length: MAX_PLUS_FIELDS }, () => ""),
    previewPathOverride: "",
    captureMode: "path+filters",
  }
}

export function stripLegacyExtensionFromTile(tile: Tile): Tile {
  const state = tile.linkBuilderState
  if (!state || typeof state !== "object") return tile
  if (!("extension" in state)) return tile
  const { extension: _legacyExtension, ...rest } = state as LinkBuilderState & {
    extension?: string
  }
  return { ...tile, linkBuilderState: rest }
}
