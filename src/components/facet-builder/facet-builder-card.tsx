import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CsvRow } from "@/lib/catalogueDataset/parseCsv"
import { detectFacetColumns } from "@/lib/catalogueDataset/columns"
import { getFacetValue } from "@/lib/catalogueDataset/facets"

export type FacetDataset = {
  headers: string[]
  rowsRef: MutableRefObject<CsvRow[]>
  rowCount: number
  columnMeta: ReturnType<typeof detectFacetColumns> | null
  version: number
}

type FacetBuilderCardProps = {
  scope?: "AU" | "NZ"
  onApplyExtension: (query: string) => void
  dataset: FacetDataset | null
  onOpenDatasetPanel?: () => void
  selectedBrands?: string[]
  selectedArticleTypes?: string[]
  onSelectedBrandsChange?: (next: string[]) => void
  onSelectedArticleTypesChange?: (next: string[]) => void
  detectedBrands?: string[]
}

function buildQueryFromSelections(selected: Record<string, string[]>) {
  const entries = Object.entries(selected).filter(([, values]) => values.length > 0)
  if (entries.length === 0) return ""
  const params = entries.map(([facetKey, values], index) => {
    const prefIndex = index + 1
    const encodedValues = encodeURIComponent(values.join("|"))
    return `prefn${prefIndex}=${encodeURIComponent(facetKey)}&prefv${prefIndex}=${encodedValues}`
  })
  return `?${params.join("&")}&sz=36`
}

export function FacetBuilderCard({
  scope = "AU",
  onApplyExtension,
  dataset,
  onOpenDatasetPanel,
  selectedBrands = [],
  selectedArticleTypes = [],
  onSelectedBrandsChange,
  onSelectedArticleTypesChange,
  detectedBrands = [],
}: FacetBuilderCardProps) {
  const setSelectedBrands = onSelectedBrandsChange ?? (() => {})
  const setSelectedArticleTypes = onSelectedArticleTypesChange ?? (() => {})
  const [showAllBrands, setShowAllBrands] = useState(false)
  const [brandSearch, setBrandSearch] = useState("")
  const appliedDetectedRef = useRef<string | null>(null)

  const brandOptions = useMemo(() => {
    if (!dataset) return []
    const values = new Set<string>()
    dataset.rowsRef.current.forEach((row) => {
      const value = row.brand?.trim()
      if (value) values.add(value)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [dataset])

  const articleTypeOptions = useMemo(() => {
    if (!dataset) return []
    if (selectedBrands.length === 0) return []
    const values = new Set<string>()
    dataset.rowsRef.current.forEach((row) => {
      const brandValue = row.brand?.trim()
      if (selectedBrands.length > 0 && !selectedBrands.includes(brandValue ?? "")) {
        return
      }
      const facetValue = getFacetValue(row, "adArticleType", scope)
      if (facetValue) values.add(facetValue)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [dataset, selectedBrands, scope])

  const queryPreview = useMemo(() => {
    const selected: Record<string, string[]> = {}
    if (selectedBrands.length > 0) {
      selected.brand = selectedBrands
    }
    if (selectedArticleTypes.length > 0) {
      selected.adArticleType = selectedArticleTypes
    }
    return buildQueryFromSelections(selected)
  }, [selectedBrands, selectedArticleTypes])

  function toggleSelection(
    value: string,
    selected: string[],
    setSelected: (values: string[]) => void
  ) {
    if (selected.includes(value)) {
      setSelected(selected.filter((item) => item !== value))
    } else {
      setSelected([...selected, value])
    }
  }

  function normalizeBrand(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  const matchedBrandValues = useMemo(() => {
    if (!dataset || detectedBrands.length === 0) return []
    const normalizedOptions = brandOptions.map((option) => ({
      value: option,
      normalized: normalizeBrand(option),
    }))

    const matches: string[] = []
    detectedBrands.forEach((detected) => {
      const normDetected = normalizeBrand(detected)
      if (!normDetected) return
      const exact = normalizedOptions.find((opt) => opt.normalized === normDetected)
      if (exact) {
        matches.push(exact.value)
        return
      }
      const partials = normalizedOptions.filter(
        (opt) =>
          opt.normalized.includes(normDetected) || normDetected.includes(opt.normalized)
      )
      if (partials.length === 0) return
      partials.sort((a, b) => a.normalized.length - b.normalized.length)
      matches.push(partials[0].value)
    })

    return Array.from(new Set(matches))
  }, [brandOptions, dataset, detectedBrands])

  useEffect(() => {
    if (!dataset) return
    if (selectedBrands.length > 0) return
    if (matchedBrandValues.length === 0) return
    const detectedKey = matchedBrandValues.join("|")
    if (appliedDetectedRef.current === detectedKey) return
    appliedDetectedRef.current = detectedKey
    setSelectedBrands(matchedBrandValues)
  }, [dataset, matchedBrandValues, selectedBrands.length, setSelectedBrands])

  const filteredBrandOptions = useMemo(() => {
    const query = brandSearch.trim().toLowerCase()
    if (!query) return brandOptions
    return brandOptions.filter((brand) => brand.toLowerCase().includes(query))
  }, [brandOptions, brandSearch])

  return (
    <Card className="lg:col-span-1 flex flex-col">
      <CardHeader>
        <CardTitle>Facet Builder (Dataset)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!dataset ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No dataset loaded for this project.
            </p>
            {onOpenDatasetPanel ? (
              <Button type="button" variant="outline" size="sm" onClick={onOpenDatasetPanel}>
                Open Project Dataset
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 text-xs text-muted-foreground">
            <div>{dataset.rowCount} rows loaded, {dataset.headers.length} columns</div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Brand</Label>
          <div className="space-y-2">
            {matchedBrandValues.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Detected Brands</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {matchedBrandValues.map((brand) => (
                    <label key={brand} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedBrands.includes(brand)}
                        onChange={() => toggleSelection(brand, selectedBrands, setSelectedBrands)}
                      />
                      <span>{brand}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No brand detected for this tile yet.
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAllBrands((prev) => !prev)}
              disabled={brandOptions.length === 0}
            >
              {showAllBrands ? "Hide brands" : "Change brands"}
            </Button>

            {showAllBrands ? (
              <div className="space-y-2">
                <Input
                  value={brandSearch}
                  onChange={(event) => setBrandSearch(event.target.value)}
                  placeholder="Search brands"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredBrandOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No brands found.</p>
                  ) : (
                    filteredBrandOptions.map((brand) => (
                      <label key={brand} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedBrands.includes(brand)}
                          onChange={() =>
                            toggleSelection(brand, selectedBrands, setSelectedBrands)
                          }
                        />
                        <span>{brand}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>adArticleType</Label>
          {selectedBrands.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Select a brand to view article types.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {articleTypeOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No article types available.</p>
              ) : (
                articleTypeOptions.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedArticleTypes.includes(value)}
                      onChange={() =>
                        toggleSelection(value, selectedArticleTypes, setSelectedArticleTypes)
                      }
                    />
                    <span>{value}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Generated query</Label>
          <Input readOnly value={queryPreview} placeholder="No facets selected." />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onApplyExtension(queryPreview)}
              disabled={!queryPreview}
            >
              Apply to Extension
            </Button>
          </div>
        </div>

        {dataset?.columnMeta ? (
          <p className="text-xs text-muted-foreground">
            Facet columns detected: {dataset.columnMeta.facetKeys.length}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
