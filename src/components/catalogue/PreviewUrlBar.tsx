import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ExternalLink, Info, Link2, List, MousePointerClick, SlidersHorizontal } from "lucide-react"

type PreviewUrlBarProps = {
  previewRestValue: string
  onPreviewRestChange: (value: string) => void
  mode: "plu" | "facet" | "live"
  onChangeMode: (mode: "plu" | "facet" | "live") => void
  isPluAvailable: boolean
  isFacetAvailable: boolean
  isLiveAvailable: boolean
  onOpenPreview?: () => void
  onLinkViaPreview?: () => void
  previewStatusText?: string
}

export default function PreviewUrlBar({
  previewRestValue,
  onPreviewRestChange,
  mode,
  onChangeMode,
  isPluAvailable,
  isFacetAvailable,
  isLiveAvailable,
  onOpenPreview,
  onLinkViaPreview,
  previewStatusText,
}: PreviewUrlBarProps) {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TooltipProvider delayDuration={200}>
          <div className="flex min-w-0 flex-1 items-center">
            <div className="inline-flex h-10 items-center rounded-l-md rounded-r-none border border-input bg-background divide-x divide-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onOpenPreview}
                    aria-label="Open Preview"
                    className="h-10 w-10 rounded-none border-0"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open Preview</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onLinkViaPreview}
                    aria-label="Link via Preview"
                    className="h-10 w-10 rounded-none border-0"
                  >
                    <MousePointerClick className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Link via Preview</TooltipContent>
              </Tooltip>
            </div>
            <InputGroup className="h-10 min-w-0 flex-1 -ml-px">
              <InputGroupAddon className="h-10 rounded-none border-r-0 px-0">
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      className="flex h-full w-9 items-center justify-center text-muted-foreground"
                      aria-label="Preview URL info"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent align="start">
                    <div className="space-y-2 text-sm">
                      <div className="font-medium">Preview URL</div>
                      <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                        <li>Opens Preview / Link via Preview</li>
                        <li>Mode controls what URL is built (PLU / Facet / Live)</li>
                        <li>Editing switches to Live</li>
                      </ul>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </InputGroupAddon>
              <InputGroupAddon className="h-10 rounded-none border-l-0 border-r-0 px-0">
                <InputGroupText>https://</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                value={previewRestValue}
                onChange={(event) => onPreviewRestChange(event.target.value)}
                placeholder="Preview URL"
                className="h-10 min-w-0 flex-1 rounded-none px-1 text-xs"
              />
            </InputGroup>
            <div className="inline-flex h-10 items-center border border-input bg-background -ml-px rounded-l-none rounded-r-md divide-x divide-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant={mode === "plu" ? "secondary" : "ghost"}
                    onClick={() => onChangeMode("plu")}
                    disabled={!isPluAvailable}
                    aria-label="PLU Link"
                    className="h-10 w-10 rounded-none border-0"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>PLU Link</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant={mode === "facet" ? "secondary" : "ghost"}
                    onClick={() => onChangeMode("facet")}
                    disabled={!isFacetAvailable}
                    aria-label="Facet Link"
                    className="h-10 w-10 rounded-none border-0"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Facet Link</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant={mode === "live" ? "secondary" : "ghost"}
                    onClick={() => onChangeMode("live")}
                    disabled={!isLiveAvailable}
                    aria-label="Live Link"
                    className="h-10 w-10 rounded-l-none rounded-r-md border-0"
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Live Link</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {previewStatusText ? <span>{previewStatusText}</span> : null}
      </div>
    </>
  )
}
