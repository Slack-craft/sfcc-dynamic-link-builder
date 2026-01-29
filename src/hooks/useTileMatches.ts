import { useMemo } from "react"
import type { CsvRow } from "@/lib/catalogueDataset/parseCsv"
import { getFacetValue } from "@/lib/catalogueDataset/facets"
import type { FacetDataset } from "@/components/facet-builder/facet-builder-card"

export type PreviewItem = { plu: string; row: CsvRow | null; notFound?: boolean }

type UseTileMatchesParams = {
  dataset: FacetDataset | null
  scope?: "AU" | "NZ"
  selectedBrands: string[]
  selectedArticleTypes: string[]
  excludedPluIds: string[]
  excludePercentMismatchesEnabled: boolean
  detectedOfferPercent?: number
  activeLinkMode: "plu" | "facet" | "live"
  pluValues: string[]
}

export default function useTileMatches({
  dataset,
  scope,
  selectedBrands,
  selectedArticleTypes,
  excludedPluIds,
  excludePercentMismatchesEnabled,
  detectedOfferPercent,
  activeLinkMode,
  pluValues,
}: UseTileMatchesParams) {
  const isPluMode = activeLinkMode === "plu"
  const isFacetMode = activeLinkMode === "facet"

  const normalizedPluValues = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    pluValues.forEach((value) => {
      const trimmed = value.trim()
      if (!trimmed) return
      if (seen.has(trimmed)) return
      seen.add(trimmed)
      ordered.push(trimmed)
    })
    return ordered
  }, [pluValues])

  const datasetByPlu = useMemo(() => {
    const map = new Map<string, CsvRow>()
    if (!dataset) return map
    dataset.rowsRef.current.forEach((row) => {
      const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
      if (!plu) return
      if (!map.has(plu)) map.set(plu, row)
    })
    return map
  }, [dataset, dataset?.version])

  const pluPreviewItems = useMemo(() => {
    return normalizedPluValues.map((plu) => {
      const row = datasetByPlu.get(plu)
      return { plu, row: row ?? null, notFound: !row }
    })
  }, [datasetByPlu, normalizedPluValues])

  const matches = useMemo(() => {
    if (!dataset) {
      return { rows: [] as CsvRow[], count: 0, pluIds: [] as string[] }
    }
    if (selectedBrands.length === 0 && selectedArticleTypes.length === 0) {
      return { rows: [] as CsvRow[], count: 0, pluIds: [] as string[] }
    }
    const rows: CsvRow[] = []
    const pluIds: string[] = []
    dataset.rowsRef.current.forEach((row) => {
      if (selectedBrands.length > 0) {
        const brandValue = row.brand?.trim()
        if (!selectedBrands.includes(brandValue ?? "")) {
          return
        }
      }
      if (selectedArticleTypes.length > 0) {
        const facetValue = getFacetValue(row, "adArticleType", scope)
        if (!facetValue || !selectedArticleTypes.includes(facetValue)) {
          return
        }
      }
      const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
      if (!plu) return
      rows.push(row)
      pluIds.push(plu)
    })
    return { rows, count: rows.length, pluIds }
  }, [dataset, scope, selectedArticleTypes, selectedBrands])

  const excludedSet = useMemo(() => new Set(excludedPluIds), [excludedPluIds])

  function roundDownToNearest5(value: number) {
    if (!Number.isFinite(value) || value <= 0) return 0
    return Math.floor(value / 5) * 5
  }

  function resolvePercentOff(row: CsvRow) {
    const candidate =
      row["Pr Save %"] ??
      row["Pr Save %"] ??
      row["Pr Save Percent"] ??
      row["Pr Save % "]
    const numeric = candidate ? Number(String(candidate).replace(/[^\d.]/g, "")) : NaN
    if (!Number.isFinite(numeric)) return undefined
    const rounded = roundDownToNearest5(numeric)
    return rounded >= 5 ? rounded : undefined
  }

  const percentMismatchSet = useMemo(() => {
    if (!detectedOfferPercent || detectedOfferPercent <= 0) return new Set<string>()
    const set = new Set<string>()
    matches.rows.forEach((row) => {
      const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
      if (!plu) return
      const displayPercent = resolvePercentOff(row)
      if (!displayPercent || displayPercent <= 0) return
      if (displayPercent !== detectedOfferPercent) {
        set.add(plu)
      }
    })
    return set
  }, [detectedOfferPercent, matches.rows])

  const effectiveExcludedSet = useMemo(() => {
    if (isPluMode) return new Set<string>()
    if (!excludePercentMismatchesEnabled) return excludedSet
    const merged = new Set(excludedSet)
    percentMismatchSet.forEach((plu) => merged.add(plu))
    return merged
  }, [excludePercentMismatchesEnabled, excludedSet, percentMismatchSet, isPluMode])

  const filteredPluIds = useMemo(
    () => matches.pluIds.filter((plu) => !effectiveExcludedSet.has(plu)),
    [matches.pluIds, effectiveExcludedSet]
  )

  const excludedCount = useMemo(() => effectiveExcludedSet.size, [effectiveExcludedSet])

  const includedRows = useMemo(() => {
    if (matches.rows.length === 0) return []
    return matches.rows.filter((row) => {
      const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
      if (!plu) return false
      return !effectiveExcludedSet.has(plu)
    })
  }, [matches.rows, effectiveExcludedSet])

  const excludedRows = useMemo(() => {
    if (matches.rows.length === 0) return []
    return matches.rows.filter((row) => {
      const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
      if (!plu) return false
      return effectiveExcludedSet.has(plu)
    })
  }, [matches.rows, effectiveExcludedSet])

  const displayRows = useMemo(() => [...includedRows, ...excludedRows], [includedRows, excludedRows])

  const displayItems: PreviewItem[] = useMemo(() => {
    if (isPluMode) return pluPreviewItems
    if (isFacetMode)
      return displayRows.map((row) => {
        const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
        return { plu: plu ?? "", row, notFound: false }
      })
    return []
  }, [displayRows, isFacetMode, isPluMode, pluPreviewItems])

  const displayCount = useMemo(() => {
    if (isPluMode) return pluPreviewItems.length
    if (isFacetMode) return matches.count
    return 0
  }, [isFacetMode, isPluMode, matches.count, pluPreviewItems.length])

  return {
    displayItems,
    displayCount,
    excludedCount,
    filteredPluIds,
    effectiveExcludedSet,
    resolvePercentOff,
  }
}
