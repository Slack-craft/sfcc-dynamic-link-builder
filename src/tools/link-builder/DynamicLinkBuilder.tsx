import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BRAND_OPTIONS } from "@/data/brands"
import type { LinkBuilderOption, LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { toast } from "sonner"
import { FacetBuilderCard, FacetMatchesCard, type FacetDataset } from "@/components/facet-builder/facet-builder-card"

const CATEGORY_OPTIONS: LinkBuilderOption[] = [
  { label: "Catalog", value: "catalogue-onsale" },
  { label: "4WD & Recovery", value: "SCA0104" },
  { label: "Accessories & Seat Covers", value: "SCA0102" },
  { label: "Batteries & Electrical", value: "SCA0106" },
  { label: "Car Care & Cleaning", value: "SCA0101" },
  { label: "Caravan, Camping & Trailer", value: "SCA0114" },
  { label: "Oils, Fluids & Filters", value: "SCA0107" },
  { label: "Paint & Panel", value: "SCA0110" },
  { label: "Spare Parts", value: "SCA0108" },
  { label: "Technology", value: "SCA0103" },
  { label: "Toolboxes, Shelving & Storage", value: "SCA0115" },
  { label: "Tools & Garage", value: "SCA0113" },
  { label: "Toys, Gifting & Apparel", value: "SCA0111" },
  { label: "Tyres", value: "SCA700303" },
  { label: "Best Sellers", value: "SCA0199" },
]



// -----------------------------
// History types
// -----------------------------
type SavedLink = {
  id: string
  createdAt: string // ISO
  output: string

  category: LinkBuilderOption | null
  brand: LinkBuilderOption | null
  extension: string
  plus: string[] // length 20
  previewPathOverride?: string
  captureMode?: LinkBuilderState["captureMode"]
}

const HISTORY_STORAGE_KEY = "sca_dynamic_link_builder_history_v1"

// -----------------------------
// Helpers
// -----------------------------

const ADPACK_STORAGE_KEY = "sca_dynamic_link_builder_adpack_plus_v1"
const PLU_PER_ROW = 3
const MIN_VISIBLE_PLUS = 3

function parsePlusFromText(raw: string): string[] {
  return raw
    .split(/[\r\n\t,;|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function normalizeState(state?: Partial<LinkBuilderState>): LinkBuilderState {
  const baseLength = Math.max(20, state?.plus?.length ?? 0)
  return {
    category: state?.category ?? null,
    brand: state?.brand ?? null,
    extension: state?.extension ?? "",
    plus: Array.from({ length: baseLength }, (_, i) => state?.plus?.[i] ?? ""),
    previewPathOverride: state?.previewPathOverride ?? "",
    captureMode: state?.captureMode ?? "path+filters",
  }
}

function optionEquals(a: LinkBuilderOption | null, b: LinkBuilderOption | null) {
  return a?.value === b?.value
}

function statesEqual(a: LinkBuilderState, b: LinkBuilderState) {
  if (!optionEquals(a.category, b.category)) return false
  if (!optionEquals(a.brand, b.brand)) return false
  if (a.extension !== b.extension) return false
  if ((a.previewPathOverride ?? "") !== (b.previewPathOverride ?? "")) return false
  if ((a.captureMode ?? "path+filters") !== (b.captureMode ?? "path+filters")) return false
  if (a.plus.length !== b.plus.length) return false
  for (let i = 0; i < a.plus.length; i += 1) {
    if (a.plus[i] !== b.plus[i]) return false
  }
  return true
}


function extractQueryString(fullUrlOrQuery: string): string {
  const trimmed = fullUrlOrQuery.trim()
  if (!trimmed) return ""

  const qIndex = trimmed.indexOf("?")
  if (qIndex >= 0) return trimmed.slice(qIndex) // includes '?'

  // If they pasted only query params (no '?'), accept and normalise
  if (trimmed.includes("=")) {
    return `?${trimmed.replace(/^\&+/, "")}`
  }

  return ""
}

function buildIdFilter(pluValues: string[]): string {
  const joined = pluValues.join("%7c")
  return `?prefn1=id&prefv1=${joined}`
}

function isNonEmpty(s: string) {
  return s.trim().length > 0
}

function isSavableOutput(output: string) {
  // We only save actual dynamic links, not guidance/error strings
  return output.startsWith("$Url(")
}

function safeParseHistory(raw: string | null): SavedLink[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(Boolean) as SavedLink[]
  } catch {
    return []
  }
}

// -----------------------------
// Reusable searchable dropdown (Combobox)
// -----------------------------
function SearchableSelect(props: {
  label: string
  placeholder?: string
  options: LinkBuilderOption[]
  value: LinkBuilderOption | null
  onChange: (opt: LinkBuilderOption | null) => void
  disabled?: boolean
  onCommitNext?: () => void // NEW: called after Tab-select
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  function openAndPrime(initialText: string) {
    setOpen(true)
    setQuery(initialText)

    setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()

      // Put caret at end so next typing appends (doesn't overwrite)
      const end = el.value.length
      el.setSelectionRange(end, end)
    }, 0)
  }


  const { label, placeholder = "Select", options, value, onChange, disabled, onCommitNext } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q)
    )
  }, [options, query])

  function commitFirstMatchAndMoveNext() {
    const first = filtered[0]
    if (!first) return
    onChange(first)
    setOpen(false)
    setQuery("")
    // Let the popover close before focusing next field
    setTimeout(() => onCommitNext?.(), 0)
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <Popover
        open={open}
        onOpenChange={(o) => {
          if (disabled) return
          setOpen(o)

          // Optional: clear search when closing (nice tidy behaviour)
          if (!o) setQuery("")
        }}
      >

        <PopoverTrigger asChild>
          <Button
            ref={props.triggerRef}
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={disabled}
            onKeyDown={(e) => {
              if (disabled) return
              if (open) return

              // Only react to "printable" keys (letters/numbers/etc.)
              const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
              const isBackspace = e.key === "Backspace"

              if (isPrintable) {
                e.preventDefault()
                openAndPrime(e.key)
              } else if (isBackspace) {
                e.preventDefault()
                openAndPrime("")
              }
            }}
          >
            {value ? value.label : placeholder}
            <span className="ml-2 text-muted-foreground">v</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput
              ref={inputRef}
              placeholder={`Type to search ${label.toLowerCase()}`}
              value={query}
              onValueChange={setQuery}
              onKeyDown={(e) => {
                // Press Tab to accept the first match and jump to next field
                if (e.key === "Tab") {
                  // Only override Tab when dropdown is open and user is interacting here
                  // Prevent default tabbing so we can commit first match
                  e.preventDefault()
                  commitFirstMatchAndMoveNext()
                }

                // Optional: Enter also commits first match (nice for keyboard flow)
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitFirstMatchAndMoveNext()
                }
              }}
            />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup>
                {filtered.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.value}`}
                    onSelect={() => {
                      onChange(opt)
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="truncate">{opt.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{opt.value}</span>
                    </div>
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


// -----------------------------
// Main App
// -----------------------------
type DynamicLinkBuilderProps = {
  initialState?: LinkBuilderState
  onChange?: (state: LinkBuilderState) => void
  onOutputChange?: (output: string) => void
  scope?: "AU" | "NZ"
  dataset?: FacetDataset | null
  onOpenDatasetPanel?: () => void
  facetSelectedBrands?: string[]
  facetSelectedArticleTypes?: string[]
  onFacetSelectedBrandsChange?: (next: string[]) => void
  onFacetSelectedArticleTypesChange?: (next: string[]) => void
  facetExcludedPluIds?: string[]
  onFacetExcludedPluIdsChange?: (next: string[]) => void
  detectedBrands?: string[]
  liveLinkUrl?: string
  onLiveLinkChange?: (value: string) => void
  liveLinkEditable?: boolean
  liveLinkInputRef?: React.RefObject<HTMLInputElement | null>
  previewUrl?: string
  onOpenPreview?: () => void
  onLinkViaPreview?: () => void
  previewStatusText?: string
  previewExtraControls?: React.ReactNode
  mode?: "full" | "embedded"
  hideHistory?: boolean
  hideAdpack?: boolean
  extractedPluFlags?: boolean[]
  onExtractedPluFlagsChange?: (flags: boolean[]) => void
}

export type DynamicLinkBuilderHandle = {
  commitNow: () => { state: LinkBuilderState; output: string }
}

const DynamicLinkBuilder = forwardRef<DynamicLinkBuilderHandle, DynamicLinkBuilderProps>(
  (
    {
      initialState,
      onChange,
      onOutputChange,
      scope = "AU",
      dataset = null,
      onOpenDatasetPanel,
      facetSelectedBrands,
      facetSelectedArticleTypes,
      onFacetSelectedBrandsChange,
      onFacetSelectedArticleTypesChange,
      facetExcludedPluIds,
      onFacetExcludedPluIdsChange,
      detectedBrands,
      liveLinkUrl,
      onLiveLinkChange,
      liveLinkEditable = false,
      liveLinkInputRef,
      previewUrl,
      onOpenPreview,
      onLinkViaPreview,
      previewStatusText,
      previewExtraControls,
      mode = "full",
      hideHistory = false,
      hideAdpack = false,
      extractedPluFlags,
      onExtractedPluFlagsChange,
    },
    ref
  ) => {
  const renderCountRef = useRef(0)
  renderCountRef.current += 1
  if ((import.meta as any).env?.DEV && renderCountRef.current % 20 === 0) {
    console.log("[DynamicLinkBuilder] renders", renderCountRef.current)
  }
  const normalizedInitial = useMemo(() => normalizeState(initialState), [initialState])
  // Base selection (mutually exclusive)
  const [category, setCategory] = useState<LinkBuilderOption | null>(normalizedInitial.category)
  const [brand, setBrand] = useState<LinkBuilderOption | null>(normalizedInitial.brand)
  const extensionRef = useRef<HTMLTextAreaElement | null>(null)
  const categoryTriggerRef = useRef<HTMLButtonElement | null>(null)

  const [adpackIsOpen, setAdpackIsOpen] = useState(false)
  const [adpackInput, setAdpackInput] = useState("")
  const [adpackPLUs, setAdpackPLUs] = useState<string[]>(() => {
    const raw = localStorage.getItem(ADPACK_STORAGE_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  const adpackSet = useMemo(() => new Set(adpackPLUs), [adpackPLUs])
  const adpackLoaded = adpackPLUs.length > 0

  useEffect(() => {
    localStorage.setItem(ADPACK_STORAGE_KEY, JSON.stringify(adpackPLUs))
  }, [adpackPLUs])

  function loadAdpackFromInput() {
    const tokens = parsePlusFromText(adpackInput)
    const deduped = Array.from(new Set(tokens))

    if (deduped.length === 0) {
      toast.error("No PLUs found to load.")
      return
    }

    setAdpackPLUs(deduped)
    setAdpackInput("")
    setAdpackIsOpen(false)
    toast.success(`AdPack loaded (${deduped.length} PLU${deduped.length === 1 ? "" : "s"})`)
  }

  function clearAdpack() {
    setAdpackPLUs([])
    setAdpackInput("")
    setAdpackIsOpen(false)
    toast.success("AdPack cleared")
  }


  // Refinement (mutually exclusive)
  const [extension, setExtension] = useState(normalizedInitial.extension)
  const [plus, setPlus] = useState<string[]>(normalizedInitial.plus)
  const [pluDrafts, setPluDrafts] = useState<string[]>(normalizedInitial.plus)
  const activePluIndexRef = useRef<number | null>(null)
  const [previewPathOverride, setPreviewPathOverride] = useState(
    normalizedInitial.previewPathOverride ?? ""
  )
  const [captureMode, setCaptureMode] = useState<LinkBuilderState["captureMode"]>(
    normalizedInitial.captureMode ?? "path+filters"
  )

  // History
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>(() =>
    safeParseHistory(localStorage.getItem(HISTORY_STORAGE_KEY))
  )

  const [historyQuery, setHistoryQuery] = useState("")

  const filteredSavedLinks = useMemo(() => {
    const q = historyQuery.trim().toLowerCase()
    if (!q) return savedLinks

    const tokens = q.split(/\s+/).filter(Boolean)
    return savedLinks.filter((item) => {
      const hay = item.output.toLowerCase()
      return tokens.every((t) => hay.includes(t))
    })
  }, [historyQuery, savedLinks])


  // Keep localStorage in sync
  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(savedLinks))
  }, [savedLinks])

  useEffect(() => {
    if (!initialState) return
    const normalized = normalizeState(initialState)
    const current = { category, brand, extension, plus }
    if (statesEqual(normalized, current)) return
    setCategory(normalized.category)
    setBrand(normalized.brand)
    setExtension(normalized.extension)
    setPlus(normalized.plus)
    setPluDrafts(normalized.plus)
    setPreviewPathOverride(normalized.previewPathOverride ?? "")
    setCaptureMode(normalized.captureMode ?? "path+filters")
  }, [initialState])

  useEffect(() => {
    if (activePluIndexRef.current !== null) return
    setPluDrafts(plus)
  }, [plus])

  // Derived values
  const anyPLU = useMemo(() => plus.some((p) => isNonEmpty(p)), [plus])
  const cleanedPLUs = useMemo(() => plus.map((p) => p.trim()).filter((p) => p.length > 0), [plus])
  const pluCount = cleanedPLUs.length

  const extensionQuery = useMemo(() => extractQueryString(extension), [extension])
  const hasExtensionText = isNonEmpty(extension)
  const extensionValid = !hasExtensionText || isNonEmpty(extensionQuery)

  // Disable rules
  const brandDisabled = category !== null
  const categoryDisabled = brand !== null

  const extensionDisabled = anyPLU
  const pluDisabled = extensionValid && hasExtensionText // only lock PLUs when extension is usable

  function buildOutputFromState(state: LinkBuilderState) {
    const hasExtensionTextLocal = isNonEmpty(state.extension)
    const extensionQueryLocal = extractQueryString(state.extension)
    const extensionValidLocal =
      !hasExtensionTextLocal || isNonEmpty(extensionQueryLocal)
    const cleanedPLUsLocal = state.plus.map((p) => p.trim()).filter((p) => p.length > 0)
    const pluCountLocal = cleanedPLUsLocal.length

    if (hasExtensionTextLocal && !extensionValidLocal) {
      return "Extension is not valid (missing '?'). Paste a URL that includes a query string, or paste query params only."
    }

    if (!hasExtensionTextLocal && pluCountLocal === 1) {
      return `$Url('Product-Show','pid','${cleanedPLUsLocal[0]}')$`
    }

    const baseValue = state.category?.value ?? state.brand?.value ?? ""
    if (!baseValue) {
      if (pluCountLocal > 1 || hasExtensionTextLocal) return "Select a Category or Brand to generate the base link."
      return "Select a Category or Brand, or enter one PLU to generate a Product link."
    }

    let built = `$Url('Search-Show','cgid','${baseValue}')$`

    if (isNonEmpty(extensionQueryLocal)) {
      built += extensionQueryLocal
      return built
    }

    if (pluCountLocal > 1) {
      built += buildIdFilter(cleanedPLUsLocal)
      return built
    }

    return built
  }

  // Output building
  const output = useMemo(() => {
    // Invalid extension
    if (hasExtensionText && !extensionValid) {
      return "Extension is not valid (missing '?'). Paste a URL that includes a query string, or paste query params only."
    }

    // 1) If exactly one PLU and no extension -> Product-Show
    if (!hasExtensionText && pluCount === 1) {
      return `$Url('Product-Show','pid','${cleanedPLUs[0]}')$`
    }

    // 2) Otherwise Search-Show mode with base cgid
    const baseValue = category?.value ?? brand?.value ?? ""
    if (!baseValue) {
      if (pluCount > 1 || hasExtensionText) return "Select a Category or Brand to generate the base link."
      return "Select a Category or Brand, or enter one PLU to generate a Product link."
    }

    let built = `$Url('Search-Show','cgid','${baseValue}')$`

    // 3) Append extension query string if present
    if (isNonEmpty(extensionQuery)) {
      built += extensionQuery
      return built
    }

    // 4) Otherwise, if multiple PLUs exist, append id filter
    if (pluCount > 1) {
      built += buildIdFilter(cleanedPLUs)
      return built
    }

    // 5) Base only
    return built
  }, [brand, category, cleanedPLUs, extensionQuery, hasExtensionText, extensionValid, pluCount])

  function commitState(nextState: LinkBuilderState) {
    onChange?.(nextState)
    onOutputChange?.(buildOutputFromState(nextState))
  }

  function convertToPluLink(pluIds: string[]) {
    const normalized = pluIds.map((value) => value.trim()).filter(Boolean)
    const baseLength = Math.max(20, normalized.length)
    const nextPlus = Array.from({ length: baseLength }, (_, i) => normalized[i] ?? "")
    setPlus(nextPlus)
    setPluDrafts(nextPlus)
    setExtension("")
    commitState({
      category,
      brand,
      extension: "",
      plus: nextPlus,
      previewPathOverride,
      captureMode,
    })
  }

  function updateExtractedFlags(
    updater: (flags: boolean[]) => boolean[]
  ) {
    if (!onExtractedPluFlagsChange) return
    const base = extractedPluFlags && extractedPluFlags.length > 0
      ? [...extractedPluFlags]
      : Array.from({ length: plus.length }, () => false)
    onExtractedPluFlagsChange(updater(base))
  }

  function clearExtractedAt(indices: number[]) {
    updateExtractedFlags((flags) => {
      indices.forEach((index) => {
        if (index >= 0 && index < flags.length) {
          flags[index] = false
        }
      })
      return flags
    })
  }

  function setPLU(index: number, value: string, clearExtracted = true) {
    setPlus((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    if (clearExtracted) {
      clearExtractedAt([index])
    }
  }

  function clearPLUs() {
    const nextPlus = Array.from({ length: Math.max(20, plus.length) }, () => "")
    setPlus(nextPlus)
    setPluDrafts(nextPlus)
    updateExtractedFlags((flags) => flags.map(() => false))
    commitState({
      category,
      brand,
      extension,
      plus: nextPlus,
      previewPathOverride,
      captureMode,
    })
  }

  function clearExtension() {
    setExtension("")
    commitState({
      category,
      brand,
      extension: "",
      plus,
      previewPathOverride,
      captureMode,
    })
  }

  function resetBuilder() {
    setCategory(null)
    setBrand(null)
    setExtension("")
    setPreviewPathOverride("")
    setCaptureMode("path+filters")
    clearPLUs()

    // focus Category after state updates
    setTimeout(() => categoryTriggerRef.current?.focus(), 0)
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Copy failed. You can still select and copy manually.")
    }
  }

  function applyPastedPLUs(startIndex: number, pastedText: string) {
    const tokens = pastedText
      .split(/[\r\n\t,;|]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    if (tokens.length === 0) return
    const nextPlus = [...pluDrafts]
    for (let i = 0; i < tokens.length; i++) {
      const idx = startIndex + i
      if (idx >= nextPlus.length) {
        nextPlus.length = idx + 1
      }
      nextPlus[idx] = tokens[i]
    }

    setPluDrafts(nextPlus)
    setPlus(nextPlus)
    clearExtractedAt(
      tokens.map((_, i) => startIndex + i).filter((idx) => idx < nextPlus.length)
    )

    toast.success(`Pasted ${tokens.length} PLU(s)`)
    commitState({
      category,
      brand,
      extension,
      plus: nextPlus,
      previewPathOverride,
      captureMode,
    })
  }

  function restoreSavedLink(item: SavedLink) {
    // Restore options by value if possible; otherwise fall back to stored option
    const restoredCategory = item.category
      ? CATEGORY_OPTIONS.find((o) => o.value === item.category!.value) ?? item.category
      : null

    const restoredBrand = item.brand
      ? BRAND_OPTIONS.find((o) => o.value === item.brand!.value) ?? item.brand
      : null

    setCategory(restoredCategory)
    setBrand(restoredBrand)
    setExtension(item.extension ?? "")
    setPreviewPathOverride(item.previewPathOverride ?? "")
    setCaptureMode(item.captureMode ?? "path+filters")
    const baseLength = Math.max(20, item.plus?.length ?? 0)
    setPlus(Array.from({ length: baseLength }, (_, i) => item.plus?.[i] ?? ""))
    setPluDrafts(Array.from({ length: baseLength }, (_, i) => item.plus?.[i] ?? ""))
    commitState({
      category: restoredCategory,
      brand: restoredBrand,
      extension: item.extension ?? "",
      plus: Array.from({ length: baseLength }, (_, i) => item.plus?.[i] ?? ""),
      previewPathOverride: item.previewPathOverride ?? "",
      captureMode: item.captureMode ?? "path+filters",
    })

    toast.success("Restored saved link parameters")
  }

  function deleteSavedLink(id: string) {
    setSavedLinks((prev) => prev.filter((x) => x.id !== id))
    toast.success("Deleted from history")
  }

  function clearHistory() {
    setSavedLinks([])
    toast.success("History cleared")
  }

  function downloadHistoryCsv() {
    if (savedLinks.length === 0) {
      toast.error("No history to download.")
      return
    }

    const header = "Link"
    const rows = savedLinks.map((x) => `"${x.output.replace(/"/g, '""')}"`) // CSV-escape quotes
    const csv = [header, ...rows].join("\r\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = `dynamic-link-history-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()

    URL.revokeObjectURL(url)
    toast.success("Downloaded history CSV")
  }


  function saveCurrentToHistory() {
    if (!isSavableOutput(output)) {
      toast.error("Nothing valid to save yet.")
      return
    }

    const snapshot: SavedLink = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      output,
      category,
      brand,
      extension,
      plus: Array.from({ length: Math.max(20, plus.length) }, (_, i) => (plus[i] ?? "").trim()),
    }

    setSavedLinks((prev) => {
      // Exact duplicate match by output string -> bump to top (update timestamp + snapshot)
      const existingIndex = prev.findIndex((x) => x.output === snapshot.output)
      if (existingIndex >= 0) {
        const existing = prev[existingIndex]
        const updated: SavedLink = { ...existing, ...snapshot, id: existing.id }
        const without = prev.filter((_, i) => i !== existingIndex)
        return [updated, ...without]
      }
      return [snapshot, ...prev]
    })

    toast.success("Saved to history")
    resetBuilder()
  }

  const isEmbedded = mode === "embedded"
  const showHeader = mode === "full"
  const showHistory = mode === "full" && !hideHistory
  const showAdpack = !isEmbedded && !hideAdpack
  const containerClass = isEmbedded ? "w-full" : "min-h-screen bg-background text-foreground"
  const mainClass = isEmbedded ? "p-0" : "min-h-[calc(100vh)] p-6"
  const gridClass = isEmbedded
    ? "grid w-full gap-6 lg:grid-cols-2 lg:items-stretch"
    : "grid w-full gap-6 lg:grid-cols-3 lg:items-stretch"

  function commitNow() {
    const committedPlus = pluDrafts.map((value) => value.trim())
    const nextState: LinkBuilderState = {
      category,
      brand,
      extension,
      plus: committedPlus,
      previewPathOverride,
      captureMode,
    }
    setPlus(committedPlus)
    setPluDrafts(committedPlus)
    commitState(nextState)
    return { state: nextState, output: buildOutputFromState(nextState) }
  }

  useImperativeHandle(ref, () => ({ commitNow }), [commitNow])

  const visiblePluCount = useMemo(() => {
    let lastNonEmpty = -1
    for (let i = pluDrafts.length - 1; i >= 0; i -= 1) {
      if (pluDrafts[i]?.trim()) {
        lastNonEmpty = i
        break
      }
    }
    if (lastNonEmpty === -1) return MIN_VISIBLE_PLUS
    const needed = Math.ceil((lastNonEmpty + 2) / PLU_PER_ROW) * PLU_PER_ROW
    return Math.max(MIN_VISIBLE_PLUS, needed)
  }, [pluDrafts])

  const visiblePluDrafts = useMemo(() => {
    if (pluDrafts.length >= visiblePluCount) return pluDrafts.slice(0, visiblePluCount)
    return [
      ...pluDrafts,
      ...Array.from({ length: visiblePluCount - pluDrafts.length }, () => ""),
    ]
  }, [pluDrafts, visiblePluCount])

  // Ctrl+S / Cmd+S shortcut
  useEffect(() => {
    if (isEmbedded) return
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName?.toLowerCase()
      return tag === "input" || tag === "textarea" || el.isContentEditable
    }

    function hasSelection() {
      const sel = window.getSelection()
      return !!sel && sel.toString().length > 0
    }

    function onKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase()
      const metaOrCtrl = e.ctrlKey || e.metaKey

      // Escape => Reset builder
      if (e.key === "Escape") {
        // Let Radix close popovers first if needed
        // Only reset if we're not typing inside a text input
        const target = e.target as HTMLElement | null
        const tag = target?.tagName?.toLowerCase()

        if (tag !== "input" && tag !== "textarea" && !target?.isContentEditable) {
          e.preventDefault()
          resetBuilder()
          toast.success("Builder reset")
        }

        return
      }


      // Ctrl+S / Cmd+S => Save
      if (metaOrCtrl && key === "s") {
        e.preventDefault()
        saveCurrentToHistory()
        return
      }

      // Ctrl+C / Cmd+C => Copy output (safe override)
      if (metaOrCtrl && key === "c") {
        if (isTypingTarget(e.target)) return
        if (hasSelection()) return
        if (!isSavableOutput(output)) return

        e.preventDefault()
        copyText(output)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmbedded, output, category, brand, extension, plus])


  return (
<div className={containerClass}>
  {showHeader ? (
    <header className="border-b">
      <div className="mx-auto w-3/4 max-w-6xl flex items-center justify-between p-4">
        <h1 className="text-xl font-semibold">Dynamic Link Builder</h1>
        <Badge variant="secondary">Internal Tool</Badge>
      </div>
    </header>
  ) : null}


      <main className={mainClass}>
          <div className={gridClass}>
        {/* Inputs */}
        <Card className="lg:col-span-1 flex flex-col lg:max-h-[calc(100vh-75px)]">
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Base selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Base Link (pick one)</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCategory(null)
                    setBrand(null)
                    commitState({
                      category: null,
                      brand: null,
                      extension,
                      plus,
                      previewPathOverride,
                      captureMode,
                    })
                  }}
                >
                  Clear base
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SearchableSelect
                  label="Category"
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={(opt) => {
                    const nextBrand = opt ? null : brand
                    setCategory(opt)
                    if (opt) setBrand(null)
                    commitState({
                      category: opt,
                      brand: nextBrand,
                      extension,
                      plus,
                      previewPathOverride,
                      captureMode,
                    })
                  }}
                  disabled={categoryDisabled}
                placeholder={categoryDisabled ? "Disabled by selection rules." : "Type to search categories"}
                onCommitNext={() => extensionRef.current?.focus()}
                triggerRef={categoryTriggerRef}
              />

                <SearchableSelect
                  label="Brand"
                  options={BRAND_OPTIONS}
                  value={brand}
                  onChange={(opt) => {
                    const nextCategory = opt ? null : category
                    setBrand(opt)
                    if (opt) setCategory(null)
                    commitState({
                      category: nextCategory,
                      brand: opt,
                      extension,
                      plus,
                      previewPathOverride,
                      captureMode,
                    })
                  }}
                  disabled={brandDisabled}
                placeholder={brandDisabled ? "Disabled by selection rules." : "Type to search brands"}
                onCommitNext={() => extensionRef.current?.focus()}
              />
              </div>

            </div>

            <Separator />

            {/* Refinement */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Refinement (pick one)</h2>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={clearExtension} disabled={extensionDisabled}>
                    Clear extension
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearPLUs} disabled={pluDisabled}>
                    Clear PLUs
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Extension (paste a full URL)</Label>
                  <p className="text-xs text-muted-foreground">
                    The filter selection will be extracted automatically.
                  </p>
                </div>
                <Textarea
                  ref={extensionRef}
                  value={extension}
                  onChange={(e) => setExtension(e.target.value)}
                  onBlur={() => {
                    const normalizedExtension = extractQueryString(extension) || extension
                    if (normalizedExtension !== extension) {
                      setExtension(normalizedExtension)
                    }
                    commitState({
                      category,
                      brand,
                      extension: normalizedExtension,
                      plus,
                      previewPathOverride,
                      captureMode,
                    })
                  }}
                  placeholder={
                    extensionDisabled
                      ? "Disabled by selection rules."
                      : "https://www.supercheapauto.com.au/spare-parts?prefn1=...&sz=36"
                  }
                  disabled={extensionDisabled}
                />

                {hasExtensionText && !extensionValid ? (
                  <p className="text-sm text-destructive">
                    Extension must include a <code>?</code> (or be query params like <code>prefn1=...&prefv1=...</code>).
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>PLUs (1-20)</Label>
                <TooltipProvider delayDuration={250}>
                  <div className="grid grid-cols-3 gap-2">
                    {visiblePluDrafts.map((plu, i) => {
                      // --- 1. Normalise the current PLU ---
                      const trimmed = (plu ?? "").trim()

                      // --- 2. Decide whether we should check against AdPack ---
                      const shouldCheck = adpackLoaded && trimmed.length > 0

                      // --- 3. Check membership ---
                      const inAdpack = shouldCheck ? adpackSet.has(trimmed) : false

                      // --- 4. Decide styling ---
                      const adpackClass = !shouldCheck
                        ? ""
                        : inAdpack
                          ? "border-green-500 ring-1 ring-green-200 focus-visible:ring-green-300"
                          : "border-red-500 ring-1 ring-red-200 focus-visible:ring-red-300"
                      const isExtracted = extractedPluFlags?.[i] ?? false
                      const extractedClass = isExtracted
                        ? "bg-blue-50/70 dark:bg-blue-950/30"
                        : ""
                      const inputClass = [adpackClass, extractedClass].filter(Boolean).join(" ")

                      // --- 5. Build the Input ONCE ---
                      const inputEl = (
                        <Input
                          key={`plu-${i}`}
                          value={plu ?? ""}
                          onFocus={() => {
                            activePluIndexRef.current = i
                          }}
                          onChange={(e) => {
                            const next = e.target.value
                            setPluDrafts((prev) => {
                              const updated = [...prev]
                              if (updated.length <= i) {
                                updated.length = i + 1
                              }
                              updated[i] = next
                              return updated
                            })
                          }}
                          onBlur={(e) => {
                            const trimmedValue = e.target.value.trim()
                            const nextPlus = [...plus]
                            if (nextPlus.length <= i) {
                              nextPlus.length = i + 1
                            }
                            nextPlus[i] = trimmedValue
                            setPluDrafts((prev) => {
                              const updated = [...prev]
                              if (updated.length <= i) {
                                updated.length = i + 1
                              }
                              updated[i] = trimmedValue
                              return updated
                            })
                            activePluIndexRef.current = null
                            setPLU(i, trimmedValue, true)
                            commitState({
                              category,
                              brand,
                              extension,
                              plus: nextPlus,
                              previewPathOverride,
                              captureMode,
                            })
                          }}
                          onPaste={(e) => {
                            if (pluDisabled) return
                            const text = e.clipboardData.getData("text")
                            if (/[\r\n\t,;|]/.test(text)) {
                              e.preventDefault()
                              applyPastedPLUs(i, text)
                            }
                          }}
                          placeholder={`PLU ${i + 1}`}
                          disabled={pluDisabled}
                          className={inputClass}
                          title={isExtracted ? "Extracted via OCR" : undefined}
                        />
                      )

                      // --- 6. Always render a stable wrapper to avoid input remounts ---
                      return (
                        <Tooltip key={i}>
                          <TooltipTrigger asChild>{inputEl}</TooltipTrigger>
                          {shouldCheck && !inAdpack ? (
                            <TooltipContent>
                              <p>PLU not in loaded AdPack</p>
                            </TooltipContent>
                          ) : null}
                        </Tooltip>
                      )
                    })}

                  </div></TooltipProvider>
                <p className="text-xs text-muted-foreground">
                  Tip: paste a column from Excel into any PLU field to auto-fill multiple rows.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <FacetBuilderCard
          scope={scope}
          dataset={dataset}
          onOpenDatasetPanel={onOpenDatasetPanel}
          selectedBrands={facetSelectedBrands}
          selectedArticleTypes={facetSelectedArticleTypes}
          onSelectedBrandsChange={onFacetSelectedBrandsChange}
          onSelectedArticleTypesChange={onFacetSelectedArticleTypesChange}
          detectedBrands={detectedBrands}
          onApplyExtension={(query) => {
            const nextExtension = query || ""
            setExtension(nextExtension)
            commitState({
              category,
              brand,
              extension: nextExtension,
              plus,
              previewPathOverride,
              captureMode,
            })
          }}
        />
        <FacetMatchesCard
          scope={scope}
          dataset={dataset}
          selectedBrands={facetSelectedBrands}
          selectedArticleTypes={facetSelectedArticleTypes}
          excludedPluIds={facetExcludedPluIds}
          onExcludedPluIdsChange={onFacetExcludedPluIdsChange}
          onConvertToPlu={convertToPluLink}
        />

        {/* Output */}
        <Card className="lg:col-span-1 flex flex-col lg:max-h-[calc(100vh-75px)]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Output</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {previewStatusText ? <span>{previewStatusText}</span> : null}
                {previewExtraControls}
                {onOpenPreview ? (
                  <Button type="button" size="sm" variant="outline" onClick={onOpenPreview}>
                    Open Preview
                  </Button>
                ) : null}
                {onLinkViaPreview ? (
                  <Button type="button" size="sm" variant="outline" onClick={onLinkViaPreview}>
                    Link via Preview
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Live Link (from Preview)</Label>
              <Input
                ref={liveLinkInputRef}
                value={liveLinkUrl || ""}
                onChange={(event) => onLiveLinkChange?.(event.target.value)}
                placeholder="Captured from Preview window"
                readOnly={!liveLinkEditable}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Label className="text-xs text-muted-foreground">Capture mode</Label>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={captureMode}
                onChange={(event) => {
                  const nextMode =
                    event.target.value === "filters-only"
                      ? "filters-only"
                      : "path+filters"
                  setCaptureMode(nextMode)
                  commitState({
                    category,
                    brand,
                    extension,
                    plus,
                    previewPathOverride,
                    captureMode: nextMode,
                  })
                }}
              >
                <option value="path+filters">Capture path + filters</option>
                <option value="filters-only">Capture filters only</option>
              </select>
            </div>
            <Label>Generated dynamic link</Label>
            <Textarea value={output} readOnly className="min-h-[180px]" />

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => copyText(output)} disabled={!isSavableOutput(output)}>
                Copy
              </Button>

              {showHistory ? (
                <Button type="button" onClick={saveCurrentToHistory} disabled={!isSavableOutput(output)}>
                  Save (Ctrl+S)
                </Button>
              ) : null}

              <Button type="button" variant="outline" onClick={resetBuilder}>
                Reset builder
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              <p>
                Current state:{" "}
                <span className="font-medium">
                  {category ? `Category=${category.label}` : brand ? `Brand=${brand.label}` : "No base"}
                </span>{" "}
                and{" "}
                <span className="font-medium">
                  {hasExtensionText ? (extensionValid ? "Extension" : "Invalid extension") : pluCount ? `${pluCount} PLU(s)` : "No refinement"}
                </span>
              </p>
            </div>
            <Separator className="my-3" />

            {showAdpack ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">AdPack Checker</h3>

                {adpackLoaded ? (
                  <Button type="button" variant="outline" size="sm" onClick={clearAdpack}>
                    Clear AdPack
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAdpackIsOpen((v) => !v)}
                  >
                    {adpackIsOpen ? "Hide" : "Load AdPack PLUs"}
                  </Button>
                )}
              </div>

              {adpackLoaded ? (
                <p className="text-sm text-muted-foreground">
                  An AdPack has been loaded. PLUs are being checked against this list.{" "}
                  <span className="font-medium">({adpackPLUs.length})</span>
                </p>
              ) : adpackIsOpen ? (
                <div className="space-y-2">
                  <Textarea
                    value={adpackInput}
                    onChange={(e) => setAdpackInput(e.target.value)}
                    placeholder="Paste PLUs from Excel here (column or row). Tabs/newlines supported."
                    className="min-h-[120px]"
                  />
                  <div className="flex gap-2">
                    <Button type="button" onClick={loadAdpackFromInput}>
                      Load PLUs
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setAdpackIsOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tip: you can paste directly from Excel. We'll trim and de-duplicate automatically.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AdPack loaded. Load an AdPack to validate PLUs as you enter them.
                </p>
              )}
            </div>
            ) : null}


          </CardContent>
        </Card>

        {/* History */}
        {showHistory ? (
        <Card className="lg:col-span-1 flex flex-col lg:max-h-[calc(100vh-75px)]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>History</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={clearHistory} disabled={savedLinks.length === 0}>
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadHistoryCsv}
                  disabled={savedLinks.length === 0}
                >
                  Download CSV
                </Button>

              </div>
            </div>
            <div className="space-y-2">
              <Label>Search history</Label>
              <div className="flex gap-2">
                <Input
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Type to filter (token match: e.g. catalog tridon)"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setHistoryQuery("")}
                  disabled={historyQuery.trim().length === 0}
                >
                  Clear
                </Button>
              </div>

              {savedLinks.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Showing <span className="font-medium">{filteredSavedLinks.length}</span> of{" "}
                  <span className="font-medium">{savedLinks.length}</span>
                </p>
              ) : null}
            </div>

            <Separator />

          </CardHeader>


          <CardContent className="flex-1 space-y-3 overflow-y-auto">
            {savedLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No saved links yet. Use Ctrl+S to save the current output.
              </p>
            ) : filteredSavedLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No matches for <span className="font-medium">{historyQuery.trim()}</span>.
              </p>
            ) : (
              filteredSavedLinks.map((item) => (
                <Card key={item.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                        <div className="mt-2 break-words text-sm font-medium">{item.output}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => copyText(item.output)}>
                        Copy
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => restoreSavedLink(item)}>
                        Restore
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => deleteSavedLink(item.id)}>
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>
        ) : null}
                </div>
      </main>
    </div>
  )
}
)

export default DynamicLinkBuilder

