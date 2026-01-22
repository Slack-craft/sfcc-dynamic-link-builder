import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react"
import { FixedSizeGrid } from "react-window"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  Link2,
  List,
  ListPlus,
  MousePointerClick,
  Percent,
  SlidersHorizontal,
  Tags,
  X,
} from "lucide-react"
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
  manualCategoryControl?: React.ReactNode
  manualBrandControl?: React.ReactNode
  manualBaseActions?: React.ReactNode
  pluPanel?: React.ReactNode
  pluPanelOpen?: boolean
  onPluPanelOpenChange?: (open: boolean) => void
  pluCount?: number
  selectedBrands?: string[]
  selectedArticleTypes?: string[]
  onSelectedBrandsChange?: (next: string[]) => void
  onSelectedArticleTypesChange?: (next: string[]) => void
  excludedPluIds?: string[]
  onExcludedPluIdsChange?: (next: string[]) => void
  excludePercentMismatchesEnabled?: boolean
  onExcludePercentMismatchesChange?: (enabled: boolean) => void
  onConvertToPlu?: (pluIds: string[]) => void
  detectedOfferPercent?: number
  detectedBrands?: string[]
  previewUrlValue?: string
  onPreviewUrlChange?: (value: string) => void
  activeLinkMode?: "plu" | "facet" | "live"
  onActiveLinkModeChange?: (mode: "plu" | "facet" | "live") => void
  isPluAvailable?: boolean
  isFacetAvailable?: boolean
  isLiveAvailable?: boolean
  onOpenPreview?: () => void
  onLinkViaPreview?: () => void
  previewStatusText?: string
  previewExtraControls?: React.ReactNode
  liveLinkUrl?: string
  liveLinkEditable?: boolean
  liveLinkInputRef?: React.RefObject<HTMLInputElement | null>
  onLiveLinkChange?: (value: string) => void
  captureMode?: "path+filters" | "filters-only"
  onCaptureModeChange?: (mode: "path+filters" | "filters-only") => void
  pluValues?: string[]
}

type MultiSelectProps = {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  placeholder?: string
  searchPlaceholder?: string
  previewMaxChars?: number
  labelClassName?: string
  triggerClassName?: string
  showLabel?: boolean
  containerClassName?: string
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

function buildSelectionPreview(selected: string[], maxChars: number) {
  if (selected.length === 0) return { text: "", overflowCount: 0 }
  const items: string[] = []
  let remaining = selected.length
  let current = ""
  for (const value of selected) {
    const next = current ? `${current}, ${value}` : value
    if (next.length > maxChars) break
    items.push(value)
    current = next
    remaining -= 1
  }
  if (items.length === 0) {
    return { text: selected[0] ?? "", overflowCount: selected.length - 1 }
  }
  return { text: current, overflowCount: remaining }
}

function useResponsiveSelectionPreview(params: {
  items: string[]
  placeholder: string
  textRef: React.RefObject<HTMLSpanElement | null>
  measureRef: React.RefObject<HTMLSpanElement | null>
  suffixFormatter?: (hiddenCount: number) => string
}) {
  const { items, placeholder, textRef, measureRef, suffixFormatter } = params
  const [displayText, setDisplayText] = useState(placeholder)
  const loggedRef = useRef(0)

  useEffect(() => {
    function compute() {
      const target = textRef.current
      const measureNode = measureRef.current
      if (!target || !measureNode) return
      const width = target.clientWidth
      if (!width) {
        requestAnimationFrame(() => compute())
        return
      }
      if (!width || items.length === 0) {
        setDisplayText(placeholder)
        return
      }

      const suffixFor = (count: number) =>
        suffixFormatter ? suffixFormatter(count) : `... +${count}`

      const measure = (value: string) => {
        measureNode.textContent = value
        return measureNode.getBoundingClientRect().width
      }

      const maxWidth = Math.max(0, width - 8)
      const full = items.join(", ")
      if (measure(full) <= maxWidth) {
        setDisplayText(full)
        if ((import.meta as any).env?.DEV && loggedRef.current < 2) {
          console.log("[selection-preview]", { width: maxWidth, text: full })
          loggedRef.current += 1
        }
        return
      }

      let best = ""
      let bestRemaining = items.length
      for (let i = 1; i <= items.length; i += 1) {
        const remaining = items.length - i
        const prefix = items.slice(0, i).join(", ")
        const suffix = remaining > 0 ? ` ${suffixFor(remaining)}` : ""
        if (measure(prefix + suffix) <= maxWidth) {
          best = prefix + suffix
          bestRemaining = remaining
        } else {
          break
        }
      }

      if (best) {
        setDisplayText(best)
        if ((import.meta as any).env?.DEV && loggedRef.current < 2) {
          console.log("[selection-preview]", { width: maxWidth, text: best })
          loggedRef.current += 1
        }
        return
      }

      const remaining = items.length - 1
      const suffix = ` ${suffixFor(remaining > 0 ? remaining : 1)}`
      const first = items[0] ?? ""
      let truncated = ""
      for (let i = 1; i <= first.length; i += 1) {
        const candidate = `${first.slice(0, i)}${suffix}`
        if (measure(candidate) > maxWidth) {
          truncated = `${first.slice(0, Math.max(1, i - 1))}${suffix}`
          break
        }
      }
      const finalText = truncated || `${first}${suffix}`
      setDisplayText(finalText)
      if ((import.meta as any).env?.DEV && loggedRef.current < 2) {
        console.log("[selection-preview]", { width: maxWidth, text: finalText })
        loggedRef.current += 1
      }
    }

    const observer = new ResizeObserver(() => compute())
    const target = textRef.current
    if (target) observer.observe(target)
    compute()

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => compute()).catch(() => undefined)
    }

    return () => observer.disconnect()
  }, [items, measureRef, placeholder, suffixFormatter, textRef])

  return { displayText }
}

