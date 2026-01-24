import type { ReactNode, RefObject } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import DynamicLinkBuilder, {
  type DynamicLinkBuilderHandle,
} from "@/tools/link-builder/DynamicLinkBuilder"
import type { DatasetCache } from "@/lib/catalogueDataset/cache"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"
import type { Region, Tile } from "@/types/project"

type TileBuilderPanelProps = {
  selectedTile: Tile
  awaitingManualLink: boolean
  linkBuilderRef: RefObject<DynamicLinkBuilderHandle | null>
  draftLinkState: LinkBuilderState
  setDraftLinkState: (nextState: LinkBuilderState) => void
  setDraftLinkOutput: (output: string) => void
  projectRegion: Region
  datasetMeta: DatasetCache | null
  onOpenDatasetPanel: () => void
  draftFacetBrands: string[]
  draftFacetArticleTypes: string[]
  setDraftFacetBrands: (value: string[]) => void
  setDraftFacetArticleTypes: (value: string[]) => void
  draftFacetExcludedPluIds: string[]
  setDraftFacetExcludedPluIds: (value: string[]) => void
  draftFacetExcludePercentEnabled: boolean
  setDraftFacetExcludePercentEnabled: (value: boolean) => void
  detectedBrands: string[]
  detectedOfferPercent?: number
  draftLiveCapturedUrl: string
  setDraftLiveCapturedUrl: (value: string) => void
  liveLinkEditable: boolean
  liveLinkInputRef: RefObject<HTMLInputElement | null>
  previewUrl: string
  onPreviewUrlChange: (value: string) => void
  draftActiveLinkMode: "plu" | "facet" | "live"
  setDraftActiveLinkMode: (value: "plu" | "facet" | "live") => void
  isPluAvailable: boolean
  isFacetAvailable: boolean
  isLiveAvailable: boolean
  activeOutput: string
  onOpenPreview: () => void
  onLinkViaPreview: () => void
  previewExtraControls: ReactNode
  manualBaseActions: ReactNode
  extractedPluFlags: boolean[]
  setDraftExtractedFlags: (value: boolean[]) => void
  captureDialogOpen: boolean
  setCaptureDialogOpen: (open: boolean) => void
  onCaptureOnly: () => void
  onConvertCaptured: () => void
  offerDebugOpen: boolean
  setOfferDebugOpen: (value: boolean) => void
  offerTextDebugOpen: boolean
  setOfferTextDebugOpen: (value: boolean) => void
  onReExtractOffer: () => void
}

