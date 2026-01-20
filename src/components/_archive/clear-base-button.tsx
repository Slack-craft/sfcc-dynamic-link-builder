import { Button } from "@/components/ui/button"

type ClearBaseButtonProps = {
  onClear: () => void
}

// Archived UI: previously used in Dynamic Link Builder.
export function ClearBaseButton({ onClear }: ClearBaseButtonProps) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClear}>
      Clear base
    </Button>
  )
}
