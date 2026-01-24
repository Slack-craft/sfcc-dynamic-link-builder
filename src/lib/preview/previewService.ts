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
  onOpenWindow,
  toastInfo,
}: PreviewOptions) {
  if (!url) return
  toastInfo("Opening preview...")
  onOpenWindow()
}

export async function linkViaPreview({
  url,
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

  manualFallback()
}
