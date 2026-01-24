import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

type TileListPanelProps = {
  missingTilesCount: number
  showMissingOnly: boolean
  onToggleShowMissingOnly: () => void
  children: ReactNode
}

export default function TileListPanel({
  missingTilesCount,
  showMissingOnly,
  onToggleShowMissingOnly,
  children,
}: TileListPanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase text-muted-foreground">Tiles</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={missingTilesCount === 0}
          onClick={onToggleShowMissingOnly}
        >
          {showMissingOnly ? "Show all" : "Show missing only"}
        </Button>
      </div>
      {children}
    </div>
  )
}
