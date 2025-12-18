import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"




import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

import { toast } from "sonner"

// -----------------------------
// Types + sample data
// Replace these arrays later with your real datasets
// label = what users see, value = what goes into the URL
// -----------------------------
type Option = { label: string; value: string }

const CATEGORY_OPTIONS: Option[] = [
  { label: "Catalog", value: "catalogue-onsale" },
  { label: "Spare Parts", value: "spare-parts" },
]

const BRAND_OPTIONS: Option[] = [
  { label: "Bendix", value: "SCA0108" },
  { label: "Tridon", value: "SCA0123" },
]

// -----------------------------
// History types
// -----------------------------
type SavedLink = {
  id: string
  createdAt: string // ISO
  output: string

  category: Option | null
  brand: Option | null
  extension: string
  plus: string[] // length 20
}

const HISTORY_STORAGE_KEY = "sca_dynamic_link_builder_history_v1"

// -----------------------------
// Helpers
// -----------------------------

const ADPACK_STORAGE_KEY = "sca_dynamic_link_builder_adpack_plus_v1"

function parsePlusFromText(raw: string): string[] {
  return raw
    .split(/[\r\n\t,;|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
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
  options: Option[]
  value: Option | null
  onChange: (opt: Option | null) => void
  disabled?: boolean
  onCommitNext?: () => void // NEW: called after Tab-select
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}) {
  const { label, placeholder = "Select…", options, value, onChange, disabled, onCommitNext } = props
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
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={disabled}>
            Clear
          </Button>
        ) : null}
      </div>

      <Popover
        open={open}
        onOpenChange={(o) => {
          if (disabled) return
          setOpen(o)
          if (o) setQuery("") // reset search when opening
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ref={props.triggerRef}
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={disabled}
          >
            {value ? value.label : placeholder}
            <span className="ml-2 text-muted-foreground">▾</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={`Type to search ${label.toLowerCase()}…`}
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

      {disabled ? <p className="text-xs text-muted-foreground">Disabled by selection rules.</p> : null}
    </div>
  )
}


// -----------------------------
// Main App
// -----------------------------
export default function App() {
  // Base selection (mutually exclusive)
  const [category, setCategory] = useState<Option | null>(null)
  const [brand, setBrand] = useState<Option | null>(null)
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
  const [extension, setExtension] = useState("")
  const [plus, setPlus] = useState<string[]>(Array.from({ length: 20 }, () => ""))

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

  function setPLU(index: number, value: string) {
    setPlus((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function clearPLUs() {
    setPlus(Array.from({ length: 20 }, () => ""))
  }

  function clearExtension() {
    setExtension("")
  }

  function resetBuilder() {
    setCategory(null)
    setBrand(null)
    setExtension("")
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

    setPlus((prev) => {
      const next = [...prev]
      for (let i = 0; i < tokens.length; i++) {
        const idx = startIndex + i
        if (idx >= next.length) break
        next[idx] = tokens[i]
      }
      return next
    })

    toast.success(`Pasted ${Math.min(tokens.length, 20 - startIndex)} PLU(s)`)
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
    setPlus(Array.from({ length: 20 }, (_, i) => item.plus?.[i] ?? ""))

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
      plus: Array.from({ length: 20 }, (_, i) => (plus[i] ?? "").trim()),
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

  // Ctrl+S / Cmd+S shortcut
  useEffect(() => {
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
  }, [output, category, brand, extension, plus])


  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <h1 className="text-xl font-semibold">Dynamic Link Builder</h1>
          <Badge variant="secondary">Internal Tool</Badge>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-3 lg:items-stretch">
        {/* Inputs */}
        <Card className="lg:col-span-1 flex flex-col lg:max-h-[calc(100vh-120px)]">
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Base selection */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Base Link Type (pick one)</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCategory(null)
                    setBrand(null)
                  }}
                >
                  Clear base
                </Button>
              </div>

              <SearchableSelect
                label="Category"
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={(opt) => {
                  setCategory(opt)
                  if (opt) setBrand(null)
                }}
                disabled={categoryDisabled}
                placeholder="Type to search categories…"
                onCommitNext={() => extensionRef.current?.focus()}
                triggerRef={categoryTriggerRef}
              />


              <SearchableSelect
                label="Brand"
                options={BRAND_OPTIONS}
                value={brand}
                onChange={(opt) => {
                  setBrand(opt)
                  if (opt) setCategory(null)
                }}
                disabled={brandDisabled}
                placeholder="Type to search brands…"
                onCommitNext={() => extensionRef.current?.focus()}
              />

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
                <Label>Extension (paste a full URL)</Label>
                <Textarea
                  ref={extensionRef}
                  value={extension}
                  onChange={(e) => setExtension(e.target.value)}
                  placeholder="https://www.supercheapauto.com.au/spare-parts?prefn1=...&sz=36"
                  disabled={extensionDisabled}
                />

                {hasExtensionText && !extensionValid ? (
                  <p className="text-sm text-destructive">
                    Extension must include a <code>?</code> (or be query params like <code>prefn1=...&prefv1=...</code>).
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The filter selection will be extracted automatically.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>PLUs (1–20)</Label>
                <TooltipProvider delayDuration={250}>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {plus.map((plu, i) => {
                      // --- 1. Normalise the current PLU ---
                      const trimmed = plu.trim()

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

                      // --- 5. Build the Input ONCE ---
                      const inputEl = (
                        <Input
                          value={plu}
                          onChange={(e) => setPLU(i, e.target.value)}
                          onBlur={() => setPLU(i, plu.trim())}
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
                          className={adpackClass}
                        />
                      )

                      // --- 6. Return input normally OR wrapped in tooltip ---
                      return !shouldCheck || inAdpack ? (
                        <div key={i}>{inputEl}</div>
                      ) : (
                        <Tooltip key={i}>
                          <TooltipTrigger asChild>{inputEl}</TooltipTrigger>
                          <TooltipContent>
                            <p>PLU not in loaded AdPack</p>
                          </TooltipContent>
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

        {/* Output */}
        <Card className="lg:col-span-1 flex flex-col lg:max-h-[calc(100vh-120px)]">
          <CardHeader>
            <CardTitle>Output</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>Generated dynamic link</Label>
            <Textarea value={output} readOnly className="min-h-[180px]" />

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => copyText(output)} disabled={!isSavableOutput(output)}>
                Copy
              </Button>

              <Button type="button" onClick={saveCurrentToHistory} disabled={!isSavableOutput(output)}>
                Save (Ctrl+S)
              </Button>

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
                ·{" "}
                <span className="font-medium">
                  {hasExtensionText ? (extensionValid ? "Extension" : "Invalid extension") : pluCount ? `${pluCount} PLU(s)` : "No refinement"}
                </span>
              </p>
            </div>
            <Separator className="my-3" />

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
                    Tip: you can paste directly from Excel. We’ll trim and de-duplicate automatically.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AdPack loaded. Load an AdPack to validate PLUs as you enter them.
                </p>
              )}
            </div>


          </CardContent>
        </Card>

        {/* History */}
        <Card className="lg:col-span-1 flex flex-col lg:max-h-[calc(100vh-120px)]">
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
                  placeholder="Type to filter… (token match: e.g. catalog tridon)"
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
      </main>
    </div>
  )
}
