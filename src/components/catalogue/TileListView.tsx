import { memo, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info } from "lucide-react"
import { formatMappingInfo } from "@/lib/catalogue/format"
import type { Tile } from "@/tools/catalogue-builder/catalogueTypes"

type TileCardProps = {
  tile: Tile
  isSelected: boolean
  thumbUrl?: string
  onSelect: (tileId: string) => void
  isDev: boolean
}

const TileCard = memo(function TileCard({
  tile,
  isSelected,
  thumbUrl,
  onSelect,
  isDev,
}: TileCardProps) {
  const renders = useRef(0)
  renders.current += 1
  if (isDev && renders.current % 20 === 0) {
    console.log("[TileCard] renders", renders.current, tile.id)
  }
  const mappingInfo = formatMappingInfo(tile.originalFileName ?? tile.id)
  return (
    <button
      type="button"
      onClick={() => onSelect(tile.id)}
      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
        isSelected ? "border-primary bg-muted" : "border-border hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt=""
              className="h-10 w-10 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="h-10 w-10 rounded-md border border-dashed border-border" />
          )}
          <span className="font-medium">{tile.id}</span>
        </div>
        <div className="flex items-center gap-2">
          {tile.pdfMappingStatus === "missing" ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="text-[10px] uppercase">
                    Missing
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {tile.pdfMappingReason ?? "Missing PDF mapping"} ({mappingInfo})
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          {tile.mappedSpreadNumber ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground">
                    <Info className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {`Spread ${tile.mappedSpreadNumber} - ${tile.mappedPdfFilename ?? "PDF"} - ${
                    tile.mappedHalf ?? "?"
                  } - box ${tile.mappedBoxIndex ?? "?"}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <span className="text-xs uppercase text-muted-foreground">{tile.status}</span>
        </div>
      </div>
      {tile.title ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {tile.title.length > 80 ? `${tile.title.slice(0, 80)}...` : tile.title}
        </div>
      ) : null}
    </button>
  )
})

type TileListViewProps = {
  tiles: Tile[]
  selectedTileId: string | null
  tileThumbUrls: Record<string, string>
  onSelectTile: (tileId: string) => void
  isDev: boolean
}

const TileListView = memo(function TileListView({
  tiles,
  selectedTileId,
  tileThumbUrls,
  onSelectTile,
  isDev,
}: TileListViewProps) {
  const renders = useRef(0)
  renders.current += 1
  if (isDev && renders.current % 20 === 0) {
    console.log("[TileList] renders", renders.current)
  }
  return (
    <div className="space-y-2">
      {tiles.map((tile) => (
        <TileCard
          key={tile.id}
          tile={tile}
          isSelected={tile.id === selectedTileId}
          thumbUrl={tileThumbUrls[tile.id]}
          onSelect={onSelectTile}
          isDev={isDev}
        />
      ))}
    </div>
  )
})

export default TileListView
