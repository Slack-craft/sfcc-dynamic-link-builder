import { extensionRequest } from "@/lib/preview/extensionRequest"

type ExtensionStatus = "unknown" | "available" | "unavailable"

type PreviewOptions = {
  url: string
  extensionStatus: ExtensionStatus
  setExtensionStatus: (next: ExtensionStatus) => void
  onOpenWindow: () => void
  onBeforeOpen?: () => void
  onManualFallback?: () => void
  toastInfo: (message: string) => void
}

export async function openPreview({
  url,
  extensionStatus,
  setExtensionStatus,
  onOpenWindow,
  toastInfo,
}: PreviewOptions) {
  if (!url) return
  if (extensionStatus === "unavailable") {
    onOpenWindow()
    return
  }
  toastInfo("Opening preview...")
  try {
    await extensionRequest("SCA_OPEN_PREVIEW_WINDOW", { url }, 600)
    setExtensionStatus("available")
  } catch {
    setExtensionStatus("unavailable")
    onOpenWindow()
  }
}

export async function linkViaPreview({
  url,
  extensionStatus,
  setExtensionStatus,
  onOpenWindow,
  onBeforeOpen,
  onManualFallback,
  toastInfo,
}: PreviewOptions) {
  if (!url) return
  onBeforeOpen?.()

  const manualFallback = () => {
    onOpenWindow()
    onManualFallback?.()
    toastInfo(
      "Copy the URL in the preview (Ctrl+L, Ctrl+C), then click back into the app to paste into Live Link."
    )
  }

  if (extensionStatus === "unavailable") {
    manualFallback()
    return
  }
  toastInfo("Opening preview... Close the window to capture Live Link.")
  try {
    await extensionRequest("SCA_OPEN_LINK_VIA_PREVIEW", { url }, 600)
    setExtensionStatus("available")
  } catch {
    setExtensionStatus("unavailable")
    manualFallback()
  }
}
