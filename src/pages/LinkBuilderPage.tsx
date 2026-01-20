import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import DynamicLinkBuilder from "@/tools/link-builder/DynamicLinkBuilder"
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

function extractQueryOnly(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return ""
  if (trimmed.startsWith("?")) return trimmed
  try {
    const parsed = new URL(trimmed)
    return parsed.search || ""
  } catch {
    const index = trimmed.indexOf("?")
    return index >= 0 ? trimmed.slice(index) : ""
  }
}

function buildIdFilter(pluValues: string[]) {
  const joined = pluValues.join("%7c")
  return `?prefn1=id&prefv1=${joined}`
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

  const extensionQuery = extractQueryOnly(state.extension)
  const cleanedPLUs = state.plus.map((p) => p.trim()).filter((p) => p.length > 0)
  const hasExtensionText = state.extension.trim().length > 0
  const isSinglePlu = !hasExtensionText && cleanedPLUs.length === 1
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
    return `${domain}${derivedPath}${extensionQuery}`
  }

  if (extensionQuery) {
    return `${domain}${extensionQuery}`
  }

  return domain
}

export default function LinkBuilderPage() {
  const [builderState, setBuilderState] = useState<LinkBuilderState>({
    category: null,
    brand: null,
    extension: "",
    plus: Array.from({ length: 20 }, () => ""),
    previewPathOverride: "",
    captureMode: "path+filters",
  })
  const [liveLinkUrl, setLiveLinkUrl] = useState("")
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
      setLiveLinkUrl(msg.finalUrl)
      setAwaitingManualLink(false)
      setExtensionStatus("available")
      applyCapturedUrl(msg.finalUrl)
      toast.success("Live Link captured")
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [builderState])

  function applyCapturedUrl(finalUrl: string) {
    let parsed: URL
    try {
      parsed = new URL(finalUrl)
    } catch {
      return
    }

    const capturedSearch = parsed.search ?? ""
    const pathname = parsed.pathname ?? ""
    const captureMode = builderState.captureMode ?? "path+filters"
    const cleanedPLUs = builderState.plus
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
    const hasExtensionText = builderState.extension.trim().length > 0
    const isSinglePlu = !hasExtensionText && cleanedPLUs.length === 1
    const isMultiPlu = cleanedPLUs.length > 1
    const manualBaseMode = !isSinglePlu && !isMultiPlu

    if (!manualBaseMode) return

    const nextState: LinkBuilderState = {
      ...builderState,
    }

    if (capturedSearch) {
      nextState.extension = capturedSearch
    }

    if (captureMode === "path+filters") {
      if (isBrandPath(pathname)) {
        nextState.previewPathOverride = pathname
        const stub = getBrandStub(pathname)
        const match = BRAND_OPTIONS.find(
          (option) => slugifyLabel(option.label) === stub
        )
        if (match) {
          nextState.brand = match
          nextState.category = null
        }
      } else if (pathname === "/catalogue-out-now") {
        nextState.previewPathOverride = "/catalogue-out-now"
      }
    }

    setBuilderState(nextState)
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
          setLiveLinkUrl(trimmed)
          setAwaitingManualLink(false)
          applyCapturedUrl(trimmed)
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
    <DynamicLinkBuilder
      initialState={builderState}
      onChange={setBuilderState}
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
  )
}
