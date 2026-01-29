import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle2, ListTodo, Timer, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
  canReExtractOffer?: boolean
  isReExtractingOffer?: boolean
  onDeleteTile?: () => void
  canDeleteTile?: boolean
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
  canReExtractOffer = true,
  isReExtractingOffer = false,
  onDeleteTile,
  canDeleteTile = true,
}: TileDetailsCardProps) {
  const [reExtractOpen, setReExtractOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="py-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Tile Details</CardTitle>
          {onDeleteTile ? (
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogTrigger asChild>
                <Button type="button" size="icon" variant="outline" disabled={!canDeleteTile} aria-label="Delete tile">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this tile?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this tile and its extracted data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setDeleteOpen(false)
                      onDeleteTile()
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete tile
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
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
        <div className="grid gap-3">
          <div className="space-y-2 hidden">
            <Label htmlFor="tile-status">Status</Label>
            <div className="inline-flex rounded-md border border-input bg-background">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={status === "todo" ? "default" : "outline"}
                      size="icon"
                      className="h-10 w-10 rounded-l-md rounded-r-none border-0"
                      onClick={() => onChangeStatus("todo")}
                      aria-label="To Do"
                    >
                      <ListTodo className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>To Do</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={status === "in_progress" ? "default" : "outline"}
                      size="icon"
                      className="h-10 w-10 rounded-none border-0"
                      onClick={() => onChangeStatus("in_progress")}
                      aria-label="In Progress"
                    >
                      <Timer className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>In Progress</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={status === "needs_review" ? "default" : "outline"}
                      size="icon"
                      className="h-10 w-10 rounded-none border-0"
                      onClick={() => onChangeStatus("needs_review")}
                      aria-label="Needs Review"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Needs Review</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={status === "done" ? "default" : "outline"}
                      size="icon"
                      className="h-10 w-10 rounded-l-none rounded-r-md border-0"
                      onClick={() => onChangeStatus("done")}
                      aria-label="Done"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Done</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <select
              id="tile-status"
              value={status}
              onChange={(event) => onChangeStatus(event.target.value as TileStatus)}
              className="hidden"
            >
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="needs_review">Needs review</option>
              <option value="done">Done</option>
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
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setReExtractOpen(true)}
                  disabled={!canReExtractOffer}
                >
                  Re-extract offer
                </Button>
                <AlertDialog open={reExtractOpen} onOpenChange={setReExtractOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Re-extract offer from PDF?</AlertDialogTitle>
                      <AlertDialogDescription>
                        <div className="space-y-2">
                          <div>Re-extract reads text from the matched PDF rectangle (not the tile image).</div>
                          <div>If the PDF hasn’t been updated, results may not change.</div>
                          <div>
                            This may overwrite extracted fields (e.g., PLUs / detected % / detected brands / detected title). It will not change your link builder settings or notes.
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setReExtractOpen(false)
                          onReExtractOffer()
                        }}
                        disabled={isReExtractingOffer}
                      >
                        Re-extract
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
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
