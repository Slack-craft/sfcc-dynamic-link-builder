import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { FixedSizeGrid } from "react-window"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Check, ChevronDown, X } from "lucide-react"
import { toast } from "sonner"
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

type FacetMatchesCardProps = {
  scope?: "AU" | "NZ"
  dataset: FacetDataset | null
  onOpenDatasetPanel?: () => void
  selectedBrands?: string[]
  selectedArticleTypes?: string[]
  onSelectedBrandsChange?: (next: string[]) => void
  onSelectedArticleTypesChange?: (next: string[]) => void
  excludedPluIds?: string[]
  onExcludedPluIdsChange?: (next: string[]) => void
  onConvertToPlu?: (pluIds: string[]) => void
  detectedOfferPercent?: number
  detectedBrands?: string[]
  onApplyExtension: (query: string) => void
}

type MultiSelectProps = {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  placeholder?: string
  searchPlaceholder?: string
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

function normalizeBrand(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  disabled,
  placeholder = "Select",
  searchPlaceholder = "Search",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) => option.toLowerCase().includes(q))
  }, [options, query])

  const toggle = useCallback(
    (value: string) => {
      if (selected.includes(value)) {
        onChange(selected.filter((item) => item !== value))
      } else {
        onChange([...selected, value])
      }
    },
    [onChange, selected]
  )

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full justify-between text-xs"
            disabled={disabled}
          >
            <span className="truncate">
              {selected.length > 0 ? `${selected.length} selected` : placeholder}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => toggle(option)}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        selected.includes(option) ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    {option}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((value) => (
            <Badge key={value} variant="secondary" className="gap-1 text-xs">
              {value}
              <button
                type="button"
                onClick={() => toggle(value)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function FacetMatchesCard({
  scope = "AU",
  dataset,
  onOpenDatasetPanel,
  selectedBrands = [],
  selectedArticleTypes = [],
  onSelectedBrandsChange,
  onSelectedArticleTypesChange,
  excludedPluIds = [],
  onExcludedPluIdsChange,
  onConvertToPlu,
  detectedOfferPercent,
  detectedBrands = [],
  onApplyExtension,
}: FacetMatchesCardProps) {
  const setSelectedBrands = onSelectedBrandsChange ?? (() => {})
  const setSelectedArticleTypes = onSelectedArticleTypesChange ?? (() => {})
  const setExcludedPluIds = onExcludedPluIdsChange ?? (() => {})
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
  const displayRows = useMemo(() => [...includedRows, ...excludedRows], [includedRows, excludedRows])

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
              {row.brand ?? "-"}
            </div>
            <div className="line-clamp-2 text-sm font-medium leading-snug">
              {productName || "Unnamed product"}
            </div>
            {isExcluded ? (
              <div className="text-xs text-muted-foreground">Excluded from Selection</div>
            ) : null}
            <div className="line-clamp-1 text-xs text-muted-foreground">
              PLU: {plu}
              {articleType ? ` - ${articleType}` : ""}
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
        <div className="flex flex-wrap items-start gap-4">
          <div className="space-y-1">
            <CardTitle>Matches Preview</CardTitle>
            <div className="text-xs text-muted-foreground">
              Matching products: {matches.count}
              {excludedPluIds.length > 0 ? ` (${excludedPluIds.length} excluded)` : ""}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center">
            <Input
              value={queryPreview}
              readOnly
              className="h-8 min-w-0 flex-1 rounded-r-none text-xs"
              placeholder="No facets selected."
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-l-none"
              onClick={() => onApplyExtension(queryPreview)}
              disabled={!queryPreview}
            >
              Apply
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                    `Excluded ${added} items that did not match ${detectedOfferPercent}%.`
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
      <CardContent className="space-y-3 px-0">
        <div className="px-6">
          <div className="grid gap-3">
            <Card className="w-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Facet Filters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="space-y-2 min-w-[220px] flex-1">
                      <MultiSelect
                        label="Brand"
                        options={brandOptions}
                        selected={selectedBrands}
                        onChange={setSelectedBrands}
                        placeholder="Select brands"
                        searchPlaceholder="Search brands"
                      />
                      {detectedBrands.length > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          Detected: {detectedBrands.join(", ")}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          No brand detected for this tile yet.
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 min-w-[220px] flex-1">
                      <MultiSelect
                        label="Article Type"
                        options={articleTypeOptions}
                        selected={selectedArticleTypes}
                        onChange={setSelectedArticleTypes}
                        disabled={selectedBrands.length === 0}
                        placeholder={
                          selectedBrands.length === 0
                            ? "Select brand first"
                            : "Select article types"
                        }
                        searchPlaceholder="Search types"
                      />
                    </div>
                  </div>
                )}
                {dataset?.columnMeta ? (
                  <p className="text-xs text-muted-foreground">
                    Facet columns detected: {dataset.columnMeta.facetKeys.length}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
        {dataset ? (
          selectedBrands.length === 0 ? (
            <p className="px-6 text-xs text-muted-foreground">
              Select a brand to preview dataset matches.
            </p>
          ) : matches.count === 0 ? (
            <p className="px-6 text-xs text-muted-foreground">No matching products.</p>
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
          )
        ) : null}
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
              <div style={{ ...style, boxSizing: "border-box", padding: "8px" }}>
                {renderCard(items[index])}
              </div>
            )
          }}
        </FixedSizeGrid>
      ) : null}
    </div>
  )
}