function IconFieldGroup(props: { tooltip: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex w-full items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-r-none"
            aria-label={props.tooltip}
          >
            {props.icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{props.tooltip}</TooltipContent>
      </Tooltip>
      <div className="flex-1 min-w-0 -ml-px">{props.children}</div>
    </div>
  )
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  disabled,
  placeholder = "Select",
  searchPlaceholder = "Search",
  previewMaxChars = 36,
  labelClassName,
  triggerClassName,
  showLabel = true,
  containerClassName,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const textRef = useRef<HTMLSpanElement | null>(null)
  const measureRef = useRef<HTMLSpanElement | null>(null)
  const textClass = "min-w-0 flex-1 truncate text-left text-sm"

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

  const fallbackPreview = buildSelectionPreview(selected, previewMaxChars)
  const fallbackText =
    selected.length > 0
      ? `${fallbackPreview.text}${fallbackPreview.overflowCount > 0 ? `... +${fallbackPreview.overflowCount}` : ""}`
      : ""
  const { displayText } = useResponsiveSelectionPreview({
    items: selected,
    placeholder,
    textRef,
    measureRef,
  })
  const previewText = displayText || fallbackText || placeholder

  return (
    <div className={containerClassName ?? "space-y-1"}>
      {showLabel ? <Label className={labelClassName}>{label}</Label> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`w-full min-w-0 justify-between ${triggerClassName ?? ""}`}
            disabled={disabled}
          >
            <span ref={textRef} className={textClass}>
              {previewText || placeholder}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            <span
              ref={measureRef}
              aria-hidden="true"
              className={`pointer-events-none absolute left-0 top-0 -z-10 whitespace-nowrap opacity-0 ${textClass}`}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] min-w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
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
    </div>
  )
}

