import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FileText, Trash2, Upload } from "lucide-react"

type DatasetDropdownMenuProps = {
  datasetLoaded: boolean
  datasetName?: string
  onUpload: () => void
  onViewDetails: () => void
  onClear: () => void
}

export default function DatasetDropdownMenu({
  datasetLoaded,
  datasetName,
  onUpload,
  onViewDetails,
  onClear,
}: DatasetDropdownMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          Project Dataset
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onUpload}>
          <Upload className="mr-2 h-4 w-4" />
          {datasetLoaded ? "Upload/Replace Dataset" : "Upload Dataset"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewDetails} disabled={!datasetLoaded}>
          <FileText className="mr-2 h-4 w-4" />
          View Dataset Details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onClear}
          disabled={!datasetLoaded}
          className="text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Clear Dataset
        </DropdownMenuItem>
        {datasetLoaded && datasetName ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            {datasetName}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
