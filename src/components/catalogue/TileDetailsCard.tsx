import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { TileStatus } from "@/types/project"

type TileDetailsCardProps = {
  title: string
  onChangeTitle: (value: string) => void
  brandLabel?: string | null
  percentOffRaw?: string | null
  detectedBrands: string[]
  status: TileStatus
  onChangeStatus: (status: TileStatus) => void
  finalDynamicLink: string
  notes: string
  onChangeNotes: (value: string) => void
  imageUpdatedSinceExtraction?: boolean
  onReExtractOffer?: () => void
}

export default function TileDetailsCard({
  title,
  onChangeTitle,
  brandLabel,
  percentOffRaw,
  detectedBrands,
  status,
  onChangeStatus,
  finalDynamicLink,
  notes,
  onChangeNotes,
  imageUpdatedSinceExtraction,
  onReExtractOffer,
}: TileDetailsCardProps) {
  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="text-sm">Tile Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="tile-title">Title</Label>
          <Input
            id="tile-title"
            value={title}
            onChange={(event) => onChangeTitle(event.target.value)}
            placeholder="Tile title"
          />
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Brand: {brandLabel ?? "-"}</span>
            <span>% Off: {percentOffRaw ?? "-"}</span>
            <span>
              Detected Brands:{" "}
              {detectedBrands.length > 0 ? detectedBrands.join(", ") : "-"}
            </span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tile-status">Status</Label>
            <select
              id="tile-status"
              value={status}
              onChange={(event) => onChangeStatus(event.target.value as TileStatus)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
              <option value="needs_review">Needs review</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Final Dynamic Link</Label>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs text-muted-foreground flex items-center overflow-hidden">
                    <span className="truncate font-mono">
                      {finalDynamicLink || "—"}
                    </span>
                  </div>
                </TooltipTrigger>
                {finalDynamicLink ? (
                  <TooltipContent className="max-w-[420px] break-all">
                    {finalDynamicLink}
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        {imageUpdatedSinceExtraction ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">Image updated</Badge>
            <span>Re-extract recommended</span>
            {onReExtractOffer ? (
              <Button type="button" size="sm" variant="outline" onClick={onReExtractOffer}>
                Re-extract offer
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="tile-notes">Notes</Label>
          <Textarea
            id="tile-notes"
            value={notes}
            onChange={(event) => onChangeNotes(event.target.value)}
            placeholder="Notes for this tile"
            className="min-h-[120px]"
          />
        </div>
      </CardContent>
    </Card>
  )
}
