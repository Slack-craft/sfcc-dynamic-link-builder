import type { ReactNode } from "react"

type CatalogueHeaderProps = {
  projectName: string
  projectScope?: string
  onBackToProjects: () => void
  onOpenTileDetection: () => void
  rightSlot?: ReactNode
}

export default function CatalogueHeader({
  projectName,
  projectScope,
  onBackToProjects: _onBackToProjects,
  onOpenTileDetection: _onOpenTileDetection,
  rightSlot,
}: CatalogueHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{projectName}</h2>
        <p className="text-sm text-muted-foreground">
          Manage tiles for your catalogue project.
          {projectScope ? ` (${projectScope})` : ""}
        </p>
      </div>
      {rightSlot ?? null}
    </div>
  )
}
