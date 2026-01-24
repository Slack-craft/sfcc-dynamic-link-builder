import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Eraser, FileText, Upload } from "lucide-react"

type DevPanelProps = {
  isDev: boolean
  facetColumnList: string[]
  devDebugOpen: boolean
  onDevDebugOpenChange: (open: boolean) => void
  onClearLegacyExtensionData: () => void
  onExportProjectData: () => void
  onOpenImportDialog: () => void
}

export default function DevPanel({
  isDev,
  facetColumnList,
  devDebugOpen,
  onDevDebugOpenChange,
  onClearLegacyExtensionData,
  onExportProjectData,
  onOpenImportDialog,
}: DevPanelProps) {
  if (!isDev) return null

  return (
    <div className="space-y-2">
      <Separator />
      <Card className="border-dashed">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Dev / Debug</CardTitle>
            <Collapsible open={devDebugOpen} onOpenChange={onDevDebugOpenChange}>
              <CollapsibleTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  {devDebugOpen ? "Hide" : "Show"}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={onClearLegacyExtensionData}>
                    <Eraser className="mr-2 h-4 w-4" />
                    Clear legacy Extension data (DEV)
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onExportProjectData}>
                    <Upload className="mr-2 h-4 w-4" />
                    Export Project Data (DEV)
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onOpenImportDialog}>
                    <FileText className="mr-2 h-4 w-4" />
                    Import Project Data (DEV)
                  </Button>
                </div>
                <div>
                  Facet columns detected:{" "}
                  <span className="font-medium text-foreground">
                    {facetColumnList.length}
                  </span>
                </div>
                {facetColumnList.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wide">
                      Columns
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {facetColumnList.map((col) => (
                        <span
                          key={col}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px]"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>No facet columns detected.</div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardHeader>
      </Card>
    </div>
  )
}
