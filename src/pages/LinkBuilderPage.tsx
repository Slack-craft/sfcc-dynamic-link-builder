import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import DynamicLinkBuilder from "@/tools/link-builder/DynamicLinkBuilder"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"
import { BRAND_OPTIONS } from "@/data/brands"
import { extensionRequest } from "@/lib/preview/extensionRequest"
import { hasExtensionPing } from "@/lib/preview/hasExtension"
import { toast } from "sonner"

function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function buildIdFilter(pluValues: string[]) {
  const joined = pluValues.join("%7c")
  return `?prefn1=id&prefv1=${joined}`
}

function buildPlusArray(values: string[]) {
  return Array.from({ length: Math.max(20, values.length) }, (_, index) => {
    return values[index] ?? ""
  })
}

function isBrandPath(pathname: string) {
  return /^\/brands\/[^/]+$/i.test(pathname)
}

function getBrandStub(pathname: string) {
  const match = pathname.match(/^\/brands\/([^/]+)/i)
  return match?.[1] ?? ""
}

function buildPreviewUrlFromState(state: LinkBuilderState, scope: "AU" | "NZ" = "AU") {
  const domain =
    scope === "NZ"
      ? "https://staging.supercheapauto.co.nz"
      : "https://staging.supercheapauto.com.au"

  const cleanedPLUs = state.plus.map((p) => p.trim()).filter((p) => p.length > 0)
  const isSinglePlu = cleanedPLUs.length === 1
  const isMultiPlu = cleanedPLUs.length > 1

  if (isSinglePlu) {
    return `${domain}/p/sca-product/${cleanedPLUs[0]}.html`
  }

  if (isMultiPlu) {
    return `${domain}/${buildIdFilter(cleanedPLUs)}`
  }

  const previewPathOverride = state.previewPathOverride ?? ""
  let derivedPath = previewPathOverride
  if (!derivedPath && state.brand) {
    derivedPath = `/brands/${slugifyLabel(state.brand.label)}`
  }
  if (!derivedPath && state.category?.value === "catalogue-onsale") {
    derivedPath = "/catalogue-out-now"
  }

  if (derivedPath) {
    return `${domain}${derivedPath}`
  }

  return domain
}

