import { useCallback, useEffect, useState, type MutableRefObject } from "react"
import type { CatalogueProject, Tile, TileStatus } from "@/tools/catalogue-builder/catalogueTypes"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"
import { createEmptyExtractedFlags } from "@/lib/catalogue/plu"
import { createEmptyLinkBuilderState } from "@/lib/catalogue/link"

type CommitResult = { state: LinkBuilderState; output: string } | undefined

type UseTileDraftStateParams = {
  project: CatalogueProject | null
  selectedTile: Tile | null
  updateTile: (
    project: CatalogueProject,
    tileId: string,
    overrides: Partial<Tile>
  ) => CatalogueProject
  onUpsertProject: (updated: CatalogueProject) => void
  commitBuilderState: () => CommitResult
  beforeSelectRef?: MutableRefObject<(() => void) | null>
  getActiveLinkMode?: () => Tile["activeLinkMode"]
  getUserHasChosenMode?: () => boolean
  getFacetBrands?: () => string[]
  getFacetArticleTypes?: () => string[]
}

export default function useTileDraftState({
  project,
  selectedTile,
  updateTile,
  onUpsertProject,
  commitBuilderState,
  beforeSelectRef,
  getActiveLinkMode,
  getUserHasChosenMode,
  getFacetBrands,
  getFacetArticleTypes,
}: UseTileDraftStateParams) {
  const [draftTitle, setDraftTitle] = useState("")
  const [draftTitleEditedManually, setDraftTitleEditedManually] = useState(false)
  const [draftStatus, setDraftStatus] = useState<TileStatus>("todo")
  const [draftNotes, setDraftNotes] = useState("")
  const [draftLinkState, setDraftLinkState] = useState<LinkBuilderState>(() =>
    createEmptyLinkBuilderState()
  )
  const [draftLinkOutput, setDraftLinkOutput] = useState("")
  const [draftExtractedFlags, setDraftExtractedFlags] = useState<boolean[]>(() =>
    createEmptyExtractedFlags()
  )
  const [draftFacetBrands, setDraftFacetBrands] = useState<string[]>([])
  const [draftFacetArticleTypes, setDraftFacetArticleTypes] = useState<string[]>([])
  const [draftFacetExcludedPluIds, setDraftFacetExcludedPluIds] = useState<string[]>([])
  const [draftFacetExcludePercentEnabled, setDraftFacetExcludePercentEnabled] = useState(false)
  const [draftLiveCapturedUrl, setDraftLiveCapturedUrl] = useState("")
  const [draftLinkSource, setDraftLinkSource] = useState<"manual" | "live">("manual")

  useEffect(() => {
    if (!selectedTile) {
      setDraftTitle("")
      setDraftTitleEditedManually(false)
      setDraftStatus("todo")
      setDraftNotes("")
      setDraftLinkState(createEmptyLinkBuilderState())
      setDraftLinkOutput("")
      setDraftExtractedFlags(createEmptyExtractedFlags())
      setDraftFacetBrands([])
      setDraftFacetArticleTypes([])
      setDraftFacetExcludedPluIds([])
      setDraftFacetExcludePercentEnabled(false)
      setDraftLiveCapturedUrl("")
      setDraftLinkSource("manual")
      return
    }
    setDraftTitle(selectedTile.title ?? "")
    setDraftTitleEditedManually(selectedTile.titleEditedManually ?? false)
    setDraftStatus(selectedTile.status)
    setDraftNotes(selectedTile.notes ?? "")
    const nextLinkState = selectedTile.linkBuilderState ?? createEmptyLinkBuilderState()
    setDraftLinkState(nextLinkState)
    setDraftLinkOutput(selectedTile.dynamicLink ?? "")
    setDraftExtractedFlags(selectedTile.extractedPluFlags ?? createEmptyExtractedFlags())
    setDraftLiveCapturedUrl(selectedTile.liveCapturedUrl ?? "")
    setDraftLinkSource(selectedTile.linkSource ?? "manual")
    setDraftFacetBrands(selectedTile.facetBuilder?.selectedBrands ?? [])
    setDraftFacetArticleTypes(selectedTile.facetBuilder?.selectedArticleTypes ?? [])
    setDraftFacetExcludedPluIds(selectedTile.facetBuilder?.excludedPluIds ?? [])
    setDraftFacetExcludePercentEnabled(
      selectedTile.facetBuilder?.excludePercentMismatchesEnabled ?? false
    )
  }, [selectedTile])

  function saveSelectedTile(overrides?: {
    linkBuilderState?: LinkBuilderState
    dynamicLink?: string
    liveCapturedUrl?: string
    linkSource?: "manual" | "live"
    activeLinkMode?: Tile["activeLinkMode"]
    userHasChosenMode?: boolean
  }) {
    if (!project || !selectedTile) return
    const liveCaptured = overrides?.liveCapturedUrl ?? draftLiveCapturedUrl
    const linkSource = overrides?.linkSource ?? draftLinkSource
    const activeLinkMode =
      overrides?.activeLinkMode ?? getActiveLinkMode?.() ?? selectedTile.activeLinkMode
    const userHasChosenMode =
      overrides?.userHasChosenMode ??
      getUserHasChosenMode?.() ??
      selectedTile.userHasChosenMode ??
      false
    const selectedBrands = getFacetBrands?.() ?? draftFacetBrands
    const selectedArticleTypes = getFacetArticleTypes?.() ?? draftFacetArticleTypes
    const updated = updateTile(project, selectedTile.id, {
      title: draftTitle.trim() || undefined,
      titleEditedManually: draftTitleEditedManually,
      status: draftStatus,
      notes: draftNotes.trim() || undefined,
      dynamicLink: overrides?.dynamicLink?.trim() || draftLinkOutput.trim() || undefined,
      liveCapturedUrl: liveCaptured.trim() || undefined,
      linkSource,
      linkBuilderState: overrides?.linkBuilderState ?? draftLinkState,
      extractedPluFlags: draftExtractedFlags,
      activeLinkMode,
      userHasChosenMode,
      facetBuilder: {
        selectedBrands,
        selectedArticleTypes,
        excludedPluIds: draftFacetExcludedPluIds,
        excludePercentMismatchesEnabled: draftFacetExcludePercentEnabled,
      },
    })
    onUpsertProject(updated)
  }

  const commitAndSaveSelectedTile = useCallback(() => {
    if (!selectedTile) return
    const result = commitBuilderState()
    if (result) {
      setDraftLinkState(result.state)
      setDraftLinkOutput(result.output)
    }
    saveSelectedTile({
      linkBuilderState: result?.state,
      dynamicLink: result?.output,
      liveCapturedUrl: draftLiveCapturedUrl,
      linkSource: draftLinkSource,
    })
  }, [
    selectedTile,
    draftTitle,
    draftTitleEditedManually,
    draftStatus,
    draftNotes,
    draftLinkOutput,
    draftLinkState,
    draftExtractedFlags,
    draftFacetBrands,
    draftFacetArticleTypes,
    draftFacetExcludedPluIds,
    draftFacetExcludePercentEnabled,
    draftLiveCapturedUrl,
    draftLinkSource,
    project,
    commitBuilderState,
  ])

  if (beforeSelectRef) {
    beforeSelectRef.current = commitAndSaveSelectedTile
  }

  return {
    vm: {
      draftTitle,
      draftTitleEditedManually,
      draftStatus,
      draftNotes,
      draftLinkState,
      draftLinkOutput,
      draftExtractedFlags,
      draftFacetBrands,
      draftFacetArticleTypes,
      draftFacetExcludedPluIds,
      draftFacetExcludePercentEnabled,
      draftLiveCapturedUrl,
      draftLinkSource,
    },
    actions: {
      setDraftTitle,
      setDraftTitleEditedManually,
      setDraftStatus,
      setDraftNotes,
      setDraftLinkState,
      setDraftLinkOutput,
      setDraftExtractedFlags,
      setDraftFacetBrands,
      setDraftFacetArticleTypes,
      setDraftFacetExcludedPluIds,
      setDraftFacetExcludePercentEnabled,
      setDraftLiveCapturedUrl,
      setDraftLinkSource,
      saveSelectedTile,
      commitAndSaveSelectedTile,
    },
  }
}
