import { useEffect } from "react"

export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName?.toLowerCase()
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  if (el.isContentEditable) return true
  const role = el.getAttribute?.("role")
  return role === "combobox" || role === "listbox" || role === "textbox"
}

type UseGlobalShortcutsParams = {
  onSave: () => void
  onSaveAndNext?: () => void
  isEnabled?: boolean
  isTypingTargetFn?: (target: EventTarget | null) => boolean
}

export default function useGlobalShortcuts({
  onSave,
  onSaveAndNext,
  isEnabled = true,
}: UseGlobalShortcutsParams) {
  useEffect(() => {
    if (!isEnabled) return

    function onKeyDown(event: KeyboardEvent) {
      const isCmdOrCtrl = event.metaKey || event.ctrlKey
      if (isCmdOrCtrl && event.key.toLowerCase() === "s" && event.shiftKey) {
        event.preventDefault()
        onSaveAndNext?.()
        return
      }
      if (isCmdOrCtrl && event.key.toLowerCase() === "s") {
        event.preventDefault()
        onSave()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isEnabled, onSave])
}