export default function TileBuilderPanel({
  selectedTile,
  awaitingManualLink,
  linkBuilderRef,
  draftLinkState,
  setDraftLinkState,
  setDraftLinkOutput,
  projectRegion,
  datasetMeta,
  onOpenDatasetPanel,
  draftFacetBrands,
  draftFacetArticleTypes,
  setDraftFacetBrands,
  setDraftFacetArticleTypes,
  draftFacetExcludedPluIds,
  setDraftFacetExcludedPluIds,
  draftFacetExcludePercentEnabled,
  setDraftFacetExcludePercentEnabled,
  detectedBrands,
  detectedOfferPercent,
  draftLiveCapturedUrl,
  setDraftLiveCapturedUrl,
  liveLinkEditable,
  liveLinkInputRef,
  previewUrl,
  onPreviewUrlChange,
  draftActiveLinkMode,
  setDraftActiveLinkMode,
  isPluAvailable,
  isFacetAvailable,
  isLiveAvailable,
  activeOutput,
  onOpenPreview,
  onLinkViaPreview,
  previewExtraControls,
  manualBaseActions,
  extractedPluFlags,
  setDraftExtractedFlags,
  captureDialogOpen,
  setCaptureDialogOpen,
  onCaptureOnly,
  onConvertCaptured,
  offerDebugOpen,
  setOfferDebugOpen,
  offerTextDebugOpen,
  setOfferTextDebugOpen,
  onReExtractOffer,
}: TileBuilderPanelProps) {
  return (
    <>
      <div className="space-y-2">
        {awaitingManualLink ? (
          <div className="text-xs text-muted-foreground">
            Click back into the app to paste into Live Link.
          </div>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label>Dynamic Link Builder</Label>
        <DynamicLinkBuilder
          ref={linkBuilderRef}
          mode="embedded"
          hideHistory
          hideAdpack
          initialState={draftLinkState}
          onChange={setDraftLinkState}
          onOutputChange={setDraftLinkOutput}
          scope={projectRegion}
          dataset={datasetMeta}
          onOpenDatasetPanel={onOpenDatasetPanel}
          facetSelectedBrands={draftFacetBrands}
          facetSelectedArticleTypes={draftFacetArticleTypes}
          onFacetSelectedBrandsChange={setDraftFacetBrands}
          onFacetSelectedArticleTypesChange={setDraftFacetArticleTypes}
          facetExcludedPluIds={draftFacetExcludedPluIds}
          onFacetExcludedPluIdsChange={setDraftFacetExcludedPluIds}
          facetExcludePercentEnabled={draftFacetExcludePercentEnabled}
          onFacetExcludePercentEnabledChange={setDraftFacetExcludePercentEnabled}
          detectedBrands={detectedBrands}
          detectedOfferPercent={detectedOfferPercent}
          allowAutoSeedDetectedBrands={!selectedTile.userHasChosenMode}
          liveLinkUrl={draftLiveCapturedUrl}
          onLiveLinkChange={setDraftLiveCapturedUrl}
          liveLinkEditable={liveLinkEditable}
          liveLinkInputRef={liveLinkInputRef}
          previewUrlValue={previewUrl}
          onPreviewUrlChange={onPreviewUrlChange}
          activeLinkMode={draftActiveLinkMode}
          onActiveLinkModeChange={setDraftActiveLinkMode}
          isPluAvailable={isPluAvailable}
          isFacetAvailable={isFacetAvailable}
          isLiveAvailable={isLiveAvailable}
          outputOverride={activeOutput}
          onOpenPreview={onOpenPreview}
          onLinkViaPreview={onLinkViaPreview}
          previewExtraControls={previewExtraControls}
          manualBaseActions={manualBaseActions}
          extractedPluFlags={extractedPluFlags}
          onExtractedPluFlagsChange={setDraftExtractedFlags}
        />
        <Dialog open={captureDialogOpen} onOpenChange={setCaptureDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply captured link?</DialogTitle>
              <DialogDescription>
                This can overwrite current manual link settings to build a dynamic link.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCaptureOnly}>
                Capture only
              </Button>
              <Button type="button" onClick={onConvertCaptured}>
                Convert to Dynamic
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Offer Debug</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOfferDebugOpen(!offerDebugOpen)}
            >
              {offerDebugOpen ? "Hide" : "Show"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onReExtractOffer}
              disabled={!selectedTile.extractedText}
            >
              Re-extract Offer
            </Button>
          </div>
        </div>
        {offerDebugOpen ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <div className="space-y-1">
              <div>
                <span className="font-medium">Title:</span>{" "}
                {selectedTile.offer?.title ?? "-"}
              </div>
              <div>
                <span className="font-medium">Brand:</span>{" "}
                {selectedTile.offer?.brand?.label ?? "-"}
              </div>
              <div>
                <span className="font-medium">Details:</span>{" "}
                {selectedTile.offer?.productDetails ?? "-"}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Debug: Extracted Text</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOfferTextDebugOpen(!offerTextDebugOpen)}
          >
            {offerTextDebugOpen ? "Hide" : "Show"}
          </Button>
        </div>
        {offerTextDebugOpen ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Offer updated:{" "}
              {selectedTile.offerUpdatedAt
                ? new Date(selectedTile.offerUpdatedAt).toLocaleString()
                : "-"}
            </div>
            {selectedTile.extractedText || selectedTile.offer?.source?.rawText ? (
              <Textarea
                readOnly
                value={
                  selectedTile.extractedText ??
                  selectedTile.offer?.source?.rawText ??
                  ""
                }
                className="min-h-[120px] text-xs"
              />
            ) : (
              <div className="text-xs text-muted-foreground">
                No extracted text stored for this tile.
              </div>
            )}
            {selectedTile.offer?.source?.cleanedText ? (
              <Textarea
                readOnly
                value={selectedTile.offer.source.cleanedText}
                className="min-h-[80px] text-xs"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )
}