export function FacetMatchesCard({
  scope = "AU",
  dataset,
  onOpenDatasetPanel,
  manualCategoryControl,
  manualBrandControl,
  manualBaseActions,
  pluPanel,
  pluPanelOpen,
  onPluPanelOpenChange,
  pluCount,
  selectedBrands = [],
  selectedArticleTypes = [],
  onSelectedBrandsChange,
  onSelectedArticleTypesChange,
  excludedPluIds = [],
  onExcludedPluIdsChange,
  excludePercentMismatchesEnabled = false,
  onExcludePercentMismatchesChange,
  onConvertToPlu,
  detectedOfferPercent,
  detectedBrands = [],
  previewUrlValue,
  onPreviewUrlChange,
  activeLinkMode = "plu",
  onActiveLinkModeChange,
  isPluAvailable = false,
  isFacetAvailable = false,
  isLiveAvailable = false,
  onOpenPreview,
  onLinkViaPreview,
  previewStatusText,
  previewExtraControls,
  liveLinkUrl,
  liveLinkEditable = false,
  liveLinkInputRef,
  onLiveLinkChange,
  captureMode = "path+filters",
  onCaptureModeChange,
  pluValues = [],
}: FacetMatchesCardProps) {
  const setSelectedBrands = onSelectedBrandsChange ?? (() => {})
  const setSelectedArticleTypes = onSelectedArticleTypesChange ?? (() => {})
  const setExcludedPluIds = onExcludedPluIdsChange ?? (() => {})
  const appliedDetectedRef = useRef<string | null>(null)
  const previewRestValue = useMemo(() => {
    if (!previewUrlValue) return ""
    return previewUrlValue.replace(/^https?:\/\//i, "").trim()
  }, [previewUrlValue])

  const handlePreviewRestChange = (value: string) => {
    const stripped = value.replace(/^https?:\/\//i, "").trim()
    const next = stripped ? `https://${stripped}` : ""
    onPreviewUrlChange?.(next)
  }

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
  const facetColumnCount = dataset?.columnMeta?.facetKeys.length ?? 0

  const excludedSet = useMemo(() => new Set(excludedPluIds), [excludedPluIds])
  const isPluMode = activeLinkMode === "plu"
  const isFacetMode = activeLinkMode === "facet"
  const isLiveMode = activeLinkMode === "live"
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

  type PreviewItem = { plu: string; row: CsvRow | null; notFound?: boolean }

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
    (item: { plu: string; row: CsvRow | null; notFound?: boolean }) => {
      const plu = item.plu
      if (!plu) return null
      const row = item.row
      const isExcluded = effectiveExcludedSet.has(plu)
      const productName = row ? getRowDisplayName(row) : "Not found in dataset"
      const percent = row ? resolvePercentOff(row) : undefined
      const hasOfferPercent =
        Number.isFinite(detectedOfferPercent ?? NaN) && (detectedOfferPercent ?? 0) > 0
      const isMismatch =
        hasOfferPercent && percent !== undefined && percent !== detectedOfferPercent
      const isMatch =
        hasOfferPercent && percent !== undefined && percent === detectedOfferPercent
      const articleType = row ? getFacetValue(row, "adArticleType", scope) : undefined
      const imageUrl = getProductImageUrl(plu)

      return (
        <Card
          className={`h-full overflow-hidden rounded-xl border shadow-sm transition hover:border-muted-foreground/40 hover:shadow-md ${
            !isPluMode && isExcluded ? "opacity-60" : ""
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
            {!isPluMode ? (
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
            ) : null}
          </div>
          <div className="space-y-1 p-3 text-xs">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {row?.brand ?? (item.notFound ? "Not found" : "-")}
            </div>
            <div className="line-clamp-2 text-sm font-medium leading-snug">
              {productName || "Unnamed product"}
            </div>
            {!isPluMode && isExcluded ? (
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
    [detectedOfferPercent, effectiveExcludedSet, excludedPluIds, isPluMode, scope, setExcludedPluIds]
  )

  return (
    <Card className="lg:col-span-2 flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
            <span>Facet columns detected: {facetColumnCount}</span>
            <span className="text-muted-foreground">
              Matching products: {displayCount}
              {excludedCount > 0 ? ` (${excludedCount} excluded)` : ""}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <TooltipProvider delayDuration={200}>
              <div className="flex min-w-0 flex-1 items-center">
                <div className="inline-flex h-10 items-center rounded-l-md rounded-r-none border border-input bg-background divide-x divide-border">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={onOpenPreview}
                        aria-label="Open Preview"
                        className="h-10 w-10 rounded-none border-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open Preview</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={onLinkViaPreview}
                        aria-label="Link via Preview"
                        className="h-10 w-10 rounded-none border-0"
                      >
                        <MousePointerClick className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Link via Preview</TooltipContent>
                  </Tooltip>
                </div>
                <InputGroup className="h-10 min-w-0 flex-1 -ml-px">
                  <InputGroupAddon className="h-10 rounded-none border-r-0 px-0">
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="flex h-full w-9 items-center justify-center text-muted-foreground"
                          aria-label="Preview URL info"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent align="start">
                        <div className="space-y-2 text-sm">
                          <div className="font-medium">Preview URL</div>
                          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                            <li>Opens Preview / Link via Preview</li>
                            <li>Mode controls what URL is built (PLU / Facet / Live)</li>
                            <li>Editing switches to Live</li>
                          </ul>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </InputGroupAddon>
                  <InputGroupAddon className="h-10 rounded-none border-l-0 border-r-0 px-0">
                    <InputGroupText>https://</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    value={previewRestValue}
                    onChange={(event) => handlePreviewRestChange(event.target.value)}
                    placeholder="Preview URL"
                    className="h-10 min-w-0 flex-1 rounded-none px-1 text-xs"
                  />
                </InputGroup>
                <div className="inline-flex h-10 items-center border border-input bg-background -ml-px rounded-l-none rounded-r-md divide-x divide-border">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant={activeLinkMode === "plu" ? "secondary" : "ghost"}
                        onClick={() => onActiveLinkModeChange?.("plu")}
                        disabled={!isPluAvailable}
                        aria-label="PLU Link"
                        className="h-10 w-10 rounded-none border-0"
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>PLU Link</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant={activeLinkMode === "facet" ? "secondary" : "ghost"}
                        onClick={() => onActiveLinkModeChange?.("facet")}
                        disabled={!isFacetAvailable}
                        aria-label="Facet Link"
                        className="h-10 w-10 rounded-none border-0"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Facet Link</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant={activeLinkMode === "live" ? "secondary" : "ghost"}
                        onClick={() => onActiveLinkModeChange?.("live")}
                        disabled={!isLiveAvailable}
                        aria-label="Live Link"
                        className="h-10 w-10 rounded-l-none rounded-r-md border-0"
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Live Link</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </TooltipProvider>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {previewStatusText ? <span>{previewStatusText}</span> : null}
            {previewExtraControls}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-0">
        {activeLinkMode === "live" ? (
          <div className="px-6 space-y-2">
            <Label>Live Link (from Preview)</Label>
            <Input
              ref={liveLinkInputRef}
              value={liveLinkUrl || ""}
              onChange={(event) => onLiveLinkChange?.(event.target.value)}
              placeholder="Captured from Preview window"
              readOnly={!liveLinkEditable}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Label className="text-xs text-muted-foreground">Capture mode</Label>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={captureMode}
                onChange={(event) => {
                  const nextMode =
                    event.target.value === "filters-only" ? "filters-only" : "path+filters"
                  onCaptureModeChange?.(nextMode)
                }}
              >
                <option value="path+filters">Capture path + filters</option>
                <option value="filters-only">Capture filters only</option>
              </select>
            </div>
          </div>
        ) : null}
        <div className="px-6">
          <div className="space-y-3">
            {pluPanel ? (
              <Collapsible open={pluPanelOpen} onOpenChange={onPluPanelOpenChange}>
                <div className="flex w-full items-end gap-3">
                  {manualCategoryControl ? (
                    <div className="flex-1 min-w-0">{manualCategoryControl}</div>
                  ) : null}
                  {manualBrandControl ? (
                    <div className="flex-1 min-w-0">{manualBrandControl}</div>
                  ) : null}
                  {isFacetMode ? (
                    <>
                {isFacetMode ? (
                  <>
                    <div className="flex-1 min-w-0">
                      <IconFieldGroup tooltip="Brand (Facet)" icon={<Tags className="h-4 w-4" />}>
                        <MultiSelect
                          label="Brand (Facet)"
                          options={brandOptions}
                          selected={selectedBrands}
                          onChange={setSelectedBrands}
                          placeholder="Select brands"
                          searchPlaceholder="Search brands"
                          disabled={!dataset}
                          triggerClassName="h-10 text-sm rounded-l-none w-full min-w-0"
                          previewMaxChars={34}
                          showLabel={false}
                          containerClassName="space-y-0"
                        />
                      </IconFieldGroup>
                    </div>
                    <div className="flex-1 min-w-0">
                      <IconFieldGroup tooltip="Article Type" icon={<SlidersHorizontal className="h-4 w-4" />}>
                        <MultiSelect
                          label="Article Type"
                          options={articleTypeOptions}
                          selected={selectedArticleTypes}
                          onChange={setSelectedArticleTypes}
                          disabled={!dataset || selectedBrands.length === 0}
                          placeholder={
                            !dataset
                              ? "Load dataset first"
                              : selectedBrands.length === 0
                                ? "Select brand first"
                                : "Select article types"
                          }
                          searchPlaceholder="Search types"
                          triggerClassName="h-10 text-sm rounded-l-none w-full min-w-0"
                          previewMaxChars={40}
                          showLabel={false}
                          containerClassName="space-y-0"
                        />
                      </IconFieldGroup>
                    </div>
                  </>
                ) : null}
                    </>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10"
                            aria-label="Product IDs (PLUs)"
                          >
                            <List className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        Product IDs (PLUs)
                        {typeof pluCount === "number" ? ` (${pluCount})` : ""}
                      </TooltipContent>
                    </Tooltip>
                    {manualBaseActions ? (
                      <div className="flex items-center gap-2">{manualBaseActions}</div>
                    ) : null}
                    {activeLinkMode === "facet" ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() => onConvertToPlu?.(filteredPluIds)}
                            disabled={filteredPluIds.length === 0}
                            aria-label="Convert to PLU Link"
                          >
                            <ListPlus className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Convert to PLU Link</TooltipContent>
                      </Tooltip>
                    ) : null}
                    {activeLinkMode === "plu" || activeLinkMode === "facet" ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant={excludePercentMismatchesEnabled ? "secondary" : "outline"}
                            disabled={!detectedOfferPercent || detectedOfferPercent <= 0}
                            aria-pressed={excludePercentMismatchesEnabled}
                            aria-label="Exclude % mismatches"
                            onClick={() =>
                              onExcludePercentMismatchesChange?.(!excludePercentMismatchesEnabled)
                            }
                          >
                            <Percent className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {excludePercentMismatchesEnabled
                            ? "Exclude % mismatches (on)"
                            : "Exclude % mismatches (off)"}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                </div>
                  {isFacetMode && !dataset ? (
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
                ) : null}
                <CollapsibleContent className="mt-3">{pluPanel}</CollapsibleContent>
              </Collapsible>
            ) : (
              <>
                <div className="flex w-full items-end gap-3">
                  {manualCategoryControl ? (
                    <div className="flex-1 min-w-0">{manualCategoryControl}</div>
                  ) : null}
                  {manualBrandControl ? (
                    <div className="flex-1 min-w-0">{manualBrandControl}</div>
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <IconFieldGroup tooltip="Brand (Facet)" icon={<Tags className="h-4 w-4" />}>
                      <MultiSelect
                        label="Brand (Facet)"
                        options={brandOptions}
                        selected={selectedBrands}
                        onChange={setSelectedBrands}
                        placeholder="Select brands"
                        searchPlaceholder="Search brands"
                        disabled={!dataset}
                        triggerClassName="h-10 text-sm rounded-l-none w-full min-w-0"
                        previewMaxChars={34}
                        showLabel={false}
                        containerClassName="space-y-0"
                      />
                    </IconFieldGroup>
                  </div>
                  <div className="flex-1 min-w-0">
                    <IconFieldGroup tooltip="Article Type" icon={<SlidersHorizontal className="h-4 w-4" />}>
                      <MultiSelect
                        label="Article Type"
                        options={articleTypeOptions}
                        selected={selectedArticleTypes}
                        onChange={setSelectedArticleTypes}
                        disabled={!dataset || selectedBrands.length === 0}
                        placeholder={
                          !dataset
                            ? "Load dataset first"
                            : selectedBrands.length === 0
                              ? "Select brand first"
                              : "Select article types"
                        }
                        searchPlaceholder="Search types"
                        triggerClassName="h-10 text-sm rounded-l-none w-full min-w-0"
                        previewMaxChars={40}
                        showLabel={false}
                        containerClassName="space-y-0"
                      />
                    </IconFieldGroup>
                  </div>
                  <div className="shrink-0" />
                </div>
                {manualBaseActions ? (
                  <div className="flex flex-wrap items-center gap-2">{manualBaseActions}</div>
                ) : null}
            {isFacetMode && !dataset ? (
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
                ) : null}
              </>
            )}
          </div>
        </div>
        {dataset ? (
          isFacetMode && selectedBrands.length === 0 ? (
            <p className="px-6 text-xs text-muted-foreground">
              Select a brand to preview dataset matches.
            </p>
          ) : displayCount === 0 ? (
            <p className="px-6 text-xs text-muted-foreground">
              {isPluMode ? "No PLUs to preview." : "No matching products."}
            </p>
          ) : (
            <TooltipProvider>
              <div className="space-y-4">
                <VirtualizedProductGrid
                  items={displayItems}
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
  items: Array<{ plu: string; row: CsvRow | null; notFound?: boolean }>
  renderCard: (item: { plu: string; row: CsvRow | null; notFound?: boolean }) => React.ReactNode
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
          {({
            columnIndex,
            rowIndex,
            style,
          }: {
            columnIndex: number
            rowIndex: number
            style: CSSProperties
          }) => {
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
