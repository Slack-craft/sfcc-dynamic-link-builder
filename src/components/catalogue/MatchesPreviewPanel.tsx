import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { FixedSizeGrid } from "react-window"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { CsvRow } from "@/lib/catalogueDataset/parseCsv"

type MatchItem = { plu: string; row: CsvRow | null; notFound?: boolean }

type MatchesPreviewPanelProps = {
  datasetPresent: boolean
  isFacetMode: boolean
  isPluMode: boolean
  selectedBrandsCount: number
  displayCount: number
  displayItems: MatchItem[]
  renderCard: (item: MatchItem) => React.ReactNode
  onOpenDatasetPanel?: () => void
}

export default function MatchesPreviewPanel({
  datasetPresent,
  isFacetMode,
  isPluMode,
  selectedBrandsCount,
  displayCount,
  displayItems,
  renderCard,
  onOpenDatasetPanel,
}: MatchesPreviewPanelProps) {
  return (
    <>
      {isFacetMode && !datasetPresent ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            No dataset loaded for this project.
          </p>
          {onOpenDatasetPanel ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenDatasetPanel}>
              Open Project Dataset
            </Button>
          ) : null}
        </div>
      ) : null}
      {datasetPresent ? (
        isFacetMode && selectedBrandsCount === 0 ? (
          <p className="px-6 text-xs text-muted-foreground">
            Select a brand to preview dataset matches.
          </p>
        ) : displayCount === 0 ? (
          <p className="px-6 text-xs text-muted-foreground">
            {isPluMode ? "No PLUs to preview." : "No matching products."}
          </p>
        ) : (
          <TooltipProvider>
            <div className="space-y-4">
              <VirtualizedProductGrid
                items={displayItems}
                renderCard={renderCard}
                heightClassName="h-[70vh] overflow-hidden"
              />
            </div>
          </TooltipProvider>
        )
      ) : null}
    </>
  )
}

type VirtualizedProductGridProps = {
  items: MatchItem[]
  renderCard: (item: MatchItem) => React.ReactNode
  minColumnWidth?: number
  rowHeight?: number
  heightClassName?: string
}

function VirtualizedProductGrid({
  items,
  renderCard,
  minColumnWidth = 220,
  rowHeight = 340,
  heightClassName = "h-[60vh] overflow-hidden",
}: VirtualizedProductGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const columnCount = useMemo(() => {
    if (size.width === 0) return 1
    return Math.max(1, Math.floor(size.width / minColumnWidth))
  }, [minColumnWidth, size.width])

  const columnWidth = useMemo(() => {
    if (size.width === 0) return minColumnWidth
    return Math.floor(size.width / columnCount)
  }, [columnCount, minColumnWidth, size.width])

  const rowCount = useMemo(() => {
    if (items.length === 0) return 0
    return Math.ceil(items.length / columnCount)
  }, [columnCount, items.length])

  return (
    <div ref={containerRef} className={`${heightClassName} w-full overflow-x-hidden`}>
      {size.width > 0 && size.height > 0 ? (
        <FixedSizeGrid
          columnCount={columnCount}
          columnWidth={columnWidth}
          height={size.height}
          rowCount={rowCount}
          rowHeight={rowHeight}
          width={size.width}
          className="overflow-x-hidden"
          style={{ overflowX: "hidden" }}
        >
          {({
            columnIndex,
            rowIndex,
            style,
          }: {
            columnIndex: number
            rowIndex: number
            style: CSSProperties
          }) => {
            const index = rowIndex * columnCount + columnIndex
            if (index >= items.length) return null
            return (
              <div style={{ ...style, boxSizing: "border-box", padding: "8px" }}>
                {renderCard(items[index])}
              </div>
            )
          }}
        </FixedSizeGrid>
      ) : null}
    </div>
  )
}