export default function LinkBuilderPage() {
  const [builderState, setBuilderState] = useState<LinkBuilderState>({
    category: null,
    brand: null,
    plus: Array.from({ length: 20 }, () => ""),
    previewPathOverride: "",
    captureMode: "path+filters",
  })
  const [facetSelectedBrands, setFacetSelectedBrands] = useState<string[]>([])
  const [facetSelectedArticleTypes, setFacetSelectedArticleTypes] = useState<string[]>([])
  const [facetExcludedPluIds, setFacetExcludedPluIds] = useState<string[]>([])
  const [liveLinkUrl, setLiveLinkUrl] = useState("")
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false)
  const [pendingCapturedUrl, setPendingCapturedUrl] = useState<string | null>(null)
  const [awaitingManualLink, setAwaitingManualLink] = useState(false)
  const [extensionStatus, setExtensionStatus] = useState<
    "unknown" | "available" | "unavailable"
  >("unknown")
  const liveLinkInputRef = useRef<HTMLInputElement | null>(null)

  const previewUrl = useMemo(
    () => buildPreviewUrlFromState(builderState, "AU"),
    [builderState]
  )

  useEffect(() => {
    let cancelled = false
    async function checkExtension() {
      const pinged = await hasExtensionPing(180)
      if (cancelled) return
      setExtensionStatus(pinged ? "available" : "unavailable")
    }
    void checkExtension()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg || msg.type !== "SCA_LINK_SESSION_CLOSED") return
      if (!msg.finalUrl) return
      handleCapturedUrl(msg.finalUrl)
      setAwaitingManualLink(false)
      setExtensionStatus("available")
      toast.success("Live Link captured")
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [builderState])

  function convertCapturedUrlToBuilderState(
    finalUrl: string,
    currentState: LinkBuilderState
  ) {
    let parsed: URL
    try {
      parsed = new URL(finalUrl)
    } catch {
      return { nextState: currentState, didConvert: false, warnings: ["Invalid URL"] }
    }

    const pathname = parsed.pathname ?? ""
    const params = new URLSearchParams(parsed.search)

    const productMatch = pathname.match(/\/p\/[^/]+\/(\d{4,8})\.html/i)
    if (productMatch) {
      const plu = productMatch[1]
      return {
        nextState: {
          ...currentState,
          category: null,
          brand: null,
          plus: buildPlusArray([plu]),
          previewPathOverride: "",
        },
        didConvert: true,
        warnings: [],
      }
    }

    const prefn1 = params.get("prefn1")
    const prefv1 = params.get("prefv1")
    if (prefn1?.toLowerCase() === "id" && prefv1) {
      const parsedPlus = prefv1
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean)
      if (parsedPlus.length > 0) {
        const baseState =
          currentState.category || currentState.brand
            ? currentState
            : { ...currentState, category: { label: "Catalog", value: "catalogue-onsale" } }
        return {
          nextState: {
            ...baseState,
            plus: buildPlusArray(parsedPlus),
            previewPathOverride: "",
          },
          didConvert: true,
          warnings: [],
        }
      }
    }

    if (pathname === "/catalogue-out-now") {
      return {
        nextState: {
          ...currentState,
          category: { label: "Catalog", value: "catalogue-onsale" },
          brand: null,
          plus: buildPlusArray([]),
          previewPathOverride: "/catalogue-out-now",
        },
        didConvert: true,
        warnings: [],
      }
    }

    if (isBrandPath(pathname)) {
      const stub = getBrandStub(pathname)
      const match = BRAND_OPTIONS.find(
        (option) => slugifyLabel(option.label) === stub
      )
      if (!match) {
        return {
          nextState: currentState,
          didConvert: false,
          warnings: ["Unable to map brand from captured URL."],
        }
      }
      return {
        nextState: {
          ...currentState,
          brand: match,
          category: null,
          plus: buildPlusArray([]),
          previewPathOverride: pathname,
        },
        didConvert: true,
        warnings: [],
      }
    }

    return {
      nextState: currentState,
      didConvert: false,
      warnings: ["Unable to convert this URL to a dynamic link yet."],
    }
  }

  function handleCapturedUrl(finalUrl: string) {
    setLiveLinkUrl(finalUrl)
    setPendingCapturedUrl(finalUrl)
    setCaptureDialogOpen(true)
  }

  useEffect(() => {
    if (!awaitingManualLink) return
    let active = true
    async function onPointerDown(event: PointerEvent) {
      if (!active) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return
      }
      active = false
      window.removeEventListener("pointerdown", onPointerDown, { capture: true } as AddEventListenerOptions)
      try {
        const text = await navigator.clipboard.readText()
        const trimmed = text.trim()
        const isAllowed =
          trimmed.startsWith("https://staging.supercheapauto.com.au/") ||
          trimmed.startsWith("https://staging.supercheapauto.co.nz/")
        if (isAllowed) {
          handleCapturedUrl(trimmed)
          setAwaitingManualLink(false)
          toast.success("Live Link pasted")
          return
        }
      } catch {
        // ignore clipboard errors
      }
      setAwaitingManualLink(false)
      liveLinkInputRef.current?.focus()
      toast.info("Paste the URL into Live Link.")
    }

    window.addEventListener("pointerdown", onPointerDown, { capture: true })
    return () => {
      active = false
      window.removeEventListener("pointerdown", onPointerDown, { capture: true } as AddEventListenerOptions)
    }
  }, [awaitingManualLink, builderState])

  const handleOpenPreview = useCallback(async () => {
    if (!previewUrl) return
    if (extensionStatus === "unavailable") {
      window.open(previewUrl, "scaPreview", "popup,width=1200,height=800")
      return
    }
    toast.info("Opening preview...")
    try {
      await extensionRequest("SCA_OPEN_PREVIEW_WINDOW", { url: previewUrl }, 600)
      setExtensionStatus("available")
    } catch {
      setExtensionStatus("unavailable")
      window.open(previewUrl, "scaPreview", "popup,width=1200,height=800")
    }
  }, [extensionStatus, previewUrl])

  const handleLinkViaPreview = useCallback(async () => {
    if (!previewUrl) return
    const manualFallback = () => {
      window.open(previewUrl, "scaPreview", "popup,width=1200,height=800")
      setAwaitingManualLink(true)
      toast.info("Copy the URL in the preview (Ctrl+L, Ctrl+C), then click back into the app to paste into Live Link.")
    }

    if (extensionStatus === "unavailable") {
      manualFallback()
      return
    }
    toast.info("Opening preview... Close the window to capture Live Link.")
    try {
      await extensionRequest("SCA_OPEN_LINK_VIA_PREVIEW", { url: previewUrl }, 600)
      setExtensionStatus("available")
    } catch {
      setExtensionStatus("unavailable")
      manualFallback()
    }
  }, [extensionStatus, previewUrl])

  return (
    <>
    <DynamicLinkBuilder
      initialState={builderState}
      onChange={setBuilderState}
      scope="AU"
      dataset={null}
      facetSelectedBrands={facetSelectedBrands}
      facetSelectedArticleTypes={facetSelectedArticleTypes}
      onFacetSelectedBrandsChange={setFacetSelectedBrands}
      onFacetSelectedArticleTypesChange={setFacetSelectedArticleTypes}
      facetExcludedPluIds={facetExcludedPluIds}
      onFacetExcludedPluIdsChange={setFacetExcludedPluIds}
      detectedBrands={[]}
      liveLinkUrl={liveLinkUrl}
      onLiveLinkChange={setLiveLinkUrl}
        liveLinkEditable={extensionStatus !== "available"}
        liveLinkInputRef={liveLinkInputRef}
        previewUrl={previewUrl}
        onOpenPreview={handleOpenPreview}
        onLinkViaPreview={handleLinkViaPreview}
        previewStatusText={
          extensionStatus === "available"
            ? "Extension enabled"
            : "Extension not installed - manual paste required"
        }
      />
      <Dialog open={captureDialogOpen} onOpenChange={setCaptureDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply captured link?</DialogTitle>
            <DialogDescription>
              This can overwrite current manual link settings to build a dynamic link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCaptureDialogOpen(false)
                setPendingCapturedUrl(null)
              }}
            >
              Capture only
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!pendingCapturedUrl) {
                  setCaptureDialogOpen(false)
                  setPendingCapturedUrl(null)
                  return
                }
                const { nextState, didConvert, warnings } =
                  convertCapturedUrlToBuilderState(pendingCapturedUrl, builderState)
                if (didConvert) {
                  setBuilderState(nextState)
                } else {
                  toast.warning(warnings[0] ?? "Unable to convert this URL yet.")
                }
                setCaptureDialogOpen(false)
                setPendingCapturedUrl(null)
              }}
            >
              Convert to Dynamic
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
