import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { X } from "lucide-react"
import { toast } from "sonner"
import { FixedSizeGrid } from "react-window"
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
  const [articleTypeSearch, setArticleTypeSearch] = useState("")
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

  const filteredArticleTypeOptions = useMemo(() => {
    const query = articleTypeSearch.trim().toLowerCase()
    if (!query) return articleTypeOptions
    return articleTypeOptions.filter((value) => value.toLowerCase().includes(query))
  }, [articleTypeOptions, articleTypeSearch])

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
            {detectedBrands.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Detected Brands</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {detectedBrands.map((brand) => (
                    <span
                      key={brand}
                      className="rounded-full border border-muted-foreground/40 px-2 py-0.5 text-muted-foreground"
                    >
                      {brand}
                    </span>
                  ))}
                </div>
                {matchedBrandValues.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {matchedBrandValues.map((brand) => (
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
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No brand match found in dataset.
                  </p>
                )}
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
            <div className="space-y-2">
              <Input
                value={articleTypeSearch}
                onChange={(event) => setArticleTypeSearch(event.target.value)}
                placeholder="Search article types"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredArticleTypeOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No article types available.</p>
                ) : (
                  filteredArticleTypeOptions.map((value) => (
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

type FacetMatchesCardProps = {
  scope?: "AU" | "NZ"
  dataset: FacetDataset | null
  selectedBrands?: string[]
  selectedArticleTypes?: string[]
  excludedPluIds?: string[]
  onExcludedPluIdsChange?: (next: string[]) => void
  onConvertToPlu?: (pluIds: string[]) => void
  detectedOfferPercent?: number
}

export function FacetMatchesCard({
  scope = "AU",
  dataset,
  selectedBrands = [],
  selectedArticleTypes = [],
  excludedPluIds = [],
  onExcludedPluIdsChange,
  onConvertToPlu,
  detectedOfferPercent,
}: FacetMatchesCardProps) {
  const setExcludedPluIds = onExcludedPluIdsChange ?? (() => {})

  const matches = useMemo(() => {
    if (!dataset) {
      return { rows: [] as CsvRow[], count: 0, pluIds: [] as string[] }
    }
    if (selectedBrands.length === 0) {
      return { rows: [] as CsvRow[], count: 0, pluIds: [] as string[] }
    }
    const rows: CsvRow[] = []
    const pluIds: string[] = []
    dataset.rowsRef.current.forEach((row) => {
      const brandValue = row.brand?.trim()
      if (selectedBrands.length > 0 && !selectedBrands.includes(brandValue ?? "")) {
        return
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
  const filteredPluIds = useMemo(
    () => matches.pluIds.filter((plu) => !excludedSet.has(plu)),
    [matches.pluIds, excludedSet]
  )
  const includedRows = useMemo(() => {
    if (matches.rows.length === 0) return []
    return matches.rows.filter((row) => {
      const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
      if (!plu) return false
      return !excludedSet.has(plu)
    })
  }, [matches.rows, excludedSet])
  const excludedRows = useMemo(() => {
    if (matches.rows.length === 0) return []
    return matches.rows.filter((row) => {
      const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
      if (!plu) return false
      return excludedSet.has(plu)
    })
  }, [matches.rows, excludedSet])
  const displayRows = useMemo(
    () => [...includedRows, ...excludedRows],
    [includedRows, excludedRows]
  )

  function getProductImageUrl(plu: string) {
    return `https://staging.supercheapauto.com.au/dw/image/v2/BBRV_STG/on/demandware.static/-/Sites-srg-internal-master-catalog/default/dwe566580c/images/${plu}/SCA_${plu}_hi-res.jpg?sw=558&sh=558&sm=fit&q=60`
  }

  function getRowDisplayName(row: CsvRow) {
    const nameDefault = row["name__default"]?.trim()
    if (nameDefault) return nameDefault
    const nameAu = row["name__en_AU"]?.trim()
    if (nameAu) return nameAu
    const name = row["name"]?.trim()
    if (name) return name
    return ""
  }

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

  const renderCard = useCallback(
    (row: CsvRow) => {
      const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
      if (!plu) return null
      const imageUrl = getProductImageUrl(plu)
      const productName = getRowDisplayName(row)
      const percent = resolvePercentOff(row)
      const hasOfferPercent =
        Number.isFinite(detectedOfferPercent ?? NaN) && (detectedOfferPercent ?? 0) > 0
      const isMismatch =
        hasOfferPercent && percent !== undefined && percent !== detectedOfferPercent
      const isMatch =
        hasOfferPercent && percent !== undefined && percent === detectedOfferPercent
      const articleType = getFacetValue(row, "adArticleType", scope)
      const isExcluded = excludedSet.has(plu)

      return (
        <Card
          className={`h-full overflow-hidden rounded-xl border shadow-sm transition hover:border-muted-foreground/40 hover:shadow-md ${
            isExcluded ? "opacity-60" : ""
          }`}
        >
          <div className="relative aspect-square bg-muted/30">
            <img
              src={imageUrl}
              alt={plu}
              className="h-full w-full object-contain p-3"
              onError={(event) => {
                event.currentTarget.src =
                  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
              }}
            />
            {percent !== undefined && percent > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    className="absolute left-2 top-2"
                    variant={isMismatch ? "destructive" : "default"}
                    style={isMatch ? { backgroundColor: "#16a34a", color: "#fff" } : undefined}
                  >
                    {percent}% OFF
                  </Badge>
                </TooltipTrigger>
                {isMismatch ? (
                  <TooltipContent>
                    Mismatch: Tile shows {detectedOfferPercent}%.
                  </TooltipContent>
                ) : null}
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Exclude product"
                  className="absolute right-2 top-2 rounded-full bg-background/80 p-1 text-muted-foreground shadow hover:text-foreground"
                  onClick={() => {
                    if (isExcluded) {
                      setExcludedPluIds(excludedPluIds.filter((id) => id !== plu))
                    } else {
                      setExcludedPluIds([...excludedPluIds, plu])
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Exclude</TooltipContent>
            </Tooltip>
          </div>
          <div className="space-y-1 p-3 text-xs">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {row.brand ?? "—"}
            </div>
            <div className="line-clamp-2 text-sm font-medium leading-snug">
              {productName || "Unnamed product"}
            </div>
            {isExcluded ? (
              <div className="text-xs text-muted-foreground">Excluded from Selection</div>
            ) : null}
            <div className="line-clamp-1 text-xs text-muted-foreground">
              PLU: {plu}
              {articleType ? ` • ${articleType}` : ""}
            </div>
          </div>
        </Card>
      )
    },
    [detectedOfferPercent, excludedPluIds, excludedSet, scope, setExcludedPluIds]
  )

  return (
    <Card className="lg:col-span-2 flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Matches Preview</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Matching products: {matches.count}
              {excludedPluIds.length > 0 ? ` (${excludedPluIds.length} excluded)` : ""}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onConvertToPlu?.(filteredPluIds)}
              disabled={filteredPluIds.length === 0}
            >
              Convert to PLU Link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!detectedOfferPercent || detectedOfferPercent <= 0}
              onClick={() => {
                if (!detectedOfferPercent || detectedOfferPercent <= 0) return
                const nextExcluded = new Set(excludedPluIds)
                let added = 0
                matches.rows.forEach((row) => {
                  const plu = (row.ID ?? (row as Record<string, string>)["Id"] ?? row.id)?.trim?.()
                  if (!plu) return
                  const displayPercent = resolvePercentOff(row)
                  if (!displayPercent || displayPercent <= 0) return
                  if (displayPercent !== detectedOfferPercent) {
                    if (!nextExcluded.has(plu)) {
                      nextExcluded.add(plu)
                      added += 1
                    }
                  }
                })
                setExcludedPluIds(Array.from(nextExcluded))
                if (added > 0) {
                  toast.success(
                    `Excluded ${added} items that didn’t match ${detectedOfferPercent}%.`
                  )
                } else {
                  toast.info("No mismatching items found.")
                }
              }}
            >
              Exclude % mismatches
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-0">
        {selectedBrands.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Select a brand to preview dataset matches.
          </p>
        ) : matches.count === 0 ? (
          <p className="text-xs text-muted-foreground">No matching products.</p>
        ) : (
          <TooltipProvider>
            <div className="space-y-4">
              <VirtualizedProductGrid
                items={displayRows}
                renderCard={renderCard}
                heightClassName="h-[70vh] overflow-hidden"
              />
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  )
}

type VirtualizedProductGridProps = {
  items: CsvRow[]
  renderCard: (row: CsvRow) => React.ReactNode
  minColumnWidth?: number
  rowHeight?: number
  heightClassName?: string
}

function VirtualizedProductGrid({
  items,
  renderCard,
  minColumnWidth = 220,
  rowHeight = 340,
  heightClassName = "h-[60vh] overflow-hidden",
}: VirtualizedProductGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const columnCount = useMemo(() => {
    if (size.width === 0) return 1
    return Math.max(1, Math.floor(size.width / minColumnWidth))
  }, [minColumnWidth, size.width])

  const columnWidth = useMemo(() => {
    if (size.width === 0) return minColumnWidth
    return Math.floor(size.width / columnCount)
  }, [columnCount, minColumnWidth, size.width])

  const rowCount = useMemo(() => {
    if (items.length === 0) return 0
    return Math.ceil(items.length / columnCount)
  }, [columnCount, items.length])

  return (
    <div ref={containerRef} className={`${heightClassName} w-full overflow-x-hidden`}>
      {size.width > 0 && size.height > 0 ? (
        <FixedSizeGrid
          columnCount={columnCount}
          columnWidth={columnWidth}
          height={size.height}
          rowCount={rowCount}
          rowHeight={rowHeight}
          width={size.width}
          className="overflow-x-hidden"
          style={{ overflowX: "hidden" }}
        >
          {({ columnIndex, rowIndex, style }) => {
            const index = rowIndex * columnCount + columnIndex
            if (index >= items.length) return null
          return (
            <div
              style={{ ...style, boxSizing: "border-box", padding: "8px" }}
            >
              {renderCard(items[index])}
            </div>
          )
        }}
      </FixedSizeGrid>
    ) : null}
  </div>
  )
}
