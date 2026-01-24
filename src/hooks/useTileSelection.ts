import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react"
import type { CatalogueProject, Tile } from "@/tools/catalogue-builder/catalogueTypes"

export default function useTileSelection(
  project: CatalogueProject | null,
  onBeforeSelectRef?: MutableRefObject<(() => void) | null>
) {
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)

  const selectedTile = useMemo(() => {
    return project?.tiles.find((tile: Tile) => tile.id === selectedTileId) ?? null
  }, [project, selectedTileId])

  useEffect(() => {
    if (!project) {
      setSelectedTileId(null)
      return
    }
    if (!selectedTileId && project.tiles.length > 0) {
      setSelectedTileId(project.tiles[0].id)
      return
    }
    if (selectedTileId && !selectedTile) {
      setSelectedTileId(project.tiles[0]?.id ?? null)
    }
  }, [project, selectedTileId, selectedTile])

  const selectTile = useCallback(
    (tileId: string) => {
      if (tileId === selectedTileId) return
      onBeforeSelectRef?.current?.()
      setSelectedTileId(tileId)
    },
    [onBeforeSelectRef, selectedTileId]
  )

  const selectTileByOffset = useCallback(
    (offset: number) => {
      if (!project || project.tiles.length === 0) return
      const currentIndex = project.tiles.findIndex((tile) => tile.id === selectedTileId)
      if (currentIndex === -1) return
      const nextIndex = currentIndex + offset
      if (nextIndex < 0 || nextIndex >= project.tiles.length) return
      onBeforeSelectRef?.current?.()
      setSelectedTileId(project.tiles[nextIndex].id)
    },
    [onBeforeSelectRef, project, selectedTileId]
  )

  return {
    selectedTileId,
    setSelectedTileId,
    selectedTile,
    selectTile,
    selectTileByOffset,
  }
}
