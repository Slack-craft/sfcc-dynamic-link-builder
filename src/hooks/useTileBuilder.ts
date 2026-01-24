import { useCallback, useEffect, useMemo, useState } from "react"
import type { Region, Tile } from "@/tools/catalogue-builder/catalogueTypes"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"
import { buildFacetQueryFromSelections } from "@/lib/catalogue/facets"
import {
  buildDynamicOutputFromState,
  buildPreviewUrlFromState,
  createEmptyLinkBuilderState,
} from "@/lib/catalogue/link"

type UseTileBuilderParams = {
  selectedTile: Tile | null
  linkState: LinkBuilderState
  projectRegion?: Region
  liveCapturedUrl: string
  setLiveCapturedUrl: (value: string) => void
}

export default function useTileBuilder({
  selectedTile,
  linkState,
  projectRegion,
  liveCapturedUrl,
  setLiveCapturedUrl,
}: UseTileBuilderParams) {
  const [draftActiveLinkMode, setDraftActiveLinkMode] = useState<"plu" | "facet" | "live">(
    "plu"
  )
  const [draftUserHasChosenMode, setDraftUserHasChosenMode] = useState(false)
  const [draftFacetBrands, setDraftFacetBrands] = useState<string[]>([])
  const [draftFacetArticleTypes, setDraftFacetArticleTypes] = useState<string[]>([])

  useEffect(() => {
    if (!selectedTile) {
      setDraftActiveLinkMode("plu")
      setDraftUserHasChosenMode(false)
      setDraftFacetBrands([])
      setDraftFacetArticleTypes([])
      return
    }
    const nextLinkState = selectedTile.linkBuilderState ?? createEmptyLinkBuilderState()
    const tileHasPlu = nextLinkState.plus.some((plu) => plu.trim().length > 0)
    const storedMode = selectedTile.activeLinkMode
    const storedChosen = selectedTile.userHasChosenMode ?? false
    const defaultMode = tileHasPlu ? "plu" : "facet"
    setDraftActiveLinkMode(storedChosen ? storedMode ?? defaultMode : defaultMode)
    setDraftUserHasChosenMode(storedChosen)
    setDraftFacetBrands(selectedTile.facetBuilder?.selectedBrands ?? [])
    setDraftFacetArticleTypes(selectedTile.facetBuilder?.selectedArticleTypes ?? [])
  }, [selectedTile])

  const facetQuery = useMemo(
    () => buildFacetQueryFromSelections(draftFacetBrands, draftFacetArticleTypes),
    [draftFacetBrands, draftFacetArticleTypes]
  )

  const pluCount = useMemo(
    () => linkState.plus.filter((plu) => plu.trim().length > 0).length,
    [linkState.plus]
  )
  const isPluAvailable = pluCount > 0
  const isFacetAvailable = true
  const isLiveAvailable = liveCapturedUrl.trim().length > 0

  const candidatePluUrl = useMemo(
    () => buildPreviewUrlFromState(linkState, projectRegion, ""),
    [linkState, projectRegion]
  )
  const candidateFacetUrl = useMemo(
    () => buildPreviewUrlFromState(linkState, projectRegion, facetQuery, true),
    [linkState, facetQuery, projectRegion]
  )
  const candidateLiveUrl = useMemo(() => liveCapturedUrl.trim(), [liveCapturedUrl])

  useEffect(() => {
    const availableModes: Array<"plu" | "facet" | "live"> = []
    if (isPluAvailable) availableModes.push("plu")
    if (isFacetAvailable) availableModes.push("facet")
    if (isLiveAvailable) availableModes.push("live")

    if (draftUserHasChosenMode) {
      if (!availableModes.includes(draftActiveLinkMode)) {
        const nextMode = availableModes[0] ?? "plu"
        setDraftActiveLinkMode(nextMode)
      }
      return
    }

    if (availableModes.includes("plu")) {
      setDraftActiveLinkMode("plu")
    } else if (availableModes.includes("facet")) {
      setDraftActiveLinkMode("facet")
    } else if (availableModes.includes("live")) {
      setDraftActiveLinkMode("live")
    }
  }, [
    draftActiveLinkMode,
    draftUserHasChosenMode,
    isFacetAvailable,
    isLiveAvailable,
    isPluAvailable,
  ])

  const previewUrl = useMemo(() => {
    if (draftActiveLinkMode === "live" && candidateLiveUrl) return candidateLiveUrl
    if (draftActiveLinkMode === "facet") return candidateFacetUrl
    return candidatePluUrl
  }, [candidateFacetUrl, candidateLiveUrl, candidatePluUrl, draftActiveLinkMode])

  function computeOutputForMode(
    state: LinkBuilderState,
    mode: "plu" | "facet" | "live",
    query: string
  ) {
    if (mode === "live") return "Live mode does not convert yet."
    if (mode === "facet") {
      return buildDynamicOutputFromState({ ...state, plus: [] }, query)
    }
    return buildDynamicOutputFromState(state, "")
  }

  const activeOutput = useMemo(
    () => computeOutputForMode(linkState, draftActiveLinkMode, facetQuery),
    [draftActiveLinkMode, linkState, facetQuery]
  )

  const onPreviewUrlChange = useCallback(
    (value: string) => {
      setLiveCapturedUrl(value)
      setDraftActiveLinkMode("live")
      setDraftUserHasChosenMode(true)
    },
    [setLiveCapturedUrl]
  )

  return {
    draftActiveLinkMode,
    setDraftActiveLinkMode,
    draftUserHasChosenMode,
    setDraftUserHasChosenMode,
    draftFacetBrands,
    setDraftFacetBrands,
    draftFacetArticleTypes,
    setDraftFacetArticleTypes,
    isPluAvailable,
    isFacetAvailable,
    isLiveAvailable,
    previewUrl,
    onPreviewUrlChange,
    facetQuery,
    activeOutput,
  }
}
